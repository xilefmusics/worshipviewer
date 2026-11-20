use std::sync::Arc;

use actix_web::{
    HttpResponse,
    cookie::{Cookie, SameSite},
    get,
    http::header,
    post,
    web::{self, Data},
};
use chrono::{Duration as ChronoDuration, Utc};
use openidconnect::core::CoreAuthenticationFlow;
use openidconnect::{
    AuthorizationCode, CsrfToken, Nonce, PkceCodeChallenge, PkceCodeVerifier, Scope, TokenResponse,
};
use serde::{Deserialize, Serialize};
use time::Duration as CookieDuration;
use tracing::instrument;
use utoipa::{IntoParams, ToSchema};
use uuid::Uuid;

use super::{
    Model as OidcModel, NativeLoginHandoff, OidcClients, OidcProvider, PendingNativeLogin,
    PendingOidc,
};
use crate::auth::load_authorization_context_for_user;
use crate::database::Database;
#[allow(unused_imports)]
use crate::docs::Problem;
use crate::error::AppError;
use crate::resources::Session;
use crate::resources::blob::service::BlobServiceHandle;
use crate::resources::user::service::UserServiceHandle;
use crate::resources::user::session::service::SessionServiceHandle;
use crate::settings::{CookieConfig, ProfilePictureLimits};

#[utoipa::path(
    get,
    path = "/auth/login",
    params(LoginQuery),
    responses(
        (status = 302, description = "Redirect to OIDC provider login page"),
        (status = 400, description = "Invalid login request", body = Problem, content_type = "application/problem+json"),
        (status = 429, description = "Rate limit exceeded; slow down and retry", body = Problem, content_type = "application/problem+json"),
        (status = 500, description = "Failed to prepare login flow", body = Problem, content_type = "application/problem+json")
    ),
    tag = "Auth"
)]
#[instrument(level = "debug", err, skip_all, fields(provider = "google"))]
#[get("/login")]
async fn login(
    db: Data<Database>,
    oidc_clients: Data<Arc<OidcClients>>,
    query: web::Query<LoginQuery>,
) -> Result<HttpResponse, AppError> {
    begin_login(
        db.get_ref(),
        oidc_clients.get_ref(),
        query.redirect_to.as_deref().and_then(sanitize_redirect),
        None,
    )
    .await
}

#[utoipa::path(
    get,
    path = "/auth/native/login",
    params(NativeLoginQuery),
    responses(
        (status = 302, description = "Open the configured OIDC provider in the system browser"),
        (status = 400, description = "Invalid native OAuth state or PKCE challenge", body = Problem, content_type = "application/problem+json"),
        (status = 429, description = "Rate limit exceeded; slow down and retry", body = Problem, content_type = "application/problem+json"),
        (status = 500, description = "Failed to prepare login flow", body = Problem, content_type = "application/problem+json")
    ),
    tag = "Auth"
)]
#[instrument(level = "debug", err, skip_all, fields(provider = "google"))]
#[get("/native/login")]
pub async fn native_login_endpoint(
    db: Data<Database>,
    oidc_clients: Data<Arc<OidcClients>>,
    query: web::Query<NativeLoginQuery>,
) -> Result<HttpResponse, AppError> {
    if !is_valid_native_state(&query.state) || !is_valid_pkce_challenge(&query.code_challenge) {
        return Err(AppError::invalid_request(
            "invalid native OAuth state or PKCE challenge",
        ));
    }

    begin_login(
        db.get_ref(),
        oidc_clients.get_ref(),
        None,
        Some(PendingNativeLogin {
            state: query.state.clone(),
            code_challenge: query.code_challenge.clone(),
        }),
    )
    .await
}

