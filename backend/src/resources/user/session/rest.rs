use actix_web::http::header;
use actix_web::{
    HttpMessage, HttpRequest, HttpResponse, delete, get, post,
    web::{Data, Path, Query, ReqData},
};
use serde::Deserialize;

use shared::api::{ListQuery, PAGE_SIZE_DEFAULT};
use shared::user::{HttpAuditMetrics, Session, SessionBody};

use crate::auth::AuthorizationContext;
#[allow(unused_imports)]
use crate::docs::Problem;
use crate::error::AppError;
use crate::expand::expand_includes_user;
use crate::http_audit::AuditSessionId;
use crate::settings::CookieConfig;

use super::service::SessionServiceHandle;

#[derive(Debug, Deserialize)]
struct SessionsPageQuery {
    #[serde(flatten)]
    list: ListQuery,
    /// Comma-separated relations to expand. Use `user` to embed the full [`crate::resources::User`] instead of the default `id`+`email` link.
    expand: Option<String>,
}

#[derive(Debug, Deserialize)]
struct ExpandQuery {
    /// Comma-separated relations to expand (`user` → full user object on `user`).
    expand: Option<String>,
}

#[utoipa::path(
    get,
    path = "/api/v1/users/me/session/metrics",
    responses(
        (status = 200, description = "HTTP audit aggregates for the credential session", body = HttpAuditMetrics),
        (status = 401, description = "Authentication required", body = Problem, content_type = "application/problem+json"),
        (status = 404, description = "Session not found", body = Problem, content_type = "application/problem+json"),
        (status = 429, description = "API rate limit exceeded; see `Retry-After` and `X-RateLimit-*` response headers", body = Problem, content_type = "application/problem+json"),
        (status = 500, description = "Failed to fetch metrics", body = Problem, content_type = "application/problem+json")
    ),
    tag = "Users",
    security(
        ("SessionCookie" = []),
        ("SessionToken" = [])
    )
)]
#[get("/me/session/metrics")]
pub async fn get_current_session_metrics(
    svc: Data<SessionServiceHandle>,
    ctx: ReqData<AuthorizationContext>,
) -> Result<HttpResponse, AppError> {
    let session_id = ctx.session.id.clone();
    svc.get_session_for_user(&session_id, &ctx.user.id).await?;
    Ok(HttpResponse::Ok().json(svc.get_http_audit_metrics_for_session(&session_id).await?))
}

#[utoipa::path(
    get,
    path = "/api/v1/users/me/session",
    params(
        ("expand" = Option<String>, Query, description = "Optional `user` to embed full user (default: `id`+`email` link)."),
    ),
    responses(
        (status = 200, description = "Returns the session credential used for this request", body = SessionBody),
        (status = 401, description = "Authentication required", body = Problem, content_type = "application/problem+json"),
        (status = 429, description = "API rate limit exceeded; see `Retry-After` and `X-RateLimit-*` response headers", body = Problem, content_type = "application/problem+json"),
        (status = 404, description = "Session not found", body = Problem, content_type = "application/problem+json"),
        (status = 500, description = "Failed to fetch session", body = Problem, content_type = "application/problem+json")
    ),
    tag = "Users",
    security(
        ("SessionCookie" = []),
        ("SessionToken" = [])
    )
)]
#[get("/me/session")]
pub async fn get_current_session_for_user(
    req: HttpRequest,
    svc: Data<SessionServiceHandle>,
    ctx: ReqData<AuthorizationContext>,
    expand: Query<ExpandQuery>,
) -> Result<HttpResponse, AppError> {
    let session_id = req
        .extensions()
        .get::<AuditSessionId>()
        .map(|a| a.0.clone())
        .ok_or_else(|| {
            AppError::Internal("authenticated request missing credential session identifier".into())
        })?;
    let session = svc.get_session_for_user(&session_id, &ctx.user.id).await?;
    Ok(HttpResponse::Ok().json(SessionBody::from_session(
        session,
        expand_includes_user(&expand.expand),
    )))
}

