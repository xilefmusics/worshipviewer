use actix_web::http::header;
use actix_web::{
    HttpRequest, HttpResponse, Scope, delete, get, patch, post, put,
    web::{self, Bytes, Data, Json, Path, Query, ReqData},
};

use crate::accept::accepts_worship_player_json;
use crate::auth::AuthorizationContext;
#[allow(unused_imports)]
use crate::docs::Problem;
use crate::error::AppError;
use crate::http_cache::{check_if_match, if_none_match_matches, weak_etag_json};
use crate::resources::blob::service::BlobServiceHandle;
#[allow(unused_imports)]
use crate::resources::collection::Collection;
use crate::resources::collection::service::CollectionServiceHandle;
use crate::resources::collection::{CreateCollection, UpdateCollection};
use crate::resources::collection::{
    PatchCollection, TransferCollectionSong, TransferCollectionSongResult,
};
#[allow(unused_imports)]
use crate::resources::song::Song;
use crate::settings::CoverUploadLimits;
use shared::MoveOwner;
use shared::api::{ListQuery, PAGE_SIZE_DEFAULT, PageQuery};
#[allow(unused_imports)]
use shared::player::Player;

pub fn scope(cover_upload_max_bytes: usize) -> Scope {
    web::scope("/collections")
        .app_data(web::PayloadConfig::new(cover_upload_max_bytes))
        .service(get_collections)
        .service(get_collection)
        .service(get_collection_songs)
        .service(get_collection_player)
        .service(create_collection)
        .service(update_collection)
        .service(patch_collection)
        .service(move_collection)
        .service(transfer_collection_song)
        .service(delete_collection)
        .service(put_collection_cover)
}

#[utoipa::path(
    get,
    path = "/api/v1/collections",
    params(
        ("page" = Option<u32>, Query, description = "Zero-based page (default 0). `X-Total-Count` = filtered total before pagination; last page when `items.len() < page_size` or empty (`list-pagination.md`).", minimum = 0, nullable = true),
        ("page_size" = Option<u32>, Query, description = "Items per page. Must be 1–500. Defaults to 50.", minimum = 1, maximum = 500, example = 50, nullable = true),
        ("q" = Option<String>, Query, description = "Search query (title): full-text via text_search analyzer (stemming) plus case-insensitive substring match")
    ),
    responses(
        (status = 200, description = "Return all collections. `X-Total-Count` header contains the total number of matching collections.", body = [Collection]),
        (status = 400, description = "Invalid pagination parameters", body = Problem, content_type = "application/problem+json"),
        (status = 401, description = "Authentication required", body = Problem, content_type = "application/problem+json"),
        (status = 429, description = "API rate limit exceeded; see `Retry-After` and `X-RateLimit-*` response headers", body = Problem, content_type = "application/problem+json"),
        (status = 500, description = "Failed to fetch collections", body = Problem, content_type = "application/problem+json")
    ),
    tag = "Collections",
    security(
        ("SessionCookie" = []),
        ("SessionToken" = [])
    )
)]
#[get("")]
async fn get_collections(
    req: HttpRequest,
    svc: Data<CollectionServiceHandle>,
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
    let collections = svc.list_collections_for_user(&ctx, query).await?;
    let total = svc
        .count_collections_for_user(&ctx, q_ref.as_deref())
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
        .json(collections))
}

