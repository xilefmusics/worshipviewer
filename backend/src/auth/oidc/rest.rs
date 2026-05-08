use std::sync::Arc;

use actix_web::{
    HttpResponse,
    cookie::{Cookie, SameSite},
    get,
    http::header,
    web::{self, Data},
};
use chrono::{Duration as ChronoDuration, Utc};
use openidconnect::core::CoreAuthenticationFlow;
use openidconnect::{AuthorizationCode, CsrfToken, Nonce, PkceCodeChallenge, Scope, TokenResponse};
use serde::Deserialize;
use time::Duration as CookieDuration;
use tracing::instrument;
use utoipa::IntoParams;

use super::{Model as OidcModel, OidcClients, OidcProvider, PendingOidc};
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
    db.cleanup_expired_oidc_states().await?;
    let redirect_hint = query.redirect_to.as_deref().and_then(sanitize_redirect);

    let oidc_clients = oidc_clients.get_ref();
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
        (status = 302, description = "Successful callback exchange; redirects back to frontend"),
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
        created_at: _,
        expires_at: _,
        provider,
    } = pending;

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
        .exchange_code(AuthorizationCode::new(query.code.clone()))
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

    let redirect_target =
        resolve_frontend_redirect(&cookie_cfg.post_login_path, redirect_to.as_deref());

    Ok(HttpResponse::Found()
        .append_header((header::LOCATION, redirect_target))
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
struct AuthCallbackQuery {
    #[param(required = true)]
    code: String,
    #[param(required = true)]
    state: String,
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
