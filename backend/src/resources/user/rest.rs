use super::{CreateUser, User, session};
use crate::auth::AuthorizationContext;
use crate::auth::middleware::RequireAdmin;
#[allow(unused_imports)]
use crate::docs::Problem;
use crate::error::AppError;
use crate::resources::blob::service::BlobServiceHandle;
use crate::resources::user::service::UserServiceHandle;
use crate::settings::ProfilePictureLimits;
use actix_web::http::header;
use actix_web::{
    HttpRequest, HttpResponse, Scope, delete, get, post,
    web::{self, Bytes, Data, Json, Path, Query, ReqData},
};
use shared::api::{ListQuery, PAGE_SIZE_DEFAULT};

pub fn scope(avatar_upload_max_bytes: usize) -> Scope {
    web::scope("/users")
        .service(get_users_me)
        .service(
            web::resource("/me/profile-picture")
                .app_data(web::PayloadConfig::new(avatar_upload_max_bytes))
                .route(web::put().to(put_profile_picture))
                .route(web::delete().to(delete_profile_picture)),
        )
        .service(session::rest::get_current_session_for_user)
        .service(session::rest::get_sessions_for_current_user)
        .service(session::rest::get_session_for_current_user)
        .service(session::rest::delete_session_for_current_user)
        .service(
            web::scope("")
                .wrap(RequireAdmin)
                .service(create_user)
                .service(delete_user)
                .service(get_user)
                .service(get_users)
                .service(session::rest::get_sessions_for_user)
                .service(session::rest::get_session_for_user)
                .service(session::rest::create_session_for_user)
                .service(session::rest::delete_session_for_user),
        )
}

#[utoipa::path(
    get,
    path = "/api/v1/users/me",
    responses(
        (status = 200, description = "Returns the currently authenticated user", body = User),
        (status = 401, description = "Authentication required", body = Problem, content_type = "application/problem+json"),
        (status = 429, description = "API rate limit exceeded; see `Retry-After` and `X-RateLimit-*` response headers", body = Problem, content_type = "application/problem+json"),
        (status = 500, description = "Failed to load user session", body = Problem, content_type = "application/problem+json")
    ),
    tag = "Users",
    security(
        ("SessionCookie" = []),
        ("SessionToken" = [])
    )
)]
#[get("/me")]
async fn get_users_me(
    ctx: ReqData<AuthorizationContext>,
    svc: Data<UserServiceHandle>,
) -> Result<HttpResponse, AppError> {
    Ok(HttpResponse::Ok().json(svc.get_user(&ctx.user.id).await?))
}

#[utoipa::path(
    put,
    path = "/api/v1/users/me/profile-picture",
    request_body(content = Vec<u8>, description = "Raw JPEG or PNG bytes", content_type = "image/jpeg"),
    responses(
        (status = 200, description = "Uploaded; returns updated `User`", body = User),
        (status = 400, description = "Invalid Content-Type or image", body = Problem, content_type = "application/problem+json"),
        (status = 401, description = "Authentication required", body = Problem, content_type = "application/problem+json"),
        (status = 413, description = "Payload too large", body = Problem, content_type = "application/problem+json"),
        (status = 429, description = "API rate limit exceeded", body = Problem, content_type = "application/problem+json"),
        (status = 500, description = "Server error", body = Problem, content_type = "application/problem+json")
    ),
    tag = "Users",
    security(
        ("SessionCookie" = []),
        ("SessionToken" = [])
    )
)]
async fn put_profile_picture(
    ctx: ReqData<AuthorizationContext>,
    svc: Data<UserServiceHandle>,
    blob_svc: Data<BlobServiceHandle>,
    limits: Data<ProfilePictureLimits>,
    req: HttpRequest,
    body: Bytes,
) -> Result<HttpResponse, AppError> {
    let ct = req
        .headers()
        .get(header::CONTENT_TYPE)
        .and_then(|h| h.to_str().ok())
        .ok_or_else(|| AppError::invalid_request("missing Content-Type"))?;
    let updated = svc
        .upload_profile_picture(
            blob_svc.get_ref(),
            &ctx,
            ct,
            body.as_ref(),
            limits.max_bytes,
        )
        .await?;
    Ok(HttpResponse::Ok().json(updated))
}

#[utoipa::path(
    delete,
    path = "/api/v1/users/me/profile-picture",
    responses(
        (status = 200, description = "Removed uploaded avatar if any; returns updated `User`", body = User),
        (status = 401, description = "Authentication required", body = Problem, content_type = "application/problem+json"),
        (status = 429, description = "API rate limit exceeded", body = Problem, content_type = "application/problem+json"),
        (status = 500, description = "Server error", body = Problem, content_type = "application/problem+json")
    ),
    tag = "Users",
    security(
        ("SessionCookie" = []),
        ("SessionToken" = [])
    )
)]
async fn delete_profile_picture(
    ctx: ReqData<AuthorizationContext>,
    svc: Data<UserServiceHandle>,
    blob_svc: Data<BlobServiceHandle>,
) -> Result<HttpResponse, AppError> {
    let updated = svc
        .clear_uploaded_profile_picture(blob_svc.get_ref(), &ctx)
        .await?;
    Ok(HttpResponse::Ok().json(updated))
}