#[utoipa::path(
    get,
    path = "/api/v1/collections/{id}",
    params(
        ("id" = String, Path, description = "Collection identifier")
    ),
    responses(
        (status = 200, description = "Return a single collection (weak `ETag`; `If-None-Match` supported)", body = Collection),
        (status = 304, description = "Not modified"),
        (status = 400, description = "Invalid collection identifier", body = Problem, content_type = "application/problem+json"),
        (status = 401, description = "Authentication required", body = Problem, content_type = "application/problem+json"),
        (status = 429, description = "API rate limit exceeded; see `Retry-After` and `X-RateLimit-*` response headers", body = Problem, content_type = "application/problem+json"),
        (status = 404, description = "Collection not found", body = Problem, content_type = "application/problem+json"),
        (status = 500, description = "Failed to fetch collection", body = Problem, content_type = "application/problem+json")
    ),
    tag = "Collections",
    security(
        ("SessionCookie" = []),
        ("SessionToken" = [])
    )
)]
#[get("/{id}")]
async fn get_collection(
    req: HttpRequest,
    svc: Data<CollectionServiceHandle>,
    ctx: ReqData<AuthorizationContext>,
    id: Path<String>,
) -> Result<HttpResponse, AppError> {
    let collection = svc.get_collection_for_user(&ctx, &id).await?;
    let etag = weak_etag_json(&collection)
        .map_err(|e| AppError::internal_from_err("collection.rest", e))?;
    if if_none_match_matches(&req, &etag) {
        return Ok(HttpResponse::NotModified()
            .insert_header((header::ETAG, etag))
            .finish());
    }
    Ok(HttpResponse::Ok()
        .insert_header((header::ETAG, etag))
        .json(collection))
}

#[utoipa::path(
    get,
    path = "/api/v1/collections/{id}/player",
    params(
        ("id" = String, Path, description = "Collection identifier")
    ),
    responses(
        (status = 200, description = "Return player metadata for a collection", body = Player),
        (status = 400, description = "Invalid collection identifier", body = Problem, content_type = "application/problem+json"),
        (status = 401, description = "Authentication required", body = Problem, content_type = "application/problem+json"),
        (status = 429, description = "API rate limit exceeded; see `Retry-After` and `X-RateLimit-*` response headers", body = Problem, content_type = "application/problem+json"),
        (status = 404, description = "Collection not found", body = Problem, content_type = "application/problem+json"),
        (status = 406, description = "No supported representation in Accept header", body = Problem, content_type = "application/problem+json"),
        (status = 500, description = "Failed to fetch collection player data", body = Problem, content_type = "application/problem+json")
    ),
    tag = "Collections",
    security(
        ("SessionCookie" = []),
        ("SessionToken" = [])
    )
)]
#[get("/{id}/player")]
async fn get_collection_player(
    req: HttpRequest,
    svc: Data<CollectionServiceHandle>,
    ctx: ReqData<AuthorizationContext>,
    id: Path<String>,
) -> Result<HttpResponse, AppError> {
    if !accepts_worship_player_json(&req) {
        return Err(AppError::not_acceptable(
            "supported Accept values include application/json, application/vnd.worship.player+json, and */*",
        ));
    }
    Ok(HttpResponse::Ok().json(svc.collection_player_for_user(&ctx, &id).await?))
}

#[utoipa::path(
    get,
    path = "/api/v1/collections/{id}/songs",
    params(
        ("id" = String, Path, description = "Collection identifier"),
        ("page" = Option<u32>, Query, description = "Page index, zero-based. Omit with `page_size` for full list.", minimum = 0, nullable = true),
        ("page_size" = Option<u32>, Query, description = "Items per page. Must be 1–500. Defaults to 50. Omit with `page` for full list.", minimum = 1, maximum = 500, example = 50, nullable = true),
    ),
    responses(
        (status = 200, description = "Return the songs for a collection. `X-Total-Count` is the total before paging.", body = [Song]),
        (status = 400, description = "Invalid collection identifier or pagination", body = Problem, content_type = "application/problem+json"),
        (status = 401, description = "Authentication required", body = Problem, content_type = "application/problem+json"),
        (status = 429, description = "API rate limit exceeded; see `Retry-After` and `X-RateLimit-*` response headers", body = Problem, content_type = "application/problem+json"),
        (status = 404, description = "Collection not found", body = Problem, content_type = "application/problem+json"),
        (status = 500, description = "Failed to fetch collection songs", body = Problem, content_type = "application/problem+json")
    ),
    tag = "Collections",
    security(
        ("SessionCookie" = []),
        ("SessionToken" = [])
    )
)]
#[get("/{id}/songs")]
async fn get_collection_songs(
    req: HttpRequest,
    svc: Data<CollectionServiceHandle>,
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
        .collection_songs_for_user(&ctx, &id, query.as_list_query())
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
    path = "/api/v1/collections",
    request_body = CreateCollection,
    responses(
        (status = 201, description = "Create a new collection. Optional request field `owner` is a team id (same format as `Collection.owner`); omit to create under the caller's personal team. Library edit access is required on the target team.", body = Collection),
        (status = 400, description = "Invalid collection payload", body = Problem, content_type = "application/problem+json"),
        (status = 401, description = "Authentication required", body = Problem, content_type = "application/problem+json"),
        (status = 404, description = "Target team not found or caller cannot edit that team's library", body = Problem, content_type = "application/problem+json"),
        (status = 429, description = "API rate limit exceeded; see `Retry-After` and `X-RateLimit-*` response headers", body = Problem, content_type = "application/problem+json"),
        (status = 500, description = "Failed to create collection", body = Problem, content_type = "application/problem+json")
    ),
    tag = "Collections",
    security(
        ("SessionCookie" = []),
        ("SessionToken" = [])
    )
)]
#[post("")]
async fn create_collection(
    svc: Data<CollectionServiceHandle>,
    ctx: ReqData<AuthorizationContext>,
    payload: Json<CreateCollection>,
) -> Result<HttpResponse, AppError> {
    Ok(HttpResponse::Created().json(
        svc.create_collection_for_user(&ctx, payload.into_inner())
            .await?,
    ))
}