#[utoipa::path(
    get,
    path = "/api/v1/users/me/sessions",
    params(
        ("page" = Option<u32>, Query, description = "Zero-based page; defaults to 0. `X-Total-Count` is the total before paging (`list-pagination.md`).", minimum = 0, nullable = true),
        ("page_size" = Option<u32>, Query, description = "Items per page. Must be 1–500. Defaults to 50 when omitted.", minimum = 1, maximum = 500, example = 50, nullable = true),
        ("q" = Option<String>, Query, description = "Optional case-insensitive substring on session id, user id, or user email. Whitespace-only is treated as absent."),
        ("expand" = Option<String>, Query, description = "Optional comma-separated relations (`user` = embed full user on each session; default is `id`+`email` link only)."),
    ),
    responses(
        (status = 200, description = "Returns active sessions for the current user. `X-Total-Count` is the total before paging.", body = [SessionBody]),
        (status = 400, description = "Invalid pagination parameters", body = Problem, content_type = "application/problem+json"),
        (status = 401, description = "Authentication required", body = Problem, content_type = "application/problem+json"),
        (status = 429, description = "API rate limit exceeded; see `Retry-After` and `X-RateLimit-*` response headers", body = Problem, content_type = "application/problem+json"),
        (status = 500, description = "Failed to list sessions for current user", body = Problem, content_type = "application/problem+json")
    ),
    tag = "Users",
    security(
        ("SessionCookie" = []),
        ("SessionToken" = [])
    )
)]
#[get("/me/sessions")]
pub async fn get_sessions_for_current_user(
    req: HttpRequest,
    svc: Data<SessionServiceHandle>,
    ctx: ReqData<AuthorizationContext>,
    query: Query<SessionsPageQuery>,
) -> Result<HttpResponse, AppError> {
    let SessionsPageQuery { list, expand } = query.into_inner();
    let list = list
        .validate()
        .map_err(crate::error::map_list_query_error)?;
    let expand_user = expand_includes_user(&expand);
    let q_link = list.clone();
    let cur_page = list.page.unwrap_or(0);
    let page_size = list.page_size.unwrap_or(PAGE_SIZE_DEFAULT);
    let sessions = filter_sessions_by_q(svc.get_sessions_by_user_id(&ctx.user.id).await?, &list);
    let (sessions_page, total) = ListQuery::paginate_vec(sessions, &list);
    let sessions_page: Vec<SessionBody> = sessions_page
        .into_iter()
        .map(|s| SessionBody::from_session(s, expand_user))
        .collect();
    Ok(HttpResponse::Ok()
        .insert_header((
            header::HeaderName::from_static("x-total-count"),
            total.to_string(),
        ))
        .insert_header((
            header::LINK,
            crate::request_link::list_link_header(
                &req,
                |p| q_link.query_string_for_page(p),
                cur_page,
                page_size,
                total,
            ),
        ))
        .json(sessions_page))
}

#[utoipa::path(
    get,
    path = "/api/v1/users/me/sessions/{id}/metrics",
    params(
        ("id" = String, Path, description = "Session identifier"),
    ),
    responses(
        (status = 200, description = "HTTP audit aggregates for the session", body = HttpAuditMetrics),
        (status = 401, description = "Authentication required", body = Problem, content_type = "application/problem+json"),
        (status = 429, description = "API rate limit exceeded; see `Retry-After` and `X-RateLimit-*` response headers", body = Problem, content_type = "application/problem+json"),
        (status = 404, description = "Session not found for current user", body = Problem, content_type = "application/problem+json"),
        (status = 500, description = "Failed to fetch metrics", body = Problem, content_type = "application/problem+json")
    ),
    tag = "Users",
    security(
        ("SessionCookie" = []),
        ("SessionToken" = [])
    )
)]
#[get("/me/sessions/{id}/metrics")]
pub async fn get_session_for_current_user_metrics(
    svc: Data<SessionServiceHandle>,
    ctx: ReqData<AuthorizationContext>,
    path: Path<SessionPath>,
) -> Result<HttpResponse, AppError> {
    svc.get_session_for_user(&path.id, &ctx.user.id).await?;
    Ok(HttpResponse::Ok().json(svc.get_http_audit_metrics_for_session(&path.id).await?))
}

