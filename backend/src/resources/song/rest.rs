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
use crate::resources::song::PatchSong;
#[allow(unused_imports)]
use crate::resources::song::Song;
use crate::resources::song::SongUpsertOutcome;
use crate::resources::song::service::SongServiceHandle;
use crate::resources::song::{CreateSong, UpdateSong};
use shared::MoveOwner;
use shared::api::{PAGE_SIZE_DEFAULT, SongListQuery};
use shared::like::LikeStatus;
#[allow(unused_imports)]
use shared::player::Player;

pub fn scope() -> Scope {
    web::scope("/songs")
        .service(get_songs)
        .service(get_song)
        .service(get_song_player)
        .service(create_song)
        .service(update_song)
        .service(patch_song)
        .service(move_song)
        .service(delete_song)
        .service(get_song_like_status)
        .service(put_song_like)
        .service(delete_song_like)
}

#[utoipa::path(
    get,
    path = "/api/v1/songs",
    params(
        ("page" = Option<u32>, Query, description = "Zero-based page index (default 0). `X-Total-Count` is the total before pagination; the last page is when `items.len() < page_size` or the list is empty (see `docs/business-logic-constraints/list-pagination.md`).", minimum = 0, nullable = true),
        ("page_size" = Option<u32>, Query, description = "Items per page. Must be 1–500. Defaults to 50.", minimum = 1, maximum = 500, example = 50, nullable = true),
        ("q" = Option<String>, Query, description = "Full-text search query (titles, artists, line lyrics); uses text_search analyzer (stemming)"),
        ("sort" = Option<String>, Query, description = "Sort: JSON:API-style comma-separated keys (`-` = descending), e.g. `-id`, `title`, `relevance` (with `q`). Legacy `id_desc` / … still accepted."),
        ("lang" = Option<String>, Query, description = "Filter: song must list this language in `data.languages`."),
        ("tag" = Option<String>, Query, description = "Filter: case-insensitive substring match on stringified `data.tags`.")
    ),
    responses(
        (status = 200, description = "Return all songs. `X-Total-Count` header contains the total number of matching songs.", body = [Song]),
        (status = 400, description = "Invalid pagination or filter parameters", body = Problem, content_type = "application/problem+json"),
        (status = 401, description = "Authentication required", body = Problem, content_type = "application/problem+json"),
        (status = 429, description = "API rate limit exceeded; see `Retry-After` and `X-RateLimit-*` response headers", body = Problem, content_type = "application/problem+json"),
        (status = 500, description = "Failed to fetch songs", body = Problem, content_type = "application/problem+json")
    ),
    tag = "Songs",
    security(
        ("SessionCookie" = []),
        ("SessionToken" = [])
    )
)]
#[get("")]
async fn get_songs(
    req: HttpRequest,
    svc: Data<SongServiceHandle>,
    ctx: ReqData<AuthorizationContext>,
    query: Query<SongListQuery>,
) -> Result<HttpResponse, AppError> {
    let query = query
        .into_inner()
        .validate()
        .map_err(crate::error::map_list_query_error)?;
    let songs = svc.list_songs_for_user(&ctx, query.clone()).await?;
    let total = svc.count_songs_for_user(&ctx, &query).await?;
    let page = query.page.unwrap_or(0);
    let page_size = query.page_size.unwrap_or(PAGE_SIZE_DEFAULT);
    let q_for_link = query.clone();
    Ok(HttpResponse::Ok()
        .insert_header((
            header::HeaderName::from_static("x-total-count"),
            total.to_string(),
        ))
        .insert_header((
            header::LINK,
            crate::request_link::list_link_header(
                &req,
                |p| q_for_link.query_string_for_page(p),
                page,
                page_size,
                total,
            ),
        ))
        .json(songs))
}

