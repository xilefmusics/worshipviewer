use std::sync::{Mutex, OnceLock};

use base64::{Engine as _, engine::general_purpose::URL_SAFE_NO_PAD};
use cookie::{Cookie, SameSite};
use keyring::Entry;
use reqwest::{Client, StatusCode, redirect::Policy};
use ring::digest::{SHA256, digest};
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, WebviewWindow};
use tauri_plugin_deep_link::DeepLinkExt;
use url::Url;
use uuid::Uuid;

const APP_ORIGIN: &str = "https://app.worshipviewer.com";
const KEYRING_SERVICE: &str = "com.worshipviewer.app";
const KEYRING_ACCOUNT: &str = "pending-native-google-login";
const AUTH_ERROR_EVENT: &str = "native-auth-error";

static SEEN_NATIVE_STATE: OnceLock<Mutex<Option<String>>> = OnceLock::new();

#[derive(Serialize)]
struct NativeExchangeRequest<'a> {
    code: &'a str,
    state: &'a str,
    code_verifier: &'a str,
}

#[derive(Serialize, serde::Deserialize)]
struct PendingLogin {
    state: String,
    verifier: String,
}

#[tauri::command]
async fn start_native_google_login(window: WebviewWindow) -> Result<(), String> {
    let origin = app_origin(&window)?;
    let state = Uuid::new_v4().simple().to_string();
    let verifier = format!("{}{}", Uuid::new_v4().simple(), Uuid::new_v4().simple());
    let challenge = URL_SAFE_NO_PAD.encode(digest(&SHA256, verifier.as_bytes()).as_ref());

    let pending = serde_json::to_string(&PendingLogin {
        state: state.clone(),
        verifier,
    })
    .map_err(|_| "could not prepare Google sign-in".to_owned())?;
    credential_entry()?
        .set_password(&pending)
        .map_err(|_| "could not access the system credential store".to_owned())?;

    let mut login_url = origin;
    login_url.set_path("/auth/native/login");
    login_url
        .query_pairs_mut()
        .append_pair("state", &state)
        .append_pair("code_challenge", &challenge);

    tauri_plugin_opener::open_url(login_url.as_str(), None::<&str>)
        .map_err(|_| "could not open the system browser".to_owned())
}

fn app_origin(window: &WebviewWindow) -> Result<Url, String> {
    let current = window
        .url()
        .map_err(|_| "could not identify the app origin".to_owned())?;

    if cfg!(debug_assertions)
        && current.scheme() == "http"
        && matches!(current.host_str(), Some("127.0.0.1" | "localhost"))
        && current.port() == Some(5173)
    {
        let mut origin = current;
        origin.set_path("/");
        origin.set_query(None);
        origin.set_fragment(None);
        return Ok(origin);
    }

    if current.scheme() == "https" && current.host_str() == Some("app.worshipviewer.com") {
        return Url::parse(APP_ORIGIN).map_err(|_| "invalid app origin".to_owned());
    }

    Err("Google sign-in is unavailable from this page".to_owned())
}

fn credential_entry() -> Result<Entry, String> {
    Entry::new(KEYRING_SERVICE, KEYRING_ACCOUNT)
        .map_err(|_| "could not access the system credential store".to_owned())
}

fn clear_pending_login(state: &str) {
    let Ok(entry) = credential_entry() else {
        return;
    };
    let Ok(pending_json) = entry.get_password() else {
        return;
    };
    let Ok(pending) = serde_json::from_str::<PendingLogin>(&pending_json) else {
        return;
    };
    if pending.state == state {
        let _ = entry.delete_credential();
    }
}

fn handle_deep_link(app: &AppHandle, url: Url) {
    if url.scheme() != "worshipviewer"
        || url.host_str() != Some("auth")
        || url.path() != "/callback"
    {
        return;
    }

    let mut code = None;
    let mut state = None;
    let mut failed = false;
    for (key, value) in url.query_pairs() {
        match key.as_ref() {
            "code" if code.is_none() => code = Some(value.into_owned()),
            "state" if state.is_none() => state = Some(value.into_owned()),
            "error" => failed = true,
            _ => {}
        }
    }

    let Some(state) = state else {
        emit_auth_error(app);
        return;
    };
    if !pending_login_matches(&state) {
        return;
    }
    if !remember_callback_state(&state) {
        return;
    }

    if failed {
        clear_pending_login(&state);
        emit_auth_error(app);
        return;
    }

    let Some(code) = code else {
        clear_pending_login(&state);
        emit_auth_error(app);
        return;
    };

    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        if exchange_native_code(&app, &code, &state).await.is_err() {
            clear_pending_login(&state);
            emit_auth_error(&app);
        }
    });
}

