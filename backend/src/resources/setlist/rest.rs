use actix_web::http::header;
use actix_web::{
    HttpRequest, HttpResponse, Scope, delete, get, patch, post, put,
    web::{self, Data, Json, Path, Query, ReqData},
};

use crate::accept::accepts_worship_player_json;
use crate::auth::AuthorizationContext;
#[allow(unused_imports)]
use crate::docs::Problem;
use crate::error::AppError;
use crate::http_cache::{check_if_match, if_none_match_matches, weak_etag_json};
use crate::resources::setlist::PatchSetlist;
#[allow(unused_imports)]
use crate::resources::setlist::Setlist;
use crate::resources::setlist::SetlistServiceHandle;
use crate::resources::setlist::{CreateSetlist, UpdateSetlist};
#[allow(unused_imports)]
use crate::resources::song::Song;
use shared::MoveOwner;
use shared::api::{ListQuery, PAGE_SIZE_DEFAULT, PageQuery};
#[allow(unused_imports)]
use shared::player::Player;

pub fn scope() -> Scope {
    web::scope("/setlists")
        .service(get_setlists)
        .service(get_setlist)
        .service(get_setlist_songs)
        .service(get_setlist_player)
        .service(create_setlist)
        .service(update_setlist)
        .service(patch_setlist)
        .service(move_setlist)
        .service(delete_setlist)
}

#[utoipa::path(
    get,
    path = "/api/v1/setlists",
    params(
        ("page" = Option<u32>, Query, description = "Zero-based page (default 0). `X-Total-Count` = filtered total before pagination; last page when `items.len() < page_size` or empty (`list-pagination.md`).", minimum = 0, nullable = true),
        ("page_size" = Option<u32>, Query, description = "Items per page. Must be 1–500. Defaults to 50.", minimum = 1, maximum = 500, example = 50, nullable = true),
        ("q" = Option<String>, Query, description = "Full-text search query (title); uses text_search analyzer (stemming)")
    ),
    responses(
        (status = 200, description = "Return all setlists. `X-Total-Count` header contains the total number of matching setlists.", body = [Setlist]),
        (status = 400, description = "Invalid pagination parameters", body = Problem, content_type = "application/problem+json"),
        (status = 401, description = "Authentication required", body = Problem, content_type = "application/problem+json"),
        (status = 429, description = "API rate limit exceeded; see `Retry-After` and `X-RateLimit-*` response headers", body = Problem, content_type = "application/problem+json"),
        (status = 500, description = "Failed to fetch setlists", body = Problem, content_type = "application/problem+json")
    ),
    tag = "Setlists",
    security(
        ("SessionCookie" = []),
        ("SessionToken" = [])
    )
)]
#[get("")]
async fn get_setlists(
    req: HttpRequest,
    svc: Data<SetlistServiceHandle>,
    ctx: ReqData<AuthorizationContext>,
    query: Query<ListQuery>,
) -> Result<HttpResponse, AppError> {
    let query = query
        .into_inner()
        .validate()
        .map_err(crate::error::map_list_query_error)?;
    let q_ref = query.q.clone();
    let q_link = query.clone();
    let page = query.page.unwrap_or(0);
    let page_size = query.page_size.unwrap_or(PAGE_SIZE_DEFAULT);
    let setlists = svc.list_setlists_for_user(&ctx, query).await?;
    let total = svc.count_setlists_for_user(&ctx, q_ref.as_deref()).await?;
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
        .json(setlists))
}