#[utoipa::path(
    get,
    path = "/api/v1/songs/{id}",
    params(
        ("id" = String, Path, description = "Song identifier")
    ),
    responses(
        (status = 200, description = "Return a single song. Response includes a weak `ETag`; send `If-None-Match` for conditional requests.", body = Song),
        (status = 304, description = "Not modified (when `If-None-Match` matches the current ETag)"),
        (status = 400, description = "Invalid song identifier", body = Problem, content_type = "application/problem+json"),
        (status = 401, description = "Authentication required", body = Problem, content_type = "application/problem+json"),
        (status = 429, description = "API rate limit exceeded; see `Retry-After` and `X-RateLimit-*` response headers", body = Problem, content_type = "application/problem+json"),
        (status = 404, description = "Song not found", body = Problem, content_type = "application/problem+json"),
        (status = 500, description = "Failed to fetch song", body = Problem, content_type = "application/problem+json")
    ),
    tag = "Songs",
    security(
        ("SessionCookie" = []),
        ("SessionToken" = [])
    )
)]
#[get("/{id}")]
async fn get_song(
    req: HttpRequest,
    svc: Data<SongServiceHandle>,
    ctx: ReqData<AuthorizationContext>,
    id: Path<String>,
) -> Result<HttpResponse, AppError> {
    let song = svc.get_song_for_user(&ctx, &id).await?;
    let etag = weak_etag_json(&song).map_err(|e| AppError::internal_from_err("song.rest", e))?;
    if if_none_match_matches(&req, &etag) {
        return Ok(HttpResponse::NotModified()
            .insert_header((header::ETAG, etag))
            .finish());
    }
    Ok(HttpResponse::Ok()
        .insert_header((header::ETAG, etag))
        .json(song))
}

#[utoipa::path(
    get,
    path = "/api/v1/songs/{id}/player",
    params(
        ("id" = String, Path, description = "Song identifier")
    ),
    responses(
        (status = 200, description = "Return player metadata for a song (`Content-Type: application/json`). Send `Accept: application/json`, `application/vnd.worship.player+json`, or `*/*`.", body = Player),
        (status = 400, description = "Invalid song identifier", body = Problem, content_type = "application/problem+json"),
        (status = 401, description = "Authentication required", body = Problem, content_type = "application/problem+json"),
        (status = 429, description = "API rate limit exceeded; see `Retry-After` and `X-RateLimit-*` response headers", body = Problem, content_type = "application/problem+json"),
        (status = 404, description = "Song not found", body = Problem, content_type = "application/problem+json"),
        (status = 406, description = "No supported representation in Accept header", body = Problem, content_type = "application/problem+json"),
        (status = 500, description = "Failed to fetch song player data", body = Problem, content_type = "application/problem+json")
    ),
    tag = "Songs",
    security(
        ("SessionCookie" = []),
        ("SessionToken" = [])
    )
)]
#[get("/{id}/player")]
async fn get_song_player(
    req: HttpRequest,
    svc: Data<SongServiceHandle>,
    ctx: ReqData<AuthorizationContext>,
    id: Path<String>,
) -> Result<HttpResponse, AppError> {
    if !accepts_worship_player_json(&req) {
        return Err(AppError::not_acceptable(
            "supported Accept values include application/json, application/vnd.worship.player+json, and */*",
        ));
    }
    Ok(HttpResponse::Ok().json(svc.song_player_for_user(&ctx, &id).await?))
}

