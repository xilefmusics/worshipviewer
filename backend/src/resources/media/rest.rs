use actix_web::http::header;
use actix_web::{
    HttpRequest, HttpResponse, Scope, delete, get, post, put,
    web::{self, Data, Json, Path, Query, ReqData},
};

use shared::MoveOwner;
use shared::api::PAGE_SIZE_DEFAULT;
use shared::media::{CommitDeck, CreateMedia, DuplicateMedia, Media, MediaListQuery, UpdateMedia};

use crate::auth::AuthorizationContext;
use crate::docs::Problem;
use crate::error::AppError;
use crate::http_cache::{check_if_match, if_none_match_matches, weak_etag_json};

use crate::settings::MediaAssetUploadLimits;

use super::service::MediaServiceHandle;

pub fn scope(asset_upload_limits: MediaAssetUploadLimits) -> Scope {
    web::scope("/media")
        .service(list_media)
        .service(get_media)
        .service(create_media)
        .service(update_media)
        .service(move_media)
        .service(duplicate_media)
        .service(delete_media)
        .service(commit_deck)
        .service(begin_deck_revision)
        .service(crate::resources::media_asset::rest::get_media_asset_data)
        .service(crate::resources::media_asset::rest::head_media_asset_data)
        .service(crate::resources::media_asset::rest::upload_scope(
            asset_upload_limits,
        ))
}

#[utoipa::path(get, path = "/api/v1/media",
    params(
        ("page" = Option<u32>, Query, description = "Zero-based page", minimum = 0, nullable = true),
        ("page_size" = Option<u32>, Query, description = "Items per page (1–500, default 50)", minimum = 1, maximum = 500, nullable = true),
        ("q" = Option<String>, Query, description = "Debounced-search-compatible title query"),
        ("team" = Option<String>, Query, description = "Readable owning team id"),
        ("is_background" = Option<bool>, Query, description = "Filter by AV background flag")
    ),
    responses(
        (status = 200, description = "Readable media in stable title/id order; includes X-Total-Count and pagination Link headers", body = [Media]),
        (status = 400, description = "Invalid query", body = Problem, content_type = "application/problem+json"),
        (status = 401, description = "Authentication required", body = Problem, content_type = "application/problem+json")
    ), tag = "Media", security(("SessionCookie" = []), ("SessionToken" = [])))]
#[get("")]
pub async fn list_media(
    req: HttpRequest,
    svc: Data<MediaServiceHandle>,
    ctx: ReqData<AuthorizationContext>,
    query: Query<MediaListQuery>,
) -> Result<HttpResponse, AppError> {
    let query = query
        .into_inner()
        .validate()
        .map_err(crate::error::map_list_query_error)?;
    let page = query.page.unwrap_or(0);
    let page_size = query.page_size.unwrap_or(PAGE_SIZE_DEFAULT);
    let total = svc.count_for_user(&ctx, &query).await?;
    let links = crate::request_link::list_link_header(
        &req,
        |p| query.query_string_for_page(p),
        page,
        page_size,
        total,
    );
    Ok(HttpResponse::Ok()
        .insert_header((
            header::HeaderName::from_static("x-total-count"),
            total.to_string(),
        ))
        .insert_header((header::LINK, links))
        .json(svc.list_for_user(&ctx, query).await?))
}

#[utoipa::path(get, path = "/api/v1/media/{id}", params(("id" = String, Path)),
    responses(
        (status = 200, description = "Readable media with weak ETag", body = Media),
        (status = 304, description = "Not modified"),
        (status = 404, description = "Media absent or concealed", body = Problem, content_type = "application/problem+json")
    ), tag = "Media", security(("SessionCookie" = []), ("SessionToken" = [])))]