#[utoipa::path(
    get,
    path = "/api/v1/users/{id}",
    params(
        ("id" = String, Path, description = "User identifier")
    ),
    responses(
        (status = 200, description = "Returns the user matching the provided id", body = User),
        (status = 400, description = "Invalid user identifier", body = Problem, content_type = "application/problem+json"),
        (status = 401, description = "Authentication required", body = Problem, content_type = "application/problem+json"),
        (status = 429, description = "API rate limit exceeded; see `Retry-After` and `X-RateLimit-*` response headers", body = Problem, content_type = "application/problem+json"),
        (status = 403, description = "Admin role required", body = Problem, content_type = "application/problem+json"),
        (status = 500, description = "Failed to fetch user", body = Problem, content_type = "application/problem+json")
    ),
    tag = "Users",
    security(
        ("SessionCookie" = []),
        ("SessionToken" = [])
    )
)]
#[get("/{id}")]
async fn get_user(
    svc: Data<UserServiceHandle>,
    id: Path<String>,
) -> Result<HttpResponse, AppError> {
    Ok(HttpResponse::Ok().json(svc.get_user(&id).await?))
}

#[utoipa::path(
    get,
    path = "/api/v1/users",
    params(
        ("page" = Option<u32>, Query, description = "Page index, zero-based. Defaults to 0. See `docs/business-logic-constraints/list-pagination.md` (Track A: `X-Total-Count` is pre-pagination total; last page when `items.len() < page_size` or empty).", minimum = 0, nullable = true),
        ("page_size" = Option<u32>, Query, description = "Items per page. Must be 1–500. Defaults to 50.", minimum = 1, maximum = 500, example = 50, nullable = true),
        ("q" = Option<String>, Query, description = "Optional case-insensitive substring filter on email or user id. Whitespace-only is treated as absent.")
    ),
    responses(
        (status = 200, description = "Returns list of all users. `X-Total-Count` header contains the total matching user count (before pagination).", body = [User]),
        (status = 400, description = "Invalid pagination parameters", body = Problem, content_type = "application/problem+json"),
        (status = 401, description = "Authentication required", body = Problem, content_type = "application/problem+json"),
        (status = 429, description = "API rate limit exceeded; see `Retry-After` and `X-RateLimit-*` response headers", body = Problem, content_type = "application/problem+json"),
        (status = 403, description = "Admin role required", body = Problem, content_type = "application/problem+json"),
        (status = 500, description = "Failed to list users", body = Problem, content_type = "application/problem+json")
    ),
    tag = "Users",
    security(
        ("SessionCookie" = []),
        ("SessionToken" = [])
    )
)]
#[get("")]
async fn get_users(
    req: HttpRequest,
    svc: Data<UserServiceHandle>,
    query: Query<ListQuery>,
) -> Result<HttpResponse, AppError> {
    let query = query
        .into_inner()
        .validate()
        .map_err(crate::error::map_list_query_error)?;
    let q_link = query.clone();
    let page = query.page.unwrap_or(0);
    let page_size = query.page_size.unwrap_or(PAGE_SIZE_DEFAULT);
    let users = svc.get_users(query.clone()).await?;
    let total = svc.count_users(query).await?;
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
                page,
                page_size,
                total,
            ),
        ))
        .json(users))
}

#[utoipa::path(
    post,
    path = "/api/v1/users",
    request_body = CreateUser,
    responses(
        (status = 201, description = "Creates a new user", body = User),
        (status = 400, description = "Invalid request payload", body = Problem, content_type = "application/problem+json"),
        (status = 401, description = "Authentication required", body = Problem, content_type = "application/problem+json"),
        (status = 429, description = "API rate limit exceeded; see `Retry-After` and `X-RateLimit-*` response headers", body = Problem, content_type = "application/problem+json"),
        (status = 403, description = "Admin role required", body = Problem, content_type = "application/problem+json"),
        (status = 409, description = "User with that email already exists", body = Problem, content_type = "application/problem+json"),
        (status = 500, description = "Failed to create user", body = Problem, content_type = "application/problem+json")
    ),
    tag = "Users",
    security(
        ("SessionCookie" = []),
        ("SessionToken" = [])
    )
)]
#[post("")]
async fn create_user(
    svc: Data<UserServiceHandle>,
    payload: Json<CreateUser>,
) -> Result<HttpResponse, AppError> {
    Ok(HttpResponse::Created().json(svc.create_user_from_request(payload.into_inner()).await?))
}

#[utoipa::path(
    delete,
    path = "/api/v1/users/{id}",
    params(
        ("id" = String, Path, description = "User identifier")
    ),
    responses(
        (status = 204, description = "User deleted"),
        (status = 400, description = "Invalid user identifier", body = Problem, content_type = "application/problem+json"),
        (status = 401, description = "Authentication required", body = Problem, content_type = "application/problem+json"),
        (status = 429, description = "API rate limit exceeded; see `Retry-After` and `X-RateLimit-*` response headers", body = Problem, content_type = "application/problem+json"),
        (status = 403, description = "Admin role required", body = Problem, content_type = "application/problem+json"),
        (status = 500, description = "Failed to delete user", body = Problem, content_type = "application/problem+json")
    ),
    tag = "Users",
    security(
        ("SessionCookie" = []),
        ("SessionToken" = [])
    )
)]
#[delete("/{id}")]
async fn delete_user(
    svc: Data<UserServiceHandle>,
    actor: ReqData<AuthorizationContext>,
    id: Path<String>,
) -> Result<HttpResponse, AppError> {
    let deleted = svc.delete_user(&id).await?;
    crate::audit!(
        "audit.user.deleted",
        user_id = tracing::field::display(&deleted.id),
        actor_user_id = tracing::field::display(&actor.user.id)
        ; "user deleted"
    );
    Ok(HttpResponse::NoContent().finish())
}