#[utoipa::path(
    post,
    path = "/api/v1/songs",
    request_body = CreateSong,
    responses(
        (status = 201, description = "Create a new song. Optional `owner` is a team id; omit for the caller's personal team. When the effective target is the personal team, default-collection behavior may apply (BLC-SONG-010). When `owner` names a different team the song is created there without that default-collection side effect. Library edit access is required on the target team.", body = Song),
        (status = 400, description = "Invalid song payload", body = Problem, content_type = "application/problem+json"),
        (status = 401, description = "Authentication required", body = Problem, content_type = "application/problem+json"),
        (status = 404, description = "Target team not found or caller cannot edit that team's library", body = Problem, content_type = "application/problem+json"),
        (status = 429, description = "API rate limit exceeded; see `Retry-After` and `X-RateLimit-*` response headers", body = Problem, content_type = "application/problem+json"),
        (status = 500, description = "Failed to create song", body = Problem, content_type = "application/problem+json")
    ),
    tag = "Songs",
    security(
        ("SessionCookie" = []),
        ("SessionToken" = [])
    )
)]
#[post("")]
async fn create_song(
    svc: Data<SongServiceHandle>,
    ctx: ReqData<AuthorizationContext>,
    payload: Json<CreateSong>,
) -> Result<HttpResponse, AppError> {
    let payload = payload.into_inner();
    payload.validate().map_err(AppError::invalid_request)?;
    Ok(HttpResponse::Created().json(svc.create_song_for_user(&ctx, payload).await?))
}

#[utoipa::path(
    put,
    path = "/api/v1/songs/{id}",
    params(
        ("id" = String, Path, description = "Song identifier")
    ),
    request_body = UpdateSong,
    responses(
        (status = 200, description = "Updated an existing song. Upsert: if the id did not exist, responds **201** with `Location` (see BLC / `http-contract.md`).", body = Song),
        (status = 201, description = "Created the song via PUT upsert (new id). Response includes `Location: /api/v1/songs/{id}`.", body = Song),
        (status = 400, description = "Invalid song identifier", body = Problem, content_type = "application/problem+json"),
        (status = 401, description = "Authentication required", body = Problem, content_type = "application/problem+json"),
        (status = 429, description = "API rate limit exceeded; see `Retry-After` and `X-RateLimit-*` response headers", body = Problem, content_type = "application/problem+json"),
        (status = 404, description = "Song not found", body = Problem, content_type = "application/problem+json"),
        (status = 412, description = "`If-Match` does not match current weak ETag", body = Problem, content_type = "application/problem+json"),
        (status = 500, description = "Failed to update song", body = Problem, content_type = "application/problem+json")
    ),
    tag = "Songs",
    security(
        ("SessionCookie" = []),
        ("SessionToken" = [])
    )
)]
#[put("/{id}")]
async fn update_song(
    req: HttpRequest,
    svc: Data<SongServiceHandle>,
    ctx: ReqData<AuthorizationContext>,
    id: Path<String>,
    payload: Json<UpdateSong>,
) -> Result<HttpResponse, AppError> {
    let payload = payload.into_inner();
    payload.validate().map_err(AppError::invalid_request)?;
    let owner = payload.owner.clone();
    let payload = CreateSong::from(payload);
    let id = id.into_inner();
    match svc.get_song_for_user(&ctx, &id).await {
        Ok(song) => {
            let etag =
                weak_etag_json(&song).map_err(|e| AppError::internal_from_err("song.rest", e))?;
            check_if_match(&req, &etag)?;
        }
        Err(AppError::NotFound(_)) => {}
        Err(e) => return Err(e),
    }
    match svc.update_song_for_user(&ctx, &id, payload, owner).await? {
        SongUpsertOutcome::Created(song) => Ok(HttpResponse::Created()
            .insert_header((header::LOCATION, format!("/api/v1/songs/{}", song.id)))
            .json(song)),
        SongUpsertOutcome::Updated(song) => Ok(HttpResponse::Ok().json(song)),
    }
}

