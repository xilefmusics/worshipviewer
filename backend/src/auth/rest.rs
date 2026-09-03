use actix_governor::{Governor, GovernorConfigBuilder};

use crate::governor_audit::AuditRateLimit429;
use crate::governor_peer::ProblemJsonPeerIpKeyExtractor;
use actix_web::{
    HttpRequest, HttpResponse,
    cookie::{Cookie, SameSite},
    get, post,
    web::{self, Data},
};
use time::Duration as CookieDuration;
use tracing::warn;

pub use super::authorization_bearer;
use super::impersonation;
use super::{oidc, otp};
use crate::error::AppError;
use crate::resources::user::session::service::SessionServiceHandle;
use crate::settings::CookieConfig;
use crate::settings::ImpersonationConfig;
use crate::{database::Database, resources::user::service::UserServiceHandle};

pub fn scope(auth_rate_limit_rps: u64, auth_rate_limit_burst: u32) -> actix_web::Scope {
    let governor_conf = GovernorConfigBuilder::default()
        .requests_per_second(auth_rate_limit_rps)
        .burst_size(auth_rate_limit_burst)
        .key_extractor(ProblemJsonPeerIpKeyExtractor)
        .finish()
        .expect("valid rate-limit configuration");

    actix_web::web::scope("/auth")
        // OIDC callback is not rate-limited — it is initiated by the provider and must not block.
        .service(oidc::rest::callback)
        // Keep these routes ahead of the empty nested scope below. The empty
        // scope is a catch-all for the rate-limited login/logout routes and
        // would otherwise intercept these requests before they reach their
        // sibling services.
        .service(current_impersonation)
        .service(stop_impersonation)
        .service(
            web::scope("")
                .wrap(Governor::new(&governor_conf))
                .wrap(AuditRateLimit429)
                .service(oidc::rest::login)
                .service(otp::rest::otp_request)
                .service(otp::rest::otp_verify)
                .service(logout),
        )
}

#[utoipa::path(
    post,
    path = "/auth/logout",
    responses((status = 204, description = "Ends the session idempotently: clears `sso_session` cookie and deletes the session server-side if the cookie or `Authorization: Bearer` session id is present. Missing/unknown sessions still yield 204.")),
    tag = "Auth",
    security(
        ("SessionCookie" = []),
        ("SessionToken" = [])
    )
)]
#[post("/logout")]
pub(crate) async fn logout(
    db: Data<Database>,
    svc: Data<SessionServiceHandle>,
    cookie_cfg: Data<CookieConfig>,
    impersonation_cfg: Data<ImpersonationConfig>,
    req: HttpRequest,
) -> HttpResponse {
    let bearer_session = authorization_bearer(&req);
    let cookie_session = req
        .cookie(&cookie_cfg.name)
        .map(|cookie| cookie.value().to_owned());
    let impersonation_cookie = req
        .cookie(&impersonation_cfg.cookie_name)
        .map(|cookie| cookie.value().to_owned());

    if bearer_session.is_none()
        && let (Some(primary), Some(credential)) =
            (cookie_session.as_deref(), impersonation_cookie.as_deref())
        && let Ok(Some(actor)) =
            impersonation::load_actor_context(db.get_ref(), Some(primary)).await
        && let Ok(Some(record)) = impersonation::find_for_actor(
            db.get_ref(),
            credential,
            &actor.session.id,
            &actor.user.id,
        )
        .await
    {
        if let Ok(Some(subject_ctx)) = crate::auth::load_authorization_context_for_user(
            db.get_ref(),
            &crate::database::record_id_string(&record.subject_user),
        )
        .await
        {
            impersonation::attach_request_context(
                &req,
                impersonation::compose_subject_context(actor.clone(), subject_ctx, &record),
            );
        }
        crate::audit!(
            "audit.impersonation.stopped",
            impersonation_id = tracing::field::display(&crate::database::record_id_string(&record.id)),
            actor_user_id = tracing::field::display(&crate::database::record_id_string(&record.actor_user)),
            subject_user_id = tracing::field::display(&crate::database::record_id_string(&record.subject_user))
            ; "impersonation stopped by logout"
        );
        let _ = impersonation::delete(db.get_ref(), &record).await;
    }

    if let Some(session_id) = bearer_session.as_deref().or(cookie_session.as_deref()) {
        match svc.delete_session(session_id).await {
            Ok(deleted) => {
                let had_cookie = cookie_session.is_some();
                crate::audit!(
                    "audit.auth.logout",
                    session_id = tracing::field::display(session_id),
                    had_cookie = tracing::field::display(&had_cookie)
                    ; "logout"
                );
                crate::audit!(
                    "audit.session.revoked",
                    session_id = tracing::field::display(&deleted.id),
                    user_id = tracing::field::display(&deleted.user.id),
                    actor_user_id = tracing::field::display(&deleted.user.id)
                    ; "session revoked"
                );
            }
            Err(err) => {
                warn!(session = session_id, "failed to drop session: {}", err);
            }
        }
    } else {
        crate::audit!(
            "audit.auth.logout",
            session_id = tracing::field::display(&"none"),
            had_cookie = tracing::field::display(&cookie_session.is_some())
            ; "logout"
        );
    }

    let mut response = HttpResponse::NoContent();
    if cookie_session.is_some() {
        response.cookie(empty_cookie(&cookie_cfg));
    }
    if impersonation_cookie.is_some() {
        response.cookie(impersonation::clear_cookie(&impersonation_cfg));
    }
    response.finish()
}