#[get("/{id}")]
pub async fn get_media(
    req: HttpRequest,
    svc: Data<MediaServiceHandle>,
    ctx: ReqData<AuthorizationContext>,
    id: Path<String>,
) -> Result<HttpResponse, AppError> {
    let media = svc.get_for_user(&ctx, &id).await?;
    let etag = weak_etag_json(&media).map_err(|e| AppError::internal_from_err("media.rest", e))?;
    if if_none_match_matches(&req, &etag) {
        return Ok(HttpResponse::NotModified()
            .insert_header((header::ETAG, etag))
            .finish());
    }
    Ok(HttpResponse::Ok()
        .insert_header((header::ETAG, etag))
        .json(media))
}

#[utoipa::path(post, path = "/api/v1/media", request_body = CreateMedia,
    responses(
        (status = 201, description = "Create normalized Ready URL media", body = Media),
        (status = 400, description = "Invalid payload or URL (`media_invalid_url` / `media_unsupported_url`)", body = Problem, content_type = "application/problem+json"),
        (status = 404, description = "Target team absent or concealed", body = Problem, content_type = "application/problem+json")
    ), tag = "Media", security(("SessionCookie" = []), ("SessionToken" = [])))]
#[post("")]
pub async fn create_media(
    svc: Data<MediaServiceHandle>,
    ctx: ReqData<AuthorizationContext>,
    payload: Json<CreateMedia>,
) -> Result<HttpResponse, AppError> {
    Ok(HttpResponse::Created().json(svc.create_for_user(&ctx, payload.into_inner()).await?))
}

#[utoipa::path(put, path = "/api/v1/media/{id}", params(("id" = String, Path)), request_body = UpdateMedia,
    responses(
        (status = 200, description = "Replace title/content and optionally owner", body = Media),
        (status = 400, description = "Invalid payload or URL", body = Problem, content_type = "application/problem+json"),
        (status = 409, description = "Media changed concurrently", body = Problem, content_type = "application/problem+json"),
        (status = 404, description = "Media or destination absent/concealed", body = Problem, content_type = "application/problem+json"),
        (status = 412, description = "If-Match failed", body = Problem, content_type = "application/problem+json")
    ), tag = "Media", security(("SessionCookie" = []), ("SessionToken" = [])))]
#[put("/{id}")]
pub async fn update_media(
    req: HttpRequest,
    svc: Data<MediaServiceHandle>,
    ctx: ReqData<AuthorizationContext>,
    id: Path<String>,
    payload: Json<UpdateMedia>,
) -> Result<HttpResponse, AppError> {
    let id = id.into_inner();
    let current = svc.get_for_user(&ctx, &id).await?;
    let etag =
        weak_etag_json(&current).map_err(|e| AppError::internal_from_err("media.rest", e))?;
    check_if_match(&req, &etag)?;
    Ok(HttpResponse::Ok().json(
        svc.update_current_for_user(&ctx, &id, &current, payload.into_inner())
            .await?,
    ))
}

#[utoipa::path(post, path = "/api/v1/media/{id}/move", params(("id" = String, Path)), request_body = MoveOwner,
    responses(
        (status = 200, description = "Atomically change owner after write checks on both teams", body = Media),
        (status = 404, description = "Media/source/destination absent or concealed", body = Problem, content_type = "application/problem+json")
    ), tag = "Media", security(("SessionCookie" = []), ("SessionToken" = [])))]
#[post("/{id}/move")]
pub async fn move_media(
    svc: Data<MediaServiceHandle>,
    ctx: ReqData<AuthorizationContext>,
    id: Path<String>,
    payload: Json<MoveOwner>,
) -> Result<HttpResponse, AppError> {
    Ok(HttpResponse::Ok().json(svc.move_for_user(&ctx, &id, payload.into_inner()).await?))
}

#[utoipa::path(post, path = "/api/v1/media/{id}/duplicate", params(("id" = String, Path)), request_body = DuplicateMedia,
    responses(
        (status = 201, description = "Create an independent copy of URL media", body = Media),
        (status = 400, description = "Invalid payload", body = Problem, content_type = "application/problem+json"),
        (status = 404, description = "Media/destination absent or concealed", body = Problem, content_type = "application/problem+json")
    ), tag = "Media", security(("SessionCookie" = []), ("SessionToken" = [])))]