#[utoipa::path(
    put,
    path = "/api/v1/collections/{id}",
    params(
        ("id" = String, Path, description = "Collection identifier")
    ),
    request_body = UpdateCollection,
    responses(
        (status = 200, description = "Replace collection fields (`PUT` is full replacement, not upsert; missing id returns **404**).", body = Collection),
        (status = 400, description = "Invalid collection identifier", body = Problem, content_type = "application/problem+json"),
        (status = 401, description = "Authentication required", body = Problem, content_type = "application/problem+json"),
        (status = 429, description = "API rate limit exceeded; see `Retry-After` and `X-RateLimit-*` response headers", body = Problem, content_type = "application/problem+json"),
        (status = 404, description = "Collection not found", body = Problem, content_type = "application/problem+json"),
        (status = 409, description = "Request would remove a song from the collection (BLC-COLL-024)", body = Problem, content_type = "application/problem+json"),
        (status = 412, description = "`If-Match` does not match current weak ETag", body = Problem, content_type = "application/problem+json"),
        (status = 500, description = "Failed to update collection", body = Problem, content_type = "application/problem+json")
    ),
    tag = "Collections",
    security(
        ("SessionCookie" = []),
        ("SessionToken" = [])
    )
)]
#[put("/{id}")]
async fn update_collection(
    req: HttpRequest,
    svc: Data<CollectionServiceHandle>,
    ctx: ReqData<AuthorizationContext>,
    id: Path<String>,
    payload: Json<UpdateCollection>,
) -> Result<HttpResponse, AppError> {
    let id = id.into_inner();
    let collection = svc.get_collection_for_user(&ctx, &id).await?;
    let etag = weak_etag_json(&collection)
        .map_err(|e| AppError::internal_from_err("collection.rest", e))?;
    check_if_match(&req, &etag)?;
    let payload = payload.into_inner();
    let owner = payload.owner.clone();
    let payload = CreateCollection::from(payload);
    Ok(HttpResponse::Ok().json(
        svc.update_collection_for_user(&ctx, &id, payload, owner)
            .await?,
    ))
}