#[utoipa::path(
    get,
    path = "/api/v1/setlists/{id}",
    params(
        ("id" = String, Path, description = "Setlist identifier")
    ),
    responses(
        (status = 200, description = "Return a single setlist (weak `ETag`; `If-None-Match` supported)", body = Setlist),
        (status = 304, description = "Not modified"),
        (status = 400, description = "Invalid setlist identifier", body = Problem, content_type = "application/problem+json"),
        (status = 401, description = "Authentication required", body = Problem, content_type = "application/problem+json"),
        (status = 429, description = "API rate limit exceeded; see `Retry-After` and `X-RateLimit-*` response headers", body = Problem, content_type = "application/problem+json"),
        (status = 404, description = "Setlist not found", body = Problem, content_type = "application/problem+json"),
        (status = 500, description = "Failed to fetch setlist", body = Problem, content_type = "application/problem+json")
    ),
    tag = "Setlists",
    security(
        ("SessionCookie" = []),
        ("SessionToken" = [])
    )
)]
#[get("/{id}")]
async fn get_setlist(
    req: HttpRequest,
    svc: Data<SetlistServiceHandle>,
    ctx: ReqData<AuthorizationContext>,
    id: Path<String>,
) -> Result<HttpResponse, AppError> {
    let setlist = svc.get_setlist_for_user(&ctx, &id).await?;
    let etag =
        weak_etag_json(&setlist).map_err(|e| AppError::internal_from_err("setlist.rest", e))?;
    if if_none_match_matches(&req, &etag) {
        return Ok(HttpResponse::NotModified()
            .insert_header((header::ETAG, etag))
            .finish());
    }
    Ok(HttpResponse::Ok()
        .insert_header((header::ETAG, etag))
        .json(setlist))
}

#[utoipa::path(
    get,
    path = "/api/v1/setlists/{id}/player",
    params(
        ("id" = String, Path, description = "Setlist identifier")
    ),
    responses(
        (status = 200, description = "Return player metadata for a setlist", body = Player),
        (status = 400, description = "Invalid setlist identifier", body = Problem, content_type = "application/problem+json"),
        (status = 401, description = "Authentication required", body = Problem, content_type = "application/problem+json"),
        (status = 429, description = "API rate limit exceeded; see `Retry-After` and `X-RateLimit-*` response headers", body = Problem, content_type = "application/problem+json"),
        (status = 404, description = "Setlist not found", body = Problem, content_type = "application/problem+json"),
        (status = 406, description = "No supported representation in Accept header", body = Problem, content_type = "application/problem+json"),
        (status = 500, description = "Failed to fetch setlist player data", body = Problem, content_type = "application/problem+json")
    ),
    tag = "Setlists",
    security(
        ("SessionCookie" = []),
        ("SessionToken" = [])
    )
)]
#[get("/{id}/player")]
async fn get_setlist_player(
    req: HttpRequest,
    svc: Data<SetlistServiceHandle>,
    ctx: ReqData<AuthorizationContext>,
    id: Path<String>,
) -> Result<HttpResponse, AppError> {
    if !accepts_worship_player_json(&req) {
        return Err(AppError::not_acceptable(
            "supported Accept values include application/json, application/vnd.worship.player+json, and */*",
        ));
    }
    Ok(HttpResponse::Ok().json(svc.setlist_player_for_user(&ctx, &id).await?))
}

#[utoipa::path(
    get,
    path = "/api/v1/setlists/{id}/songs",
    params(
        ("id" = String, Path, description = "Setlist identifier"),
        ("page" = Option<u32>, Query, description = "Page index, zero-based. Omit with `page_size` for full list.", minimum = 0, nullable = true),
        ("page_size" = Option<u32>, Query, description = "Items per page. Must be 1–500. Defaults to 50. Omit with `page` for full list.", minimum = 1, maximum = 500, example = 50, nullable = true),
    ),
    responses(
        (status = 200, description = "Return the songs for a setlist. `X-Total-Count` is the total before paging.", body = [Song]),
        (status = 400, description = "Invalid setlist identifier or pagination", body = Problem, content_type = "application/problem+json"),
        (status = 401, description = "Authentication required", body = Problem, content_type = "application/problem+json"),
        (status = 429, description = "API rate limit exceeded; see `Retry-After` and `X-RateLimit-*` response headers", body = Problem, content_type = "application/problem+json"),
        (status = 404, description = "Setlist not found", body = Problem, content_type = "application/problem+json"),
        (status = 500, description = "Failed to fetch setlist songs", body = Problem, content_type = "application/problem+json")
    ),
    tag = "Setlists",
    security(
        ("SessionCookie" = []),
        ("SessionToken" = [])
    )
)]
#[get("/{id}/songs")]
async fn get_setlist_songs(
    req: HttpRequest,
    svc: Data<SetlistServiceHandle>,
    ctx: ReqData<AuthorizationContext>,
    id: Path<String>,
    query: Query<PageQuery>,
) -> Result<HttpResponse, AppError> {
    let query = query
        .into_inner()
        .validate()
        .map_err(crate::error::map_list_query_error)?;
    let q_link = query.clone();
    let page = query.page.unwrap_or(0);
    let page_size = query.page_size.unwrap_or(PAGE_SIZE_DEFAULT);
    let (songs, total) = svc
        .setlist_songs_for_user(&ctx, &id, query.as_list_query())
        .await?;
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
        .json(songs))
}