#[post("/{id}/duplicate")]
pub async fn duplicate_media(
    svc: Data<MediaServiceHandle>,
    ctx: ReqData<AuthorizationContext>,
    id: Path<String>,
    payload: Json<DuplicateMedia>,
) -> Result<HttpResponse, AppError> {
    Ok(HttpResponse::Created().json(
        svc.duplicate_for_user(&ctx, &id, payload.into_inner())
            .await?,
    ))
}

#[utoipa::path(delete, path = "/api/v1/media/{id}", params(("id" = String, Path)),
    responses(
        (status = 204, description = "Delete media regardless of references"),
        (status = 409, description = "Media changed concurrently", body = Problem, content_type = "application/problem+json"),
        (status = 404, description = "Media absent or concealed", body = Problem, content_type = "application/problem+json"),
        (status = 412, description = "If-Match failed", body = Problem, content_type = "application/problem+json")
    ), tag = "Media", security(("SessionCookie" = []), ("SessionToken" = [])))]
#[delete("/{id}")]
pub async fn delete_media(
    req: HttpRequest,
    svc: Data<MediaServiceHandle>,
    ctx: ReqData<AuthorizationContext>,
    id: Path<String>,
) -> Result<HttpResponse, AppError> {
    let id = id.into_inner();
    let current = svc.get_for_user(&ctx, &id).await?;
    let etag =
        weak_etag_json(&current).map_err(|e| AppError::internal_from_err("media.rest", e))?;
    check_if_match(&req, &etag)?;
    svc.delete_current_for_user(&ctx, &id, &current).await?;
    Ok(HttpResponse::NoContent().finish())
}

#[utoipa::path(
    post,
    path = "/api/v1/media/{id}/deck/revisions",
    params(("id" = String, Path)),
    responses(
        (status = 200, description = "Begin or return the current staged slide-deck revision", body = Media),
        (status = 400, description = "Media is not a slide deck", body = Problem, content_type = "application/problem+json"),
        (status = 409, description = "Media changed concurrently", body = Problem, content_type = "application/problem+json"),
        (status = 404, description = "Media absent or concealed", body = Problem, content_type = "application/problem+json")
    ),
    tag = "Media",
    security(("SessionCookie" = []), ("SessionToken" = []))
)]
#[post("/{id}/deck/revisions")]
pub async fn begin_deck_revision(
    svc: Data<MediaServiceHandle>,
    ctx: ReqData<AuthorizationContext>,
    id: Path<String>,
) -> Result<HttpResponse, AppError> {
    Ok(HttpResponse::Ok().json(
        svc.begin_deck_revision_for_user(&ctx, &id.into_inner())
            .await?,
    ))
}

#[utoipa::path(
    post,
    path = "/api/v1/media/{id}/deck/commit",
    params(("id" = String, Path)),
    request_body = CommitDeck,
    responses(
        (status = 200, description = "Commit the staged slide-deck revision", body = Media),
        (status = 400, description = "Empty or stale revision", body = Problem, content_type = "application/problem+json"),
        (status = 409, description = "Media changed concurrently", body = Problem, content_type = "application/problem+json"),
        (status = 404, description = "Media absent or concealed", body = Problem, content_type = "application/problem+json")
    ),
    tag = "Media",
    security(("SessionCookie" = []), ("SessionToken" = []))
)]
#[post("/{id}/deck/commit")]
pub async fn commit_deck(
    svc: Data<MediaServiceHandle>,
    ctx: ReqData<AuthorizationContext>,
    id: Path<String>,
    payload: Json<CommitDeck>,
) -> Result<HttpResponse, AppError> {
    Ok(HttpResponse::Ok().json(
        svc.commit_deck_for_user(&ctx, &id.into_inner(), payload.into_inner())
            .await?,
    ))
}