#[utoipa::path(
    get,
    path = "/auth/impersonation/current",
    responses(
        (status = 200, description = "Current browser impersonation state", body = impersonation::ImpersonationStatus)
    ),
    tag = "Auth"
)]
#[get("/impersonation/current")]
pub(crate) async fn current_impersonation(
    db: Data<Database>,
    user_svc: Data<UserServiceHandle>,
    cookie_cfg: Data<CookieConfig>,
    impersonation_cfg: Data<ImpersonationConfig>,
    req: HttpRequest,
) -> Result<HttpResponse, AppError> {
    if authorization_bearer(&req).is_some() {
        return Ok(
            HttpResponse::Ok().json(impersonation::ImpersonationStatus::inactive(
                impersonation_cfg.enabled,
            )),
        );
    }
    if !impersonation_cfg.enabled {
        return Ok(HttpResponse::Ok()
            .cookie(impersonation::clear_cookie(&impersonation_cfg))
            .json(impersonation::ImpersonationStatus::inactive(false)));
    }
    let Some(primary) = impersonation::primary_cookie_value(&req, &cookie_cfg) else {
        return Ok(
            HttpResponse::Ok().json(impersonation::ImpersonationStatus::inactive(
                impersonation_cfg.enabled,
            )),
        );
    };
    let Some(impersonation_cookie) = req.cookie(&impersonation_cfg.cookie_name) else {
        return Ok(
            HttpResponse::Ok().json(impersonation::ImpersonationStatus::inactive(
                impersonation_cfg.enabled,
            )),
        );
    };
    let Some(actor) = impersonation::load_actor_context(db.get_ref(), Some(&primary)).await? else {
        return Ok(HttpResponse::Ok()
            .cookie(impersonation::clear_cookie(&impersonation_cfg))
            .json(impersonation::ImpersonationStatus::inactive(
                impersonation_cfg.enabled,
            )));
    };
    let Some(record) = impersonation::find_for_actor(
        db.get_ref(),
        impersonation_cookie.value(),
        &actor.session.id,
        &actor.user.id,
    )
    .await?
    else {
        return Ok(HttpResponse::Ok()
            .cookie(impersonation::clear_cookie(&impersonation_cfg))
            .json(impersonation::ImpersonationStatus::inactive(
                impersonation_cfg.enabled,
            )));
    };
    let subject_id = crate::database::record_id_string(&record.subject_user);
    let subject = match user_svc.get_user(&subject_id).await {
        Ok(user) => user,
        Err(AppError::NotFound(_)) => {
            impersonation::delete(db.get_ref(), &record).await?;
            crate::audit!(
                "audit.impersonation.invalidated",
                impersonation_id = tracing::field::display(&crate::database::record_id_string(&record.id)),
                actor_user_id = tracing::field::display(&actor.user.id),
                subject_user_id = tracing::field::display(&subject_id)
                ; "impersonation invalidated"
            );
            return Ok(HttpResponse::Ok()
                .cookie(impersonation::clear_cookie(&impersonation_cfg))
                .json(impersonation::ImpersonationStatus::inactive(
                    impersonation_cfg.enabled,
                )));
        }
        Err(err) => return Err(err),
    };
    if let Some(subject_ctx) =
        crate::auth::load_authorization_context_for_user(db.get_ref(), &subject_id).await?
    {
        impersonation::attach_request_context(
            &req,
            impersonation::compose_subject_context(actor, subject_ctx, &record),
        );
    }
    Ok(HttpResponse::Ok().json(impersonation::status_from_record(
        impersonation_cfg.enabled,
        &record,
        subject,
    )))
}

#[utoipa::path(
    post,
    path = "/auth/impersonation/stop",
    responses((status = 204, description = "Stops browser impersonation and retains the primary login")),
    tag = "Auth"
)]
#[post("/impersonation/stop")]
pub(crate) async fn stop_impersonation(
    db: Data<Database>,
    cookie_cfg: Data<CookieConfig>,
    impersonation_cfg: Data<ImpersonationConfig>,
    req: HttpRequest,
) -> HttpResponse {
    let bearer_request = authorization_bearer(&req).is_some();
    if !bearer_request {
        let primary = impersonation::primary_cookie_value(&req, &cookie_cfg);
        if let (Some(primary), Some(cookie)) = (primary, req.cookie(&impersonation_cfg.cookie_name))
            && let Ok(Some(actor)) =
                impersonation::load_actor_context(db.get_ref(), Some(&primary)).await
            && let Ok(Some(record)) = impersonation::find_for_actor(
                db.get_ref(),
                cookie.value(),
                &actor.session.id,
                &actor.user.id,
            )
            .await
        {
            if let Ok(Some(subject_ctx)) = crate::auth::load_authorization_context_for_user(
                db.get_ref(),
                &crate::database::record_id_string(&record.subject_user),
            )
            .await
            {
                impersonation::attach_request_context(
                    &req,
                    impersonation::compose_subject_context(actor.clone(), subject_ctx, &record),
                );
            }
            let _ = impersonation::delete(db.get_ref(), &record).await;
            crate::audit!(
                "audit.impersonation.stopped",
                impersonation_id = tracing::field::display(&crate::database::record_id_string(&record.id)),
                actor_user_id = tracing::field::display(&crate::database::record_id_string(&record.actor_user)),
                subject_user_id = tracing::field::display(&crate::database::record_id_string(&record.subject_user))
                ; "impersonation stopped"
            );
        }
    }
    let mut response = HttpResponse::NoContent();
    if !bearer_request && req.cookie(&impersonation_cfg.cookie_name).is_some() {
        response.cookie(impersonation::clear_cookie(&impersonation_cfg));
    }
    response.finish()
}

fn empty_cookie(cfg: &CookieConfig) -> Cookie<'static> {
    Cookie::build(cfg.name.clone(), "")
        .http_only(true)
        .same_site(SameSite::Lax)
        .path("/")
        .secure(cfg.secure)
        .max_age(CookieDuration::seconds(0))
        .finish()
}