#[utoipa::path(
    post,
    path = "/api/v1/setlists",
    request_body = CreateSetlist,
    responses(
        (status = 201, description = "Create a new setlist. Optional `owner` is a team id; omit for the caller's personal team. Library edit access is required on the target team.", body = Setlist),
        (status = 400, description = "Invalid setlist payload", body = Problem, content_type = "application/problem+json"),
        (status = 401, description = "Authentication required", body = Problem, content_type = "application/problem+json"),
        (status = 404, description = "Target team not found or caller cannot edit that team's library", body = Problem, content_type = "application/problem+json"),
        (status = 429, description = "API rate limit exceeded; see `Retry-After` and `X-RateLimit-*` response headers", body = Problem, content_type = "application/problem+json"),
        (status = 500, description = "Failed to create setlist", body = Problem, content_type = "application/problem+json")
    ),
    tag = "Setlists",
    security(
        ("SessionCookie" = []),
        ("SessionToken" = [])
    )
)]
#[post("")]
async fn create_setlist(
    svc: Data<SetlistServiceHandle>,
    ctx: ReqData<AuthorizationContext>,
    payload: Json<CreateSetlist>,
) -> Result<HttpResponse, AppError> {
    Ok(HttpResponse::Created().json(
        svc.create_setlist_for_user(&ctx, payload.into_inner())
            .await?,
    ))
}

#[utoipa::path(
    put,
    path = "/api/v1/setlists/{id}",
    params(
        ("id" = String, Path, description = "Setlist identifier")
    ),
    request_body = UpdateSetlist,
    responses(
        (status = 200, description = "Replace setlist fields (`PUT` is full replacement, not upsert; missing id returns **404**).", body = Setlist),
        (status = 400, description = "Invalid setlist identifier", body = Problem, content_type = "application/problem+json"),
        (status = 401, description = "Authentication required", body = Problem, content_type = "application/problem+json"),
        (status = 429, description = "API rate limit exceeded; see `Retry-After` and `X-RateLimit-*` response headers", body = Problem, content_type = "application/problem+json"),
        (status = 404, description = "Setlist not found", body = Problem, content_type = "application/problem+json"),
        (status = 412, description = "`If-Match` does not match current weak ETag", body = Problem, content_type = "application/problem+json"),
        (status = 500, description = "Failed to update setlist", body = Problem, content_type = "application/problem+json")
    ),
    tag = "Setlists",
    security(
        ("SessionCookie" = []),
        ("SessionToken" = [])
    )
)]
#[put("/{id}")]
async fn update_setlist(
    req: HttpRequest,
    svc: Data<SetlistServiceHandle>,
    ctx: ReqData<AuthorizationContext>,
    id: Path<String>,
    payload: Json<UpdateSetlist>,
) -> Result<HttpResponse, AppError> {
    let id = id.into_inner();
    let setlist = svc.get_setlist_for_user(&ctx, &id).await?;
    let etag =
        weak_etag_json(&setlist).map_err(|e| AppError::internal_from_err("setlist.rest", e))?;
    check_if_match(&req, &etag)?;
    let payload = payload.into_inner();
    let owner = payload.owner.clone();
    let payload = CreateSetlist::from(payload);
    Ok(HttpResponse::Ok().json(
        svc.update_setlist_for_user(&ctx, &id, payload, owner)
            .await?,
    ))
}

