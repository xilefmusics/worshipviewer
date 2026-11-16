use actix_web::{
    HttpRequest, HttpResponse, Scope, delete, get, head, post, put,
    web::{self, Data, Json, Path, ReqData},
};

use std::sync::Arc;

use futures_util::StreamExt;
use shared::MediaAssetKind;
use shared::media::{
    CreateUploadSession, Media, UploadSession, UploadSessionTarget, UploadedMediaKind,
};

use crate::auth::AuthorizationContext;
use crate::docs::Problem;
use crate::error::AppError;
use crate::http_range::file_data_response;
use crate::resources::media::deck_processor::{app_error_from_failure, detect_deck_source_kind};
use crate::resources::media::processing::UploadedSource;
use crate::temp_work_dir::TempWorkDir;

fn normalized_upload_content_type(
    kind: MediaAssetKind,
    content_type: Option<&str>,
) -> Result<String, AppError> {
    let value = content_type
        .unwrap_or("application/octet-stream")
        .split(';')
        .next()
        .unwrap_or_default()
        .trim()
        .to_ascii_lowercase();
    match kind {
        MediaAssetKind::Video if value.starts_with("video/") => Ok(value),
        MediaAssetKind::Audio if value.starts_with("audio/") => Ok(value),
        MediaAssetKind::Video | MediaAssetKind::Audio if value == "application/octet-stream" => {
            Ok(value)
        }
        MediaAssetKind::Video | MediaAssetKind::Audio => Err(AppError::invalid_request(
            "upload Content-Type does not match its declared kind",
        )),
        // Deck bytes are sniffed and their final type is assigned by the deck processor.
        MediaAssetKind::Image | MediaAssetKind::Pdf | MediaAssetKind::Svg => {
            Ok("application/octet-stream".into())
        }
    }
}
use crate::settings::MediaAssetUploadLimits;

use super::service::{MEDIA_UPLOAD_CHUNK_SIZE_BYTES, MediaAssetServiceHandle, UploadSessionState};

pub fn upload_scope(limits: MediaAssetUploadLimits) -> Scope {
    web::scope("")
        .app_data(web::PayloadConfig::new(MEDIA_UPLOAD_CHUNK_SIZE_BYTES))
        .app_data(Data::new(limits))
        .service(begin_upload_session)
        .service(upload_session_chunk)
        .service(complete_upload_session)
        .service(abort_upload_session)
}

struct UploadSessionCleanup {
    storage: Arc<super::storage::FsMediaAssetStorage>,
    session_id: String,
    source_count: usize,
}

impl UploadSessionCleanup {
    fn new(svc: &MediaAssetServiceHandle, state: &UploadSessionState) -> Self {
        Self {
            storage: svc.storage.clone(),
            session_id: state.id.clone(),
            source_count: state.sources.len(),
        }
    }
}

impl Drop for UploadSessionCleanup {
    fn drop(&mut self) {
        self.storage
            .delete_upload_session_sources(&self.session_id, self.source_count);
    }
}

#[utoipa::path(
    post,
    path = "/api/v1/media/upload-sessions",
    request_body = CreateUploadSession,
    responses(
        (status = 201, description = "Upload session created", body = UploadSession),
        (status = 400, description = "Invalid target or source list", body = Problem, content_type = "application/problem+json"),
        (status = 404, description = "Target not found or write access denied", body = Problem, content_type = "application/problem+json"),
        (status = 413, description = "A source exceeds its configured limit", body = Problem, content_type = "application/problem+json")
    ),
    tag = "Media",
    security(("SessionCookie" = []), ("SessionToken" = []))
)]
#[post("/upload-sessions")]
async fn begin_upload_session(
    svc: Data<MediaAssetServiceHandle>,
    ctx: ReqData<AuthorizationContext>,
    request: Json<CreateUploadSession>,
) -> Result<HttpResponse, AppError> {
    let session = svc.begin_upload_session(&ctx, request.into_inner()).await?;
    Ok(HttpResponse::Created().json(session))
}