#[utoipa::path(
    put,
    path = "/api/v1/collections/{id}/cover",
    params(
        ("id" = String, Path, description = "Collection identifier")
    ),
    request_body(
        content = Vec<u8>,
        description = "Raw JPEG or PNG cover image",
        content_type = "image/jpeg"
    ),
    responses(
        (status = 200, description = "Cover uploaded; creates a blob and sets `cover` to its id. Returns updated `Collection`.", body = Collection),
        (status = 400, description = "Invalid Content-Type or image", body = Problem, content_type = "application/problem+json"),
        (status = 401, description = "Authentication required", body = Problem, content_type = "application/problem+json"),
        (status = 404, description = "Collection not found or caller lacks library write access", body = Problem, content_type = "application/problem+json"),
        (status = 413, description = "Payload too large", body = Problem, content_type = "application/problem+json"),
        (status = 429, description = "API rate limit exceeded", body = Problem, content_type = "application/problem+json"),
        (status = 500, description = "Failed to upload collection cover", body = Problem, content_type = "application/problem+json")
    ),
    tag = "Collections",
    security(
        ("SessionCookie" = []),
        ("SessionToken" = [])
    )
)]
#[put("/{id}/cover")]
async fn put_collection_cover(
    ctx: ReqData<AuthorizationContext>,
    svc: Data<CollectionServiceHandle>,
    blob_svc: Data<BlobServiceHandle>,
    limits: Data<CoverUploadLimits>,
    id: Path<String>,
    body: Bytes,
    req: HttpRequest,
) -> Result<HttpResponse, AppError> {
    let id = id.into_inner();
    let ct = req
        .headers()
        .get(header::CONTENT_TYPE)
        .and_then(|h| h.to_str().ok())
        .ok_or_else(|| AppError::invalid_request("missing Content-Type"))?;
    let updated = svc
        .upload_collection_cover_for_user(
            blob_svc.get_ref(),
            &ctx,
            &id,
            ct,
            body.as_ref(),
            limits.max_bytes,
        )
        .await?;
    let etag =
        weak_etag_json(&updated).map_err(|e| AppError::internal_from_err("collection.rest", e))?;
    Ok(HttpResponse::Ok()
        .insert_header((header::ETAG, etag))
        .json(updated))
}

#[utoipa::path(
    patch,
    path = "/api/v1/collections/{id}",
    params(
        ("id" = String, Path, description = "Collection identifier")
    ),
    request_body = PatchCollection,
    responses(
        (status = 200, description = "Partially update an existing collection", body = Collection),
        (status = 400, description = "Invalid collection identifier or payload", body = Problem, content_type = "application/problem+json"),
        (status = 401, description = "Authentication required", body = Problem, content_type = "application/problem+json"),
        (status = 429, description = "API rate limit exceeded; see `Retry-After` and `X-RateLimit-*` response headers", body = Problem, content_type = "application/problem+json"),
        (status = 404, description = "Collection not found", body = Problem, content_type = "application/problem+json"),
        (status = 409, description = "Request would remove a song from the collection (BLC-COLL-024)", body = Problem, content_type = "application/problem+json"),
        (status = 412, description = "`If-Match` does not match current weak ETag", body = Problem, content_type = "application/problem+json"),
        (status = 500, description = "Failed to patch collection", body = Problem, content_type = "application/problem+json")
    ),
    tag = "Collections",
    security(
        ("SessionCookie" = []),
        ("SessionToken" = [])
    )
)]
#[patch("/{id}")]
async fn patch_collection(
    req: HttpRequest,
    svc: Data<CollectionServiceHandle>,
    ctx: ReqData<AuthorizationContext>,
    id: Path<String>,
    payload: Json<PatchCollection>,
) -> Result<HttpResponse, AppError> {
    let id = id.into_inner();
    let collection = svc.get_collection_for_user(&ctx, &id).await?;
    let etag = weak_etag_json(&collection)
        .map_err(|e| AppError::internal_from_err("collection.rest", e))?;
    check_if_match(&req, &etag)?;
    Ok(HttpResponse::Ok().json(
        svc.patch_collection_for_user(&ctx, &id, payload.into_inner())
            .await?,
    ))
}

#[utoipa::path(
    post,
    path = "/api/v1/collections/{id}/move",
    params(
        ("id" = String, Path, description = "Collection identifier")
    ),
    request_body = MoveOwner,
    responses(
        (status = 200, description = "Collection moved to the target team, or unchanged when already owned by that team (idempotent).", body = Collection),
        (status = 400, description = "Invalid `owner` team id", body = Problem, content_type = "application/problem+json"),
        (status = 401, description = "Authentication required", body = Problem, content_type = "application/problem+json"),
        (status = 429, description = "API rate limit exceeded; see `Retry-After` and `X-RateLimit-*` response headers", body = Problem, content_type = "application/problem+json"),
        (status = 404, description = "Collection not found, target team not found, or caller lacks library write access on the current or destination team", body = Problem, content_type = "application/problem+json"),
        (status = 500, description = "Failed to move collection", body = Problem, content_type = "application/problem+json")
    ),
    tag = "Collections",
    security(
        ("SessionCookie" = []),
        ("SessionToken" = [])
    )
)]
#[post("/{id}/move")]
async fn move_collection(
    svc: Data<CollectionServiceHandle>,
    ctx: ReqData<AuthorizationContext>,
    id: Path<String>,
    payload: Json<MoveOwner>,
) -> Result<HttpResponse, AppError> {
    Ok(HttpResponse::Ok().json(
        svc.move_collection_for_user(&ctx, &id.into_inner(), payload.into_inner())
            .await?,
    ))
}