#[utoipa::path(
    patch,
    path = "/api/v1/setlists/{id}",
    params(
        ("id" = String, Path, description = "Setlist identifier")
    ),
    request_body = PatchSetlist,
    responses(
        (status = 200, description = "Partially update an existing setlist", body = Setlist),
        (status = 400, description = "Invalid setlist identifier or payload", body = Problem, content_type = "application/problem+json"),
        (status = 401, description = "Authentication required", body = Problem, content_type = "application/problem+json"),
        (status = 429, description = "API rate limit exceeded; see `Retry-After` and `X-RateLimit-*` response headers", body = Problem, content_type = "application/problem+json"),
        (status = 404, description = "Setlist not found", body = Problem, content_type = "application/problem+json"),
        (status = 412, description = "`If-Match` does not match current weak ETag", body = Problem, content_type = "application/problem+json"),
        (status = 500, description = "Failed to patch setlist", body = Problem, content_type = "application/problem+json")
    ),
    tag = "Setlists",
    security(
        ("SessionCookie" = []),
        ("SessionToken" = [])
    )
)]
#[patch("/{id}")]
async fn patch_setlist(
    req: HttpRequest,
    svc: Data<SetlistServiceHandle>,
    ctx: ReqData<AuthorizationContext>,
    id: Path<String>,
    payload: Json<PatchSetlist>,
) -> Result<HttpResponse, AppError> {
    let id = id.into_inner();
    let setlist = svc.get_setlist_for_user(&ctx, &id).await?;
    let etag =
        weak_etag_json(&setlist).map_err(|e| AppError::internal_from_err("setlist.rest", e))?;
    check_if_match(&req, &etag)?;
    Ok(HttpResponse::Ok().json(
        svc.patch_setlist_for_user(&ctx, &id, payload.into_inner())
            .await?,
    ))
}

#[utoipa::path(
    post,
    path = "/api/v1/setlists/{id}/move",
    params(
        ("id" = String, Path, description = "Setlist identifier")
    ),
    request_body = MoveOwner,
    responses(
        (status = 200, description = "Setlist moved to the target team, or unchanged when already owned by that team (idempotent).", body = Setlist),
        (status = 400, description = "Invalid `owner` team id", body = Problem, content_type = "application/problem+json"),
        (status = 401, description = "Authentication required", body = Problem, content_type = "application/problem+json"),
        (status = 429, description = "API rate limit exceeded; see `Retry-After` and `X-RateLimit-*` response headers", body = Problem, content_type = "application/problem+json"),
        (status = 404, description = "Setlist not found, target team not found, or caller lacks library write access on the current or destination team", body = Problem, content_type = "application/problem+json"),
        (status = 500, description = "Failed to move setlist", body = Problem, content_type = "application/problem+json")
    ),
    tag = "Setlists",
    security(
        ("SessionCookie" = []),
        ("SessionToken" = [])
    )
)]
#[post("/{id}/move")]
async fn move_setlist(
    svc: Data<SetlistServiceHandle>,
    ctx: ReqData<AuthorizationContext>,
    id: Path<String>,
    payload: Json<MoveOwner>,
) -> Result<HttpResponse, AppError> {
    Ok(HttpResponse::Ok().json(
        svc.move_setlist_for_user(&ctx, &id.into_inner(), payload.into_inner())
            .await?,
    ))
}

#[utoipa::path(
    delete,
    path = "/api/v1/setlists/{id}",
    params(
        ("id" = String, Path, description = "Setlist identifier")
    ),
    responses(
        (status = 204, description = "Setlist deleted"),
        (status = 400, description = "Invalid setlist identifier", body = Problem, content_type = "application/problem+json"),
        (status = 401, description = "Authentication required", body = Problem, content_type = "application/problem+json"),
        (status = 429, description = "API rate limit exceeded; see `Retry-After` and `X-RateLimit-*` response headers", body = Problem, content_type = "application/problem+json"),
        (status = 404, description = "Setlist not found", body = Problem, content_type = "application/problem+json"),
        (status = 412, description = "`If-Match` does not match current weak ETag", body = Problem, content_type = "application/problem+json"),
        (status = 500, description = "Failed to delete setlist", body = Problem, content_type = "application/problem+json")
    ),
    tag = "Setlists",
    security(
        ("SessionCookie" = []),
        ("SessionToken" = [])
    )
)]
#[delete("/{id}")]
async fn delete_setlist(
    req: HttpRequest,
    svc: Data<SetlistServiceHandle>,
    ctx: ReqData<AuthorizationContext>,
    id: Path<String>,
) -> Result<HttpResponse, AppError> {
    let id = id.into_inner();
    let setlist = svc.get_setlist_for_user(&ctx, &id).await?;
    let etag =
        weak_etag_json(&setlist).map_err(|e| AppError::internal_from_err("setlist.rest", e))?;
    check_if_match(&req, &etag)?;
    svc.delete_setlist_for_user(&ctx, &id).await?;
    Ok(HttpResponse::NoContent().finish())
}