#[utoipa::path(
    patch,
    path = "/api/v1/songs/{id}",
    params(
        ("id" = String, Path, description = "Song identifier")
    ),
    request_body = PatchSong,
    responses(
        (status = 200, description = "Partially update an existing song", body = Song),
        (status = 400, description = "Invalid song identifier or payload", body = Problem, content_type = "application/problem+json"),
        (status = 401, description = "Authentication required", body = Problem, content_type = "application/problem+json"),
        (status = 429, description = "API rate limit exceeded; see `Retry-After` and `X-RateLimit-*` response headers", body = Problem, content_type = "application/problem+json"),
        (status = 404, description = "Song not found", body = Problem, content_type = "application/problem+json"),
        (status = 412, description = "`If-Match` does not match current weak ETag", body = Problem, content_type = "application/problem+json"),
        (status = 500, description = "Failed to patch song", body = Problem, content_type = "application/problem+json")
    ),
    tag = "Songs",
    security(
        ("SessionCookie" = []),
        ("SessionToken" = [])
    )
)]
#[patch("/{id}")]
async fn patch_song(
    req: HttpRequest,
    svc: Data<SongServiceHandle>,
    ctx: ReqData<AuthorizationContext>,
    id: Path<String>,
    payload: Json<PatchSong>,
) -> Result<HttpResponse, AppError> {
    let id = id.into_inner();
    let song = svc.get_song_for_user(&ctx, &id).await?;
    let etag = weak_etag_json(&song).map_err(|e| AppError::internal_from_err("song.rest", e))?;
    check_if_match(&req, &etag)?;
    Ok(HttpResponse::Ok().json(
        svc.patch_song_for_user(&ctx, &id, payload.into_inner())
            .await?,
    ))
}

#[utoipa::path(
    post,
    path = "/api/v1/songs/{id}/move",
    params(
        ("id" = String, Path, description = "Song identifier")
    ),
    request_body = MoveOwner,
    responses(
        (status = 200, description = "Song moved to the target team, or unchanged when already owned by that team (idempotent). Moving does not add or remove the song from collections.", body = Song),
        (status = 400, description = "Invalid `owner` team id", body = Problem, content_type = "application/problem+json"),
        (status = 401, description = "Authentication required", body = Problem, content_type = "application/problem+json"),
        (status = 429, description = "API rate limit exceeded; see `Retry-After` and `X-RateLimit-*` response headers", body = Problem, content_type = "application/problem+json"),
        (status = 404, description = "Song not found, target team not found, or caller lacks library write access on the current or destination team", body = Problem, content_type = "application/problem+json"),
        (status = 500, description = "Failed to move song", body = Problem, content_type = "application/problem+json")
    ),
    tag = "Songs",
    security(
        ("SessionCookie" = []),
        ("SessionToken" = [])
    )
)]
#[post("/{id}/move")]
async fn move_song(
    svc: Data<SongServiceHandle>,
    ctx: ReqData<AuthorizationContext>,
    id: Path<String>,
    payload: Json<MoveOwner>,
) -> Result<HttpResponse, AppError> {
    Ok(HttpResponse::Ok().json(
        svc.move_song_for_user(&ctx, &id.into_inner(), payload.into_inner())
            .await?,
    ))
}

#[utoipa::path(
    delete,
    path = "/api/v1/songs/{id}",
    params(
        ("id" = String, Path, description = "Song identifier")
    ),
    responses(
        (status = 204, description = "Song deleted"),
        (status = 400, description = "Invalid song identifier", body = Problem, content_type = "application/problem+json"),
        (status = 401, description = "Authentication required", body = Problem, content_type = "application/problem+json"),
        (status = 429, description = "API rate limit exceeded; see `Retry-After` and `X-RateLimit-*` response headers", body = Problem, content_type = "application/problem+json"),
        (status = 404, description = "Song not found", body = Problem, content_type = "application/problem+json"),
        (status = 412, description = "`If-Match` does not match current weak ETag", body = Problem, content_type = "application/problem+json"),
        (status = 500, description = "Failed to delete song", body = Problem, content_type = "application/problem+json")
    ),
    tag = "Songs",
    security(
        ("SessionCookie" = []),
        ("SessionToken" = [])
    )
)]
#[delete("/{id}")]
async fn delete_song(
    req: HttpRequest,
    svc: Data<SongServiceHandle>,
    ctx: ReqData<AuthorizationContext>,
    id: Path<String>,
) -> Result<HttpResponse, AppError> {
    let id = id.into_inner();
    let song = svc.get_song_for_user(&ctx, &id).await?;
    let etag = weak_etag_json(&song).map_err(|e| AppError::internal_from_err("song.rest", e))?;
    check_if_match(&req, &etag)?;
    svc.delete_song_for_user(&ctx, &id).await?;
    Ok(HttpResponse::NoContent().finish())
}