#[utoipa::path(
    get,
    path = "/api/v1/users/me/sessions/{id}",
    params(
        ("id" = String, Path, description = "Session identifier"),
        ("expand" = Option<String>, Query, description = "Optional `user` to embed full user (default: `id`+`email` link)."),
    ),
    responses(
        (status = 200, description = "Returns a session for the current user", body = SessionBody),
        (status = 401, description = "Authentication required", body = Problem, content_type = "application/problem+json"),
        (status = 429, description = "API rate limit exceeded; see `Retry-After` and `X-RateLimit-*` response headers", body = Problem, content_type = "application/problem+json"),
        (status = 404, description = "Session not found for current user", body = Problem, content_type = "application/problem+json"),
        (status = 500, description = "Failed to fetch session", body = Problem, content_type = "application/problem+json")
    ),
    tag = "Users",
    security(
        ("SessionCookie" = []),
        ("SessionToken" = [])
    )
)]
#[get("/me/sessions/{id}")]
pub async fn get_session_for_current_user(
    svc: Data<SessionServiceHandle>,
    ctx: ReqData<AuthorizationContext>,
    path: Path<SessionPath>,
    expand: Query<ExpandQuery>,
) -> Result<HttpResponse, AppError> {
    let session = svc.get_session_for_user(&path.id, &ctx.user.id).await?;
    Ok(HttpResponse::Ok().json(SessionBody::from_session(
        session,
        expand_includes_user(&expand.expand),
    )))
}

#[utoipa::path(
    delete,
    path = "/api/v1/users/me/sessions/{id}",
    params(
        ("id" = String, Path, description = "Session identifier")
    ),
    responses(
        (status = 204, description = "Session deleted"),
        (status = 401, description = "Authentication required", body = Problem, content_type = "application/problem+json"),
        (status = 429, description = "API rate limit exceeded; see `Retry-After` and `X-RateLimit-*` response headers", body = Problem, content_type = "application/problem+json"),
        (status = 404, description = "Session not found for current user", body = Problem, content_type = "application/problem+json"),
        (status = 500, description = "Failed to delete session", body = Problem, content_type = "application/problem+json")
    ),
    tag = "Users",
    security(
        ("SessionCookie" = []),
        ("SessionToken" = [])
    )
)]
#[delete("/me/sessions/{id}")]
pub async fn delete_session_for_current_user(
    svc: Data<SessionServiceHandle>,
    ctx: ReqData<AuthorizationContext>,
    path: Path<SessionPath>,
) -> Result<HttpResponse, AppError> {
    let deleted = svc.delete_session_for_user(&path.id, &ctx.user.id).await?;
    crate::audit!(
        "audit.session.revoked",
        session_id = tracing::field::display(&deleted.id),
        user_id = tracing::field::display(&deleted.user.id),
        actor_user_id = tracing::field::display(&ctx.user.id)
        ; "session revoked"
    );
    Ok(HttpResponse::NoContent().finish())
}

#[utoipa::path(
    post,
    path = "/api/v1/users/{user_id}/sessions",
    params(
        ("user_id" = String, Path, description = "User identifier"),
        ("expand" = Option<String>, Query, description = "Optional `user` to embed full user in the response (default: link)."),
    ),
    responses(
        (status = 201, description = "Creates a session for the specified user", body = SessionBody),
        (status = 401, description = "Authentication required", body = Problem, content_type = "application/problem+json"),
        (status = 429, description = "API rate limit exceeded; see `Retry-After` and `X-RateLimit-*` response headers", body = Problem, content_type = "application/problem+json"),
        (status = 403, description = "Admin role required", body = Problem, content_type = "application/problem+json"),
        (status = 500, description = "Failed to create session", body = Problem, content_type = "application/problem+json")
    ),
    tag = "Users",
    security(
        ("SessionCookie" = []),
        ("SessionToken" = [])
    )
)]
#[post("/{user_id}/sessions")]
pub async fn create_session_for_user(
    svc: Data<SessionServiceHandle>,
    cookie_cfg: Data<CookieConfig>,
    path: Path<UserIdPath>,
    expand: Query<ExpandQuery>,
) -> Result<HttpResponse, AppError> {
    let ttl = cookie_cfg.session_ttl_seconds as i64;
    let session = svc
        .create_session_for_user_by_id(&path.user_id, ttl)
        .await?;
    Ok(HttpResponse::Created().json(SessionBody::from_session(
        session,
        expand_includes_user(&expand.expand),
    )))
}