async fn begin_login(
    db: &Database,
    oidc_clients: &OidcClients,
    redirect_hint: Option<String>,
    native_login: Option<PendingNativeLogin>,
) -> Result<HttpResponse, AppError> {
    db.cleanup_expired_oidc_states().await?;

    let provider = OidcProvider::Google;
    let registration = oidc_clients
        .get(&provider)
        .ok_or_else(|| AppError::invalid_request("oauth provider not configured"))?;
    let oidc_client = registration.client();
    let (challenge, verifier) = PkceCodeChallenge::new_random_sha256();

    let mut auth_url = oidc_client.authorize_url(
        CoreAuthenticationFlow::AuthorizationCode,
        CsrfToken::new_random,
        Nonce::new_random,
    );
    auth_url = auth_url.set_pkce_challenge(challenge);
    for scope in registration.scopes() {
        auth_url = auth_url.add_scope(Scope::new(scope.into()));
    }

    let (url, csrf, nonce) = auth_url.url();
    let now = Utc::now();
    let expires_at = now + ChronoDuration::seconds(600);
    db.remember_oidc_state(
        csrf.secret(),
        PendingOidc {
            pkce_verifier: verifier,
            nonce,
            redirect_to: redirect_hint,
            native_login,
            created_at: now,
            expires_at,
            provider,
        },
    )
    .await?;

    Ok(HttpResponse::Found()
        .append_header((header::LOCATION, url.as_ref()))
        .finish())
}