#[utoipa::path(
    get,
    path = "/api/v1/songs/{id}/like",
    params(
        ("id" = String, Path, description = "Song identifier")
    ),
    responses(
        (status = 200, description = "Whether the current user likes this song", body = LikeStatus),
        (status = 400, description = "Invalid song identifier", body = Problem, content_type = "application/problem+json"),
        (status = 401, description = "Authentication required", body = Problem, content_type = "application/problem+json"),
        (status = 429, description = "API rate limit exceeded; see `Retry-After` and `X-RateLimit-*` response headers", body = Problem, content_type = "application/problem+json"),
        (status = 404, description = "Song not found", body = Problem, content_type = "application/problem+json"),
        (status = 500, description = "Failed to get like status for a song", body = Problem, content_type = "application/problem+json")
    ),
    tag = "Songs",
    security(
        ("SessionCookie" = []),
        ("SessionToken" = [])
    )
)]
#[get("/{id}/like")]
async fn get_song_like_status(
    svc: Data<SongServiceHandle>,
    ctx: ReqData<AuthorizationContext>,
    id: Path<String>,
) -> Result<HttpResponse, AppError> {
    Ok(HttpResponse::Ok().json(svc.song_like_status_for_user(&ctx, &id).await?))
}

#[utoipa::path(
    put,
    path = "/api/v1/songs/{id}/like",
    params(
        ("id" = String, Path, description = "Song identifier")
    ),
    responses(
        (status = 204, description = "Current user now likes this song"),
        (status = 400, description = "Invalid song identifier", body = Problem, content_type = "application/problem+json"),
        (status = 401, description = "Authentication required", body = Problem, content_type = "application/problem+json"),
        (status = 429, description = "API rate limit exceeded; see `Retry-After` and `X-RateLimit-*` response headers", body = Problem, content_type = "application/problem+json"),
        (status = 404, description = "Song not found", body = Problem, content_type = "application/problem+json"),
        (status = 500, description = "Failed to update like status for a song", body = Problem, content_type = "application/problem+json")
    ),
    tag = "Songs",
    security(
        ("SessionCookie" = []),
        ("SessionToken" = [])
    )
)]
#[put("/{id}/like")]
async fn put_song_like(
    svc: Data<SongServiceHandle>,
    ctx: ReqData<AuthorizationContext>,
    id: Path<String>,
) -> Result<HttpResponse, AppError> {
    svc.set_song_like_status_for_user(&ctx, &id, true).await?;
    Ok(HttpResponse::NoContent().finish())
}

#[utoipa::path(
    delete,
    path = "/api/v1/songs/{id}/like",
    params(
        ("id" = String, Path, description = "Song identifier")
    ),
    responses(
        (status = 204, description = "Current user no longer likes this song"),
        (status = 400, description = "Invalid song identifier", body = Problem, content_type = "application/problem+json"),
        (status = 401, description = "Authentication required", body = Problem, content_type = "application/problem+json"),
        (status = 429, description = "API rate limit exceeded; see `Retry-After` and `X-RateLimit-*` response headers", body = Problem, content_type = "application/problem+json"),
        (status = 404, description = "Song not found", body = Problem, content_type = "application/problem+json"),
        (status = 500, description = "Failed to update like status for a song", body = Problem, content_type = "application/problem+json")
    ),
    tag = "Songs",
    security(
        ("SessionCookie" = []),
        ("SessionToken" = [])
    )
)]
#[delete("/{id}/like")]
async fn delete_song_like(
    svc: Data<SongServiceHandle>,
    ctx: ReqData<AuthorizationContext>,
    id: Path<String>,
) -> Result<HttpResponse, AppError> {
    svc.set_song_like_status_for_user(&ctx, &id, false).await?;
    Ok(HttpResponse::NoContent().finish())
}