#[utoipa::path(
    post,
    path = "/api/v1/collections/{id}/songs/{song_id}/transfer",
    params(
        ("id" = String, Path, description = "Source collection identifier"),
        ("song_id" = String, Path, description = "Song identifier to move")
    ),
    request_body = TransferCollectionSong,
    responses(
        (status = 200, description = "Song link moved from source to target collection atomically.", body = TransferCollectionSongResult),
        (status = 400, description = "Invalid identifiers or source equals target", body = Problem, content_type = "application/problem+json"),
        (status = 401, description = "Authentication required", body = Problem, content_type = "application/problem+json"),
        (status = 404, description = "Collection or song slot not found, or caller lacks library write access", body = Problem, content_type = "application/problem+json"),
        (status = 409, description = "Song already in target collection", body = Problem, content_type = "application/problem+json"),
        (status = 429, description = "API rate limit exceeded", body = Problem, content_type = "application/problem+json"),
        (status = 500, description = "Failed to transfer song between collections", body = Problem, content_type = "application/problem+json")
    ),
    tag = "Collections",
    security(
        ("SessionCookie" = []),
        ("SessionToken" = [])
    )
)]
#[post("/{id}/songs/{song_id}/transfer")]
async fn transfer_collection_song(
    svc: Data<CollectionServiceHandle>,
    ctx: ReqData<AuthorizationContext>,
    path: Path<(String, String)>,
    payload: Json<TransferCollectionSong>,
) -> Result<HttpResponse, AppError> {
    let (source_id, song_id) = path.into_inner();
    Ok(HttpResponse::Ok().json(
        svc.transfer_song_between_collections_for_user(
            &ctx,
            &source_id,
            &song_id,
            payload.into_inner(),
        )
        .await?,
    ))
}

#[utoipa::path(
    delete,
    path = "/api/v1/collections/{id}",
    params(
        ("id" = String, Path, description = "Collection identifier")
    ),
    responses(
        (status = 204, description = "Collection deleted"),
        (status = 400, description = "Invalid collection identifier", body = Problem, content_type = "application/problem+json"),
        (status = 401, description = "Authentication required", body = Problem, content_type = "application/problem+json"),
        (status = 429, description = "API rate limit exceeded; see `Retry-After` and `X-RateLimit-*` response headers", body = Problem, content_type = "application/problem+json"),
        (status = 404, description = "Collection not found", body = Problem, content_type = "application/problem+json"),
        (status = 409, description = "Collection still contains songs (BLC-COLL-025)", body = Problem, content_type = "application/problem+json"),
        (status = 412, description = "`If-Match` does not match current weak ETag", body = Problem, content_type = "application/problem+json"),
        (status = 500, description = "Failed to delete collection", body = Problem, content_type = "application/problem+json")
    ),
    tag = "Collections",
    security(
        ("SessionCookie" = []),
        ("SessionToken" = [])
    )
)]
#[delete("/{id}")]
async fn delete_collection(
    req: HttpRequest,
    svc: Data<CollectionServiceHandle>,
    ctx: ReqData<AuthorizationContext>,
    id: Path<String>,
) -> Result<HttpResponse, AppError> {
    let id = id.into_inner();
    let collection = svc.get_collection_for_user(&ctx, &id).await?;
    let etag = weak_etag_json(&collection)
        .map_err(|e| AppError::internal_from_err("collection.rest", e))?;
    check_if_match(&req, &etag)?;
    svc.delete_collection_for_user(&ctx, &id).await?;
    Ok(HttpResponse::NoContent().finish())
}