#[utoipa::path(
    get,
    path = "/auth/callback",
    params(AuthCallbackQuery),
    responses(
        (status = 302, description = "Successful web login or native callback; redirects to the frontend or desktop app"),
        (status = 400, description = "Invalid OIDC state", body = Problem, content_type = "application/problem+json"),
        (status = 401, description = "OIDC user info missing required claims", body = Problem, content_type = "application/problem+json"),
        (status = 500, description = "OIDC provider or database error", body = Problem, content_type = "application/problem+json")
    ),
    tag = "Auth"
)]
#[instrument(level = "debug", err, skip_all, fields(provider = "google"))]
#[get("/callback")]
#[allow(clippy::too_many_arguments)] // Actix injects one `Data<_>` per dependency.
async fn callback(
    db: Data<Database>,
    user_svc: Data<UserServiceHandle>,
    session_svc: Data<SessionServiceHandle>,
    blob_svc: Data<BlobServiceHandle>,
    pic_limits: Data<ProfilePictureLimits>,
    oidc_clients: Data<Arc<OidcClients>>,
    cookie_cfg: Data<CookieConfig>,
    query: web::Query<AuthCallbackQuery>,
) -> Result<HttpResponse, AppError> {
    db.cleanup_expired_oidc_states().await?;
    let pending = match db.take_oidc_state(&query.state).await? {
        Some(p) => p,
        None => {
            crate::audit!(
                "audit.auth.login.failure",
                provider = tracing::field::display(&"google"),
                reason = tracing::field::display(&"invalid_oidc_state")
                ; "oidc login failed"
            );
            return Err(AppError::invalid_state());
        }
    };

    let PendingOidc {
        pkce_verifier,
        nonce,
        redirect_to,
        native_login,
        created_at: _,
        expires_at: _,
        provider,
    } = pending;

    if query.error.is_some() {
        if let Some(native_login) = native_login {
            return Ok(HttpResponse::Found()
                .append_header((
                    header::LOCATION,
                    native_error_callback_url(&native_login.state),
                ))
                .append_header((header::CACHE_CONTROL, "no-store"))
                .append_header((header::REFERRER_POLICY, "no-referrer"))
                .finish());
        }
        return Err(AppError::invalid_request(
            "Google did not authorize sign-in",
        ));
    }

    let code = query
        .code
        .as_ref()
        .ok_or_else(|| AppError::invalid_request("provider response missing code"))?;

    let oidc_clients = oidc_clients.get_ref();
    let registration = match oidc_clients.get(&provider) {
        Some(r) => r,
        None => {
            crate::audit!(
                "audit.auth.login.failure",
                provider = tracing::field::display(&"google"),
                reason = tracing::field::display(&"provider_not_configured")
                ; "oidc login failed"
            );
            return Err(AppError::invalid_request("oauth provider not configured"));
        }
    };
    let oidc_client = registration.client();
    let http = registration.http();

    let mut token_request = oidc_client
        .exchange_code(AuthorizationCode::new(code.clone()))
        .map_err(|e| crate::log_and_convert!(AppError::oidc, "oidc.exchange_code", e))?;
    token_request = token_request.set_pkce_verifier(pkce_verifier);

    let token_response = token_request.request_async(http).await.map_err(|e| {
        crate::audit!(
            "audit.auth.login.failure",
            provider = tracing::field::display(&"google"),
            reason = tracing::field::display(&"token_exchange_failed")
            ; "oidc login failed"
        );
        crate::log_and_convert!(AppError::oidc, "oidc.token_exchange", e)
    })?;

    let id_token = match token_response.id_token() {
        Some(t) => t,
        None => {
            crate::audit!(
                "audit.auth.login.failure",
                provider = tracing::field::display(&"google"),
                reason = tracing::field::display(&"missing_id_token")
                ; "oidc login failed"
            );
            return Err(AppError::invalid_request(
                "provider response missing id_token",
            ));
        }
    };

    let claims = id_token
        .claims(&oidc_client.id_token_verifier(), &nonce)
        .map_err(|e| {
            crate::audit!(
                "audit.auth.login.failure",
                provider = tracing::field::display(&"google"),
                reason = tracing::field::display(&"id_token_invalid")
                ; "oidc login failed"
            );
            crate::log_and_convert!(AppError::oidc, "oidc.id_token_claims", e)
        })?;

    let Some(email_addr) = claims.email() else {
        crate::audit!(
            "audit.auth.login.failure",
            provider = tracing::field::display(&"google"),
            reason = tracing::field::display(&"missing_email_claim")
            ; "oidc login failed"
        );
        return Err(AppError::Unauthorized);
    };

    let picture_url = claims
        .picture()
        .and_then(|p| p.get(None))
        .map(|u| u.to_string());

    let user = match user_svc
        .get_user_by_email_or_create(email_addr.as_str())
        .await
    {
        Ok(u) => u,
        Err(e) => {
            crate::audit!(
                "audit.auth.login.failure",
                provider = tracing::field::display(&"google"),
                reason = tracing::field::display(&"user_provision_failed"),
                email_hash = tracing::field::display(
                    &crate::observability::audit_email_hash(email_addr.as_str())
                )
                ; "oidc login failed"
            );
            return Err(e);
        }
    };

    let auth_ctx = load_authorization_context_for_user(db.get_ref(), &user.id)
        .await?
        .ok_or_else(|| AppError::database("bootstrap authorization context missing"))?;

    let _ = user_svc
        .cache_oauth_profile_picture_if_needed(
            blob_svc.get_ref(),
            &auth_ctx,
            picture_url,
            pic_limits.max_bytes,
        )
        .await;

    let user = match user_svc.get_user(&user.id).await {
        Ok(u) => u,
        Err(e) => {
            crate::audit!(
                "audit.auth.login.failure",
                provider = tracing::field::display(&"google"),
                reason = tracing::field::display(&"user_reload_failed"),
                email_hash = tracing::field::display(
                    &crate::observability::audit_email_hash(email_addr.as_str())
                )
                ; "oidc login failed"
            );
            return Err(e);
        }
    };

    let session = match session_svc
        .create_session(Session::new(
            user.clone(),
            cookie_cfg.session_ttl_seconds as i64,
        ))
        .await
    {
        Ok(s) => s,
        Err(e) => {
            crate::audit!(
                "audit.auth.login.failure",
                provider = tracing::field::display(&"google"),
                reason = tracing::field::display(&"session_create_failed"),
                email_hash = tracing::field::display(
                    &crate::observability::audit_email_hash(email_addr.as_str())
                )
                ; "oidc login failed"
            );
            return Err(e);
        }
    };

    crate::audit!(
        "audit.auth.login.success",
        provider = tracing::field::display(&"google"),
        user_id = tracing::field::display(&user.id),
        session_id = tracing::field::display(&session.id)
        ; "login succeeded"
    );

    if let Some(native_login) = native_login {
        let code = Uuid::new_v4().simple().to_string();
        let created_at = Utc::now();
        db.remember_native_handoff(
            &code,
            NativeLoginHandoff {
                session_id: session.id,
                state: native_login.state.clone(),
                code_challenge: native_login.code_challenge,
                created_at,
                expires_at: created_at + ChronoDuration::seconds(NATIVE_HANDOFF_TTL_SECONDS),
            },
        )
        .await?;

        return Ok(HttpResponse::Found()
            .append_header((
                header::LOCATION,
                native_callback_url(&code, &native_login.state),
            ))
            .append_header((header::CACHE_CONTROL, "no-store"))
            .append_header((header::REFERRER_POLICY, "no-referrer"))
            .finish());
    }

    let redirect_target =
        resolve_frontend_redirect(&cookie_cfg.post_login_path, redirect_to.as_deref());
    Ok(HttpResponse::Found()
        .append_header((header::LOCATION, redirect_target))
        .cookie(session_cookie(&session.id, &cookie_cfg))
        .finish())
}