#[utoipa::path(
    get,
    path = "/api/v1/users/{user_id}/sessions",
    params(
        ("user_id" = String, Path, description = "User identifier"),
        ("page" = Option<u32>, Query, description = "Zero-based page; defaults to 0. `X-Total-Count` is the total before paging (`list-pagination.md`).", minimum = 0, nullable = true),
        ("page_size" = Option<u32>, Query, description = "Items per page. Must be 1–500. Defaults to 50 when omitted.", minimum = 1, maximum = 500, example = 50, nullable = true),
        ("q" = Option<String>, Query, description = "Optional case-insensitive substring on session id, user id, or user email. Whitespace-only is treated as absent."),
        ("expand" = Option<String>, Query, description = "Optional comma-separated relations (`user` = full user per session)."),
    ),
    responses(
        (status = 200, description = "Returns active sessions for the specified user. `X-Total-Count` is the total before paging.", body = [SessionBody]),
        (status = 400, description = "Invalid pagination parameters", body = Problem, content_type = "application/problem+json"),
        (status = 401, description = "Authentication required", body = Problem, content_type = "application/problem+json"),
        (status = 429, description = "API rate limit exceeded; see `Retry-After` and `X-RateLimit-*` response headers", body = Problem, content_type = "application/problem+json"),
        (status = 403, description = "Admin role required", body = Problem, content_type = "application/problem+json"),
        (status = 500, description = "Failed to list sessions", body = Problem, content_type = "application/problem+json")
    ),
    tag = "Users",
    security(
        ("SessionCookie" = []),
        ("SessionToken" = [])
    )
)]
#[get("/{user_id}/sessions")]
pub async fn get_sessions_for_user(
    req: HttpRequest,
    svc: Data<SessionServiceHandle>,
    path: Path<UserIdPath>,
    query: Query<SessionsPageQuery>,
) -> Result<HttpResponse, AppError> {
    let SessionsPageQuery { list, expand } = query.into_inner();
    let list = list
        .validate()
        .map_err(crate::error::map_list_query_error)?;
    let expand_user = expand_includes_user(&expand);
    let q_link = list.clone();
    let cur_page = list.page.unwrap_or(0);
    let page_size = list.page_size.unwrap_or(PAGE_SIZE_DEFAULT);
    let sessions = filter_sessions_by_q(svc.get_sessions_by_user_id(&path.user_id).await?, &list);
    let (sessions_page, total) = ListQuery::paginate_vec(sessions, &list);
    let sessions_page: Vec<SessionBody> = sessions_page
        .into_iter()
        .map(|s| SessionBody::from_session(s, expand_user))
        .collect();
    Ok(HttpResponse::Ok()
        .insert_header((
            header::HeaderName::from_static("x-total-count"),
            total.to_string(),
        ))
        .insert_header((
            header::LINK,
            crate::request_link::list_link_header(
                &req,
                |p| q_link.query_string_for_page(p),
                cur_page,
                page_size,
                total,
            ),
        ))
        .json(sessions_page))
}

#[utoipa::path(
    get,
    path = "/api/v1/users/{user_id}/sessions/{id}/metrics",
    params(
        ("user_id" = String, Path, description = "User identifier"),
        ("id" = String, Path, description = "Session identifier"),
    ),
    responses(
        (status = 200, description = "HTTP audit aggregates for the session", body = HttpAuditMetrics),
        (status = 401, description = "Authentication required", body = Problem, content_type = "application/problem+json"),
        (status = 403, description = "Admin role required", body = Problem, content_type = "application/problem+json"),
        (status = 404, description = "Session not found for specified user", body = Problem, content_type = "application/problem+json"),
        (status = 429, description = "API rate limit exceeded; see `Retry-After` and `X-RateLimit-*` response headers", body = Problem, content_type = "application/problem+json"),
        (status = 500, description = "Failed to fetch metrics", body = Problem, content_type = "application/problem+json")
    ),
    tag = "Users",
    security(
        ("SessionCookie" = []),
        ("SessionToken" = [])
    )
)]
#[get("/{user_id}/sessions/{id}/metrics")]
pub async fn get_session_for_user_metrics(
    svc: Data<SessionServiceHandle>,
    path: Path<UserSessionPath>,
) -> Result<HttpResponse, AppError> {
    svc.get_session_for_user(&path.id, &path.user_id).await?;
    Ok(HttpResponse::Ok().json(svc.get_http_audit_metrics_for_session(&path.id).await?))
}