fn pending_login_matches(state: &str) -> bool {
    credential_entry()
        .and_then(|entry| {
            entry
                .get_password()
                .map_err(|_| "no pending login".to_owned())
        })
        .and_then(|value| {
            serde_json::from_str::<PendingLogin>(&value)
                .map_err(|_| "invalid pending login".to_owned())
        })
        .is_ok_and(|pending| pending.state == state)
}

fn remember_callback_state(state: &str) -> bool {
    let seen = SEEN_NATIVE_STATE.get_or_init(|| Mutex::new(None));
    seen.lock()
        .map(|mut seen_state| {
            if seen_state.as_deref() == Some(state) {
                false
            } else {
                *seen_state = Some(state.to_owned());
                true
            }
        })
        .unwrap_or(false)
}

async fn exchange_native_code(app: &AppHandle, code: &str, state: &str) -> Result<(), ()> {
    let pending_json = credential_entry()
        .and_then(|entry| {
            entry
                .get_password()
                .map_err(|_| "no pending login".to_owned())
        })
        .map_err(|_| ())?;
    let pending: PendingLogin = serde_json::from_str(&pending_json).map_err(|_| ())?;
    if pending.state != state {
        return Err(());
    }

    let window = app.get_webview_window("main").ok_or(())?;
    let origin = app_origin(&window).map_err(|_| ())?;
    let mut exchange_url = origin;
    exchange_url.set_path("/auth/native/exchange");
    exchange_url.set_query(None);
    let secure_origin = exchange_url.scheme() == "https";

    let client = Client::builder()
        .redirect(Policy::none())
        .build()
        .map_err(|_| ())?;
    let response = client
        .post(exchange_url)
        .json(&NativeExchangeRequest {
            code,
            state,
            code_verifier: &pending.verifier,
        })
        .send()
        .await
        .map_err(|_| ())?;
    if response.status() != StatusCode::NO_CONTENT {
        return Err(());
    }

    let cookie_header = response
        .headers()
        .get(reqwest::header::SET_COOKIE)
        .and_then(|value| value.to_str().ok())
        .ok_or(())?;
    let cookie = Cookie::parse(cookie_header.to_owned())
        .map_err(|_| ())?
        .into_owned();
    if !cookie.http_only().unwrap_or(false)
        || cookie.path() != Some("/")
        || cookie.same_site() != Some(SameSite::Lax)
        || (secure_origin && !cookie.secure().unwrap_or(false))
    {
        return Err(());
    }

    window.set_cookie(cookie).map_err(|_| ())?;
    if let Ok(entry) = credential_entry() {
        let _ = entry.delete_credential();
    }
    window.reload().map_err(|_| ())?;
    Ok(())
}

fn emit_auth_error(app: &AppHandle) {
    let _ = app.emit(AUTH_ERROR_EVENT, ());
}

pub fn run() {
    let builder = tauri::Builder::default()
        // This plugin must be first so protocol launches are forwarded into the running app.
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            for arg in args {
                if let Ok(url) = Url::parse(&arg) {
                    handle_deep_link(app, url);
                }
            }
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![start_native_google_login]);

    builder
        .setup(|app| {
            #[cfg(any(target_os = "linux", all(debug_assertions, windows)))]
            app.deep_link().register_all()?;

            if let Some(urls) = app.deep_link().get_current()? {
                for url in urls {
                    handle_deep_link(app.handle(), url);
                }
            }

            let handle = app.handle().clone();
            app.deep_link().on_open_url(move |event| {
                for url in event.urls() {
                    handle_deep_link(&handle, url.clone());
                }
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("failed to run Worship Viewer desktop app");
}