const NATIVE_HANDOFF_TTL_SECONDS: i64 = 120;

fn native_callback_url(code: &str, state: &str) -> String {
    format!("worshipviewer://auth/callback?code={code}&state={state}")
}

fn native_error_callback_url(state: &str) -> String {
    format!("worshipviewer://auth/callback?error=auth_failed&state={state}")
}

fn is_valid_native_state(value: &str) -> bool {
    (22..=128).contains(&value.len())
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'_' | b'-'))
}

fn is_valid_pkce_challenge(value: &str) -> bool {
    value.len() == 43
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'_' | b'-'))
}

fn is_valid_pkce_verifier(value: &str) -> bool {
    (43..=128).contains(&value.len())
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'.' | b'_' | b'~'))
}

#[utoipa::path(
    post,
    path = "/auth/native/exchange",
    request_body = NativeExchangeRequest,
    responses(
        (status = 204, description = "Native handoff consumed; the session cookie is set for the requesting app webview"),
        (status = 400, description = "Malformed handoff request", body = Problem, content_type = "application/problem+json"),
        (status = 401, description = "Handoff is invalid, expired, or already used", body = Problem, content_type = "application/problem+json"),
        (status = 500, description = "Failed to establish app session", body = Problem, content_type = "application/problem+json")
    ),
    tag = "Auth"
)]
#[instrument(level = "debug", err, skip_all, fields(provider = "native"))]
#[post("/native/exchange")]
pub async fn native_exchange(
    db: Data<Database>,
    session_svc: Data<SessionServiceHandle>,
    cookie_cfg: Data<CookieConfig>,
    payload: web::Json<NativeExchangeRequest>,
) -> Result<HttpResponse, AppError> {
    if !is_valid_native_state(&payload.state)
        || !is_valid_pkce_verifier(&payload.code_verifier)
        || payload.code.is_empty()
        || payload.code.len() > 128
    {
        return Err(AppError::invalid_request("invalid native login handoff"));
    }

    let verifier = PkceCodeVerifier::new(payload.code_verifier.clone());
    let challenge = PkceCodeChallenge::from_code_verifier_sha256(&verifier);
    let handoff = db
        .take_native_handoff(&payload.code, &payload.state, challenge.as_str())
        .await?
        .ok_or(AppError::Unauthorized)?;

    let session = session_svc
        .get_session(&handoff.session_id)
        .await
        .map_err(|_| AppError::Unauthorized)?;
    if session.expires_at <= Utc::now() {
        return Err(AppError::Unauthorized);
    }

    Ok(HttpResponse::NoContent()
        .append_header((header::CACHE_CONTROL, "no-store"))
        .cookie(session_cookie(&session.id, &cookie_cfg))
        .finish())
}

fn session_cookie(session_id: &str, cfg: &CookieConfig) -> Cookie<'static> {
    let mut builder = Cookie::build(cfg.name.clone(), session_id.to_owned())
        .http_only(true)
        .same_site(SameSite::Lax)
        .path("/")
        .secure(cfg.secure);

    if cfg.session_ttl_seconds > 0 {
        builder = builder.max_age(CookieDuration::seconds(cfg.session_ttl_seconds as i64));
    }

    builder.finish()
}