#[utoipa::path(
    get,
    path = "/api/v1/users/{user_id}/sessions/{id}",
    params(
        ("user_id" = String, Path, description = "User identifier"),
        ("id" = String, Path, description = "Session identifier"),
        ("expand" = Option<String>, Query, description = "Optional `user` to embed full user."),
    ),
    responses(
        (status = 200, description = "Returns a session for the specified user", body = SessionBody),
        (status = 401, description = "Authentication required", body = Problem, content_type = "application/problem+json"),
        (status = 429, description = "API rate limit exceeded; see `Retry-After` and `X-RateLimit-*` response headers", body = Problem, content_type = "application/problem+json"),
        (status = 403, description = "Admin role required", body = Problem, content_type = "application/problem+json"),
        (status = 404, description = "Session not found for specified user", body = Problem, content_type = "application/problem+json"),
        (status = 500, description = "Failed to fetch session", body = Problem, content_type = "application/problem+json")
    ),
    tag = "Users",
    security(
        ("SessionCookie" = []),
        ("SessionToken" = [])
    )
)]
#[get("/{user_id}/sessions/{id}")]
pub async fn get_session_for_user(
    svc: Data<SessionServiceHandle>,
    path: Path<UserSessionPath>,
    expand: Query<ExpandQuery>,
) -> Result<HttpResponse, AppError> {
    let session = svc.get_session_for_user(&path.id, &path.user_id).await?;
    Ok(HttpResponse::Ok().json(SessionBody::from_session(
        session,
        expand_includes_user(&expand.expand),
    )))
}

#[utoipa::path(
    delete,
    path = "/api/v1/users/{user_id}/sessions/{id}",
    params(
        ("user_id" = String, Path, description = "User identifier"),
        ("id" = String, Path, description = "Session identifier")
    ),
    responses(
        (status = 204, description = "Session deleted"),
        (status = 401, description = "Authentication required", body = Problem, content_type = "application/problem+json"),
        (status = 429, description = "API rate limit exceeded; see `Retry-After` and `X-RateLimit-*` response headers", body = Problem, content_type = "application/problem+json"),
        (status = 403, description = "Admin role required", body = Problem, content_type = "application/problem+json"),
        (status = 404, description = "Session not found for specified user", body = Problem, content_type = "application/problem+json"),
        (status = 500, description = "Failed to delete session", body = Problem, content_type = "application/problem+json")
    ),
    tag = "Users",
    security(
        ("SessionCookie" = []),
        ("SessionToken" = [])
    )
)]
#[delete("/{user_id}/sessions/{id}")]
pub async fn delete_session_for_user(
    svc: Data<SessionServiceHandle>,
    actor: ReqData<AuthorizationContext>,
    path: Path<UserSessionPath>,
) -> Result<HttpResponse, AppError> {
    let deleted = svc.delete_session_for_user(&path.id, &path.user_id).await?;
    crate::audit!(
        "audit.session.revoked",
        session_id = tracing::field::display(&deleted.id),
        user_id = tracing::field::display(&deleted.user.id),
        actor_user_id = tracing::field::display(&actor.user.id)
        ; "session revoked"
    );
    Ok(HttpResponse::NoContent().finish())
}

#[derive(Debug, Deserialize)]
struct SessionPath {
    id: String,
}

#[derive(Debug, Deserialize)]
pub struct UserIdPath {
    pub user_id: String,
}

#[derive(Debug, Deserialize)]
struct UserSessionPath {
    user_id: String,
    id: String,
}

fn filter_sessions_by_q(mut sessions: Vec<Session>, query: &ListQuery) -> Vec<Session> {
    let Some(needle) = query.q.as_ref().and_then(|s| {
        let t = s.trim();
        if t.is_empty() {
            None
        } else {
            Some(t.to_lowercase())
        }
    }) else {
        return sessions;
    };
    sessions.retain(|s| {
        s.id.to_lowercase().contains(&needle)
            || s.user.id.to_lowercase().contains(&needle)
            || s.user.email.to_lowercase().contains(&needle)
    });
    sessions
}