#[utoipa::path(
    put,
    path = "/api/v1/media/upload-sessions/{id}/sources/{source_index}/chunks/{chunk_index}",
    params(
        ("id" = String, Path, description = "Upload session identifier"),
        ("source_index" = usize, Path, description = "Zero-based source index"),
        ("chunk_index" = usize, Path, description = "Zero-based chunk index for the source")
    ),
    request_body(content = Vec<u8>, content_type = "application/octet-stream", description = "One chunk, no larger than the session chunk size"),
    responses(
        (status = 204, description = "Chunk accepted"),
        (status = 400, description = "Chunk order or length is invalid", body = Problem, content_type = "application/problem+json"),
        (status = 404, description = "Session not found or write access denied", body = Problem, content_type = "application/problem+json"),
        (status = 413, description = "Chunk exceeds the maximum chunk size", body = Problem, content_type = "application/problem+json")
    ),
    tag = "Media",
    security(("SessionCookie" = []), ("SessionToken" = []))
)]
#[put("/upload-sessions/{id}/sources/{source_index}/chunks/{chunk_index}")]
async fn upload_session_chunk(
    svc: Data<MediaAssetServiceHandle>,
    ctx: ReqData<AuthorizationContext>,
    path: Path<(String, usize, usize)>,
    mut payload: web::Payload,
) -> Result<HttpResponse, AppError> {
    let (session_id, source_index, chunk_index) = path.into_inner();
    let mut bytes = Vec::with_capacity(MEDIA_UPLOAD_CHUNK_SIZE_BYTES);
    while let Some(chunk) = payload.next().await {
        let chunk = chunk.map_err(|e| AppError::invalid_request(format!("upload error: {e}")))?;
        if bytes.len() + chunk.len() > MEDIA_UPLOAD_CHUNK_SIZE_BYTES {
            return Err(AppError::payload_too_large());
        }
        bytes.extend_from_slice(&chunk);
    }
    svc.append_upload_session_chunk(&ctx, &session_id, source_index, chunk_index, &bytes)
        .await?;
    Ok(HttpResponse::NoContent().finish())
}

#[utoipa::path(
    post,
    path = "/api/v1/media/upload-sessions/{id}/complete",
    params(("id" = String, Path, description = "Upload session identifier")),
    responses(
        (status = 200, description = "Existing media asset upload finalized", body = Media),
        (status = 201, description = "New uploaded media created", body = Media),
        (status = 400, description = "Session is incomplete or source is invalid", body = Problem, content_type = "application/problem+json"),
        (status = 404, description = "Session not found or write access denied", body = Problem, content_type = "application/problem+json"),
        (status = 409, description = "Media changed concurrently", body = Problem, content_type = "application/problem+json")
    ),
    tag = "Media",
    security(("SessionCookie" = []), ("SessionToken" = []))
)]
#[post("/upload-sessions/{id}/complete")]
async fn complete_upload_session(
    svc: Data<MediaAssetServiceHandle>,
    processing: Data<Arc<crate::resources::media::processing::MediaProcessingHandle>>,
    limits: Data<MediaAssetUploadLimits>,
    ctx: ReqData<AuthorizationContext>,
    id: Path<String>,
) -> Result<HttpResponse, AppError> {
    let state = svc.take_upload_session(&ctx, &id).await?;
    let _cleanup = UploadSessionCleanup::new(&svc, &state);
    let work = TempWorkDir::new(std::env::temp_dir().join("worshipviewer_media_uploads"))
        .map_err(|e| AppError::internal_from_err("media.upload_session.temp", e))?;
    let mut source_paths = Vec::with_capacity(state.sources.len());
    for source_index in 0..state.sources.len() {
        let stored_path = svc
            .storage
            .upload_session_source_path(&state.id, source_index);
        let stored_length = tokio::fs::metadata(&stored_path)
            .await
            .map_err(|e| AppError::internal_from_err("media.upload_session.stat", e))?
            .len();
        if stored_length != state.sources[source_index].byte_length {
            return Err(AppError::invalid_request(
                "stored upload source length does not match its descriptor",
            ));
        }
        let work_path = work.path().join(format!("source-{source_index}"));
        tokio::fs::rename(&stored_path, &work_path)
            .await
            .map_err(|e| AppError::internal_from_err("media.upload_session.move", e))?;
        source_paths.push(work_path);
    }

    match state.target {
        UploadSessionTarget::Create { kind, metadata } => {
            let mut sources = Vec::with_capacity(source_paths.len());
            for (source_index, path) in source_paths.into_iter().enumerate() {
                let descriptor = &state.sources[source_index];
                let asset_kind = match kind {
                    UploadedMediaKind::Video => MediaAssetKind::Video,
                    UploadedMediaKind::Audio => MediaAssetKind::Audio,
                    UploadedMediaKind::Image | UploadedMediaKind::SlideDeck => {
                        detect_deck_source_kind(&path).map_err(app_error_from_failure)?
                    }
                };
                let content_type =
                    normalized_upload_content_type(asset_kind, descriptor.content_type.as_deref())?;
                let exact_limit = match asset_kind {
                    MediaAssetKind::Video => limits.video_max_bytes,
                    MediaAssetKind::Audio => limits.audio_max_bytes,
                    MediaAssetKind::Pdf => limits.pdf_max_bytes,
                    MediaAssetKind::Image => limits.image_max_bytes,
                    MediaAssetKind::Svg => limits.svg_max_bytes,
                };
                if descriptor.byte_length > exact_limit as u64 {
                    return Err(AppError::payload_too_large());
                }
                sources.push(UploadedSource {
                    path,
                    kind: asset_kind,
                    content_type,
                });
            }
            let media = processing
                .create_uploaded_for_user(&ctx, metadata, kind, sources)
                .await?;
            Ok(HttpResponse::Created().json(media))
        }
        UploadSessionTarget::Asset {
            media_id,
            kind,
            replace_page,
            role,
        } => {
            let content_type =
                normalized_upload_content_type(kind, state.sources[0].content_type.as_deref())?;
            let operation_id = svc
                .upload_staging_from_path_for_user(
                    &ctx,
                    &media_id,
                    kind,
                    content_type,
                    &source_paths[0],
                )
                .await?;
            let media = processing
                .replace_after_upload_for_user(
                    &ctx,
                    &media_id,
                    &operation_id,
                    kind,
                    replace_page.as_deref(),
                    role.as_deref() == Some("thumbnail"),
                )
                .await?;
            Ok(HttpResponse::Ok().json(media))
        }
    }
}