fn sanitize_redirect(path: &str) -> Option<String> {
    let trimmed = path.trim();
    if trimmed.is_empty()
        || !trimmed.starts_with('/')
        || trimmed.starts_with("//")
        || trimmed.starts_with("/http")
    {
        None
    } else {
        Some(trimmed.to_string())
    }
}

#[derive(Debug, Deserialize, IntoParams)]
#[into_params(parameter_in = Query)]
struct LoginQuery {
    /// Optional same-origin path (`/…`) to use after login. Must start with `/` and must not be `//…` or `/http…`; otherwise it is ignored and the default post-login path is used (see `sanitize_redirect`).
    #[serde(default)]
    #[param(required = false)]
    redirect_to: Option<String>,
}

#[derive(Debug, Deserialize, IntoParams)]
#[into_params(parameter_in = Query)]
struct NativeLoginQuery {
    /// Random app-generated state returned through the registered desktop deep link.
    #[param(required = true)]
    state: String,
    /// Base64url SHA-256 challenge for the app-generated PKCE verifier.
    #[param(required = true)]
    code_challenge: String,
}

#[derive(Debug, Deserialize, Serialize, ToSchema)]
pub struct NativeExchangeRequest {
    /// Short-lived, single-use code delivered through `worshipviewer://auth/callback`.
    pub code: String,
    /// State originally supplied to `GET /auth/native/login`.
    pub state: String,
    /// Original app-generated PKCE verifier.
    pub code_verifier: String,
}

#[derive(Debug, Deserialize, IntoParams)]
#[into_params(parameter_in = Query)]
struct AuthCallbackQuery {
    /// Authorization code returned by Google on success.
    #[serde(default)]
    #[param(required = false)]
    code: Option<String>,
    #[param(required = true)]
    state: String,
    /// Present when the user denies or the provider cannot complete authorization.
    #[serde(default)]
    #[param(required = false)]
    error: Option<String>,
}

fn resolve_frontend_redirect(post_login_path: &str, requested: Option<&str>) -> String {
    requested
        .and_then(sanitize_redirect)
        .unwrap_or_else(|| default_frontend_path(post_login_path))
}

fn default_frontend_path(path: &str) -> String {
    let trimmed = path.trim();
    if trimmed.is_empty() || trimmed == "/" {
        "/".to_string()
    } else {
        format!("/{}", trimmed.trim_start_matches('/'))
    }
}

#[cfg(test)]
mod native_handoff_http_tests {
    use actix_web::{App, http::StatusCode, test, web};
    use chrono::{Duration as ChronoDuration, Utc};
    use openidconnect::{PkceCodeChallenge, PkceCodeVerifier};

    use super::{NativeExchangeRequest, native_exchange};
    use crate::auth::oidc::{Model as OidcModel, NativeLoginHandoff};
    use crate::settings::CookieConfig;
    use crate::test_helpers::{create_user, session_service, test_db};

    const VALID_STATE: &str = "1234567890abcdefghijklmnopqrstuv";
    const VALID_VERIFIER: &str = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

    #[actix_web::test]
    async fn native_exchange_sets_cookie_and_consumes_code_only_after_pkce_match() {
        let db = test_db().await.expect("test database");
        let user = create_user(&db, "native-login@test.local")
            .await
            .expect("create user");
        let session_svc = session_service(&db);
        let session = session_svc
            .create_session_for_user_by_id(&user.id, 3600)
            .await
            .expect("create session");
        let code = "e6d3f4be480a4dcbbaf93c74246127f1";
        let verifier = PkceCodeVerifier::new(VALID_VERIFIER.to_owned());
        let challenge = PkceCodeChallenge::from_code_verifier_sha256(&verifier);
        let now = Utc::now();
        OidcModel::remember_native_handoff(
            db.as_ref(),
            code,
            NativeLoginHandoff {
                session_id: session.id.clone(),
                state: VALID_STATE.into(),
                code_challenge: challenge.as_str().to_owned(),
                created_at: now,
                expires_at: now + ChronoDuration::seconds(120),
            },
        )
        .await
        .expect("remember handoff");

        let app = test::init_service(
            App::new()
                .app_data(web::Data::from(db.clone()))
                .app_data(web::Data::new(session_svc))
                .app_data(web::Data::new(CookieConfig {
                    name: "sso_session".into(),
                    secure: true,
                    session_ttl_seconds: 3600,
                    post_login_path: "/".into(),
                }))
                .service(native_exchange),
        )
        .await;

        let wrong_verifier = format!("{}", "z".repeat(64));
        let response = test::call_service(
            &app,
            test::TestRequest::post()
                .uri("/native/exchange")
                .set_json(NativeExchangeRequest {
                    code: code.into(),
                    state: VALID_STATE.into(),
                    code_verifier: wrong_verifier,
                })
                .to_request(),
        )
        .await;
        let status = response.status();
        let body = test::read_body(response).await;
        assert_eq!(
            status,
            StatusCode::UNAUTHORIZED,
            "exchange error: {}",
            String::from_utf8_lossy(&body)
        );

        let response = test::call_service(
            &app,
            test::TestRequest::post()
                .uri("/native/exchange")
                .set_json(NativeExchangeRequest {
                    code: code.into(),
                    state: VALID_STATE.into(),
                    code_verifier: VALID_VERIFIER.into(),
                })
                .to_request(),
        )
        .await;
        assert_eq!(response.status(), StatusCode::NO_CONTENT);
        let set_cookie = response
            .headers()
            .get(actix_web::http::header::SET_COOKIE)
            .expect("set-cookie")
            .to_str()
            .expect("cookie header");
        assert!(set_cookie.starts_with("sso_session="));
        assert!(set_cookie.contains("HttpOnly"));
        assert!(set_cookie.contains("Secure"));
        assert!(set_cookie.contains("SameSite=Lax"));

        let body = test::read_body(response).await;
        assert!(body.is_empty(), "handoff response must not contain a token");

        let replay = test::call_service(
            &app,
            test::TestRequest::post()
                .uri("/native/exchange")
                .set_json(NativeExchangeRequest {
                    code: code.into(),
                    state: VALID_STATE.into(),
                    code_verifier: VALID_VERIFIER.into(),
                })
                .to_request(),
        )
        .await;
        assert_eq!(replay.status(), StatusCode::UNAUTHORIZED);
    }

    #[actix_web::test]
    async fn native_exchange_rejects_expired_handoff() {
        let db = test_db().await.expect("test database");
        let user = create_user(&db, "native-expired@test.local")
            .await
            .expect("create user");
        let session_svc = session_service(&db);
        let session = session_svc
            .create_session_for_user_by_id(&user.id, 3600)
            .await
            .expect("create session");
        let code = "expired-native-code";
        let verifier = PkceCodeVerifier::new(VALID_VERIFIER.to_owned());
        let challenge = PkceCodeChallenge::from_code_verifier_sha256(&verifier);
        let now = Utc::now();
        OidcModel::remember_native_handoff(
            db.as_ref(),
            code,
            NativeLoginHandoff {
                session_id: session.id,
                state: VALID_STATE.into(),
                code_challenge: challenge.as_str().to_owned(),
                created_at: now - ChronoDuration::seconds(121),
                expires_at: now - ChronoDuration::seconds(1),
            },
        )
        .await
        .expect("remember expired handoff");

        let app = test::init_service(
            App::new()
                .app_data(web::Data::from(db.clone()))
                .app_data(web::Data::new(session_svc))
                .app_data(web::Data::new(CookieConfig {
                    name: "sso_session".into(),
                    secure: true,
                    session_ttl_seconds: 3600,
                    post_login_path: "/".into(),
                }))
                .service(native_exchange),
        )
        .await;
        let response = test::call_service(
            &app,
            test::TestRequest::post()
                .uri("/native/exchange")
                .set_json(NativeExchangeRequest {
                    code: code.into(),
                    state: VALID_STATE.into(),
                    code_verifier: VALID_VERIFIER.into(),
                })
                .to_request(),
        )
        .await;
        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
    }
}