#[utoipa::path(
    delete,
    path = "/api/v1/media/upload-sessions/{id}",
    params(("id" = String, Path, description = "Upload session identifier")),
    responses(
        (status = 204, description = "Upload session aborted"),
        (status = 404, description = "Session not found or write access denied", body = Problem, content_type = "application/problem+json")
    ),
    tag = "Media",
    security(("SessionCookie" = []), ("SessionToken" = []))
)]
#[delete("/upload-sessions/{id}")]
async fn abort_upload_session(
    svc: Data<MediaAssetServiceHandle>,
    ctx: ReqData<AuthorizationContext>,
    id: Path<String>,
) -> Result<HttpResponse, AppError> {
    svc.abort_upload_session(&ctx, &id).await?;
    Ok(HttpResponse::NoContent().finish())
}

#[utoipa::path(
    get,
    path = "/api/v1/media/{media_id}/assets/{asset_id}/data",
    params(
        ("media_id" = String, Path),
        ("asset_id" = String, Path)
    ),
    responses(
        (status = 200, description = "Final asset bytes"),
        (status = 206, description = "Partial content"),
        (status = 304, description = "Not modified"),
        (status = 404, description = "Not found or concealed", body = Problem, content_type = "application/problem+json"),
        (status = 416, description = "Range not satisfiable", body = Problem, content_type = "application/problem+json")
    ),
    tag = "Media",
    security(("SessionCookie" = []), ("SessionToken" = []))
)]
#[get("/{media_id}/assets/{asset_id}/data")]
pub async fn get_media_asset_data(
    req: HttpRequest,
    svc: Data<MediaAssetServiceHandle>,
    ctx: ReqData<AuthorizationContext>,
    path: Path<(String, String)>,
) -> Result<HttpResponse, AppError> {
    let (media_id, asset_id) = path.into_inner();
    let asset = svc
        .get_final_asset_for_user(&ctx, &media_id, &asset_id)
        .await?;
    let etag = asset
        .etag
        .as_deref()
        .ok_or_else(|| AppError::Internal("asset missing etag".into()))?;
    let file_path = svc.final_file_path(&asset_id);
    file_data_response(&req, &file_path, &asset.content_type, etag, false).await
}

#[utoipa::path(
    head,
    path = "/api/v1/media/{media_id}/assets/{asset_id}/data",
    params(
        ("media_id" = String, Path),
        ("asset_id" = String, Path)
    ),
    responses(
        (status = 200, description = "Final asset metadata"),
        (status = 206, description = "Partial content metadata"),
        (status = 304, description = "Not modified"),
        (status = 404, description = "Not found or concealed", body = Problem, content_type = "application/problem+json"),
        (status = 416, description = "Range not satisfiable", body = Problem, content_type = "application/problem+json")
    ),
    tag = "Media",
    security(("SessionCookie" = []), ("SessionToken" = []))
)]
#[head("/{media_id}/assets/{asset_id}/data")]
pub async fn head_media_asset_data(
    req: HttpRequest,
    svc: Data<MediaAssetServiceHandle>,
    ctx: ReqData<AuthorizationContext>,
    path: Path<(String, String)>,
) -> Result<HttpResponse, AppError> {
    let (media_id, asset_id) = path.into_inner();
    let asset = svc
        .get_final_asset_for_user(&ctx, &media_id, &asset_id)
        .await?;
    let etag = asset
        .etag
        .as_deref()
        .ok_or_else(|| AppError::Internal("asset missing etag".into()))?;
    let file_path = svc.final_file_path(&asset_id);
    file_data_response(&req, &file_path, &asset.content_type, etag, true).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn upload_content_type_must_match_declared_kind() {
        assert_eq!(
            normalized_upload_content_type(MediaAssetKind::Video, Some("video/webm; codecs=vp9"))
                .unwrap(),
            "video/webm"
        );
        assert!(normalized_upload_content_type(MediaAssetKind::Video, Some("text/html")).is_err());
        assert!(
            normalized_upload_content_type(MediaAssetKind::Audio, Some("image/svg+xml")).is_err()
        );
    }
}
