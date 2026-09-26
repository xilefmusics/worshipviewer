use actix_multipart::Multipart;
use actix_web::http::header;
use actix_web::{
    HttpRequest, HttpResponse, Scope, get, head, post, put,
    web::{self, Data, Path, Query, ReqData},
};

use std::sync::Arc;

use futures_util::StreamExt;
use shared::MediaAssetKind;
use shared::media::{CreateUploadedMedia, Media, UploadedMediaKind};
use tokio::io::AsyncWriteExt;

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

use super::service::MediaAssetServiceHandle;

#[derive(serde::Deserialize)]
struct UploadQuery {
    kind: String,
    #[serde(default)]
    replace_page: Option<String>,
}

pub fn upload_scope(limits: MediaAssetUploadLimits) -> Scope {
    web::scope("")
        .app_data(web::PayloadConfig::new(limits.payload_ceiling_bytes))
        .app_data(Data::new(limits))
        .service(create_uploaded_media)
        .service(upload_media_asset)
}

#[derive(serde::Deserialize)]
struct CreateUploadQuery {
    kind: String,
}

#[utoipa::path(
    post,
    path = "/api/v1/media/uploads",
    params(("kind" = String, Query, description = "Uploaded media kind: image, video, audio, or slide_deck")),
    request_body(content = String, content_type = "multipart/form-data", description = "One JSON metadata part and one or more file parts"),
    responses(
        (status = 201, description = "Uploaded media processed and created", body = Media),
        (status = 400, description = "Invalid metadata, source, or file count", body = Problem, content_type = "application/problem+json"),
        (status = 413, description = "A source exceeds its configured limit", body = Problem, content_type = "application/problem+json")
    ),
    tag = "Media",
    security(("SessionCookie" = []), ("SessionToken" = []))
)]
#[post("/uploads")]
pub async fn create_uploaded_media(
    processing: Data<Arc<crate::resources::media::processing::MediaProcessingHandle>>,
    limits: Data<MediaAssetUploadLimits>,
    ctx: ReqData<AuthorizationContext>,
    query: Query<CreateUploadQuery>,
    mut multipart: Multipart,
) -> Result<HttpResponse, AppError> {
    let kind = UploadedMediaKind::parse(&query.kind)
        .ok_or_else(|| AppError::invalid_request("invalid uploaded media kind"))?;
    let work = TempWorkDir::new(std::env::temp_dir().join("worshipviewer_media_uploads"))
        .map_err(|e| AppError::internal_from_err("media.multipart.temp", e))?;
    let mut metadata = None;
    let mut sources = Vec::new();
    while let Some(field) = multipart.next().await {
        let mut field =
            field.map_err(|e| AppError::invalid_request(format!("multipart upload error: {e}")))?;
        let name = field.name().unwrap_or_default().to_owned();
        if name == "metadata" {
            if metadata.is_some() {
                return Err(AppError::invalid_request(
                    "metadata part must appear exactly once",
                ));
            }
            let mut bytes = Vec::new();
            while let Some(chunk) = field.next().await {
                let chunk = chunk.map_err(|e| {
                    AppError::invalid_request(format!("multipart upload error: {e}"))
                })?;
                if bytes.len() + chunk.len() > 64 * 1024 {
                    return Err(AppError::payload_too_large());
                }
                bytes.extend_from_slice(&chunk);
            }
            metadata = Some(
                serde_json::from_slice::<CreateUploadedMedia>(&bytes).map_err(|e| {
                    AppError::invalid_request(format!("invalid metadata part: {e}"))
                })?,
            );
        } else if name == "file" {
            let submitted_content_type = field.content_type().map(ToString::to_string);
            let index = sources.len();
            let path = work.path().join(format!("source-{index}"));
            let mut output = tokio::fs::File::create(&path)
                .await
                .map_err(|e| AppError::internal_from_err("media.multipart.create", e))?;
            let provisional_limit = match kind {
                UploadedMediaKind::Video => limits.video_max_bytes,
                UploadedMediaKind::Audio => limits.audio_max_bytes,
                UploadedMediaKind::Image => limits.image_max_bytes.max(limits.svg_max_bytes),
                UploadedMediaKind::SlideDeck => limits
                    .pdf_max_bytes
                    .max(limits.image_max_bytes)
                    .max(limits.svg_max_bytes),
            };
            let mut written = 0usize;
            while let Some(chunk) = field.next().await {
                let chunk = chunk.map_err(|e| {
                    AppError::invalid_request(format!("multipart upload error: {e}"))
                })?;
                if written + chunk.len() > provisional_limit {
                    return Err(AppError::payload_too_large());
                }
                output
                    .write_all(&chunk)
                    .await
                    .map_err(|e| AppError::internal_from_err("media.multipart.write", e))?;
                written += chunk.len();
            }
            output
                .flush()
                .await
                .map_err(|e| AppError::internal_from_err("media.multipart.flush", e))?;
            let asset_kind = match kind {
                UploadedMediaKind::Video => MediaAssetKind::Video,
                UploadedMediaKind::Audio => MediaAssetKind::Audio,
                UploadedMediaKind::Image => {
                    detect_deck_source_kind(&path).map_err(app_error_from_failure)?
                }
                UploadedMediaKind::SlideDeck => {
                    detect_deck_source_kind(&path).map_err(app_error_from_failure)?
                }
            };
            let content_type =
                normalized_upload_content_type(asset_kind, submitted_content_type.as_deref())?;
            let exact_limit = match asset_kind {
                MediaAssetKind::Video => limits.video_max_bytes,
                MediaAssetKind::Audio => limits.audio_max_bytes,
                MediaAssetKind::Pdf => limits.pdf_max_bytes,
                MediaAssetKind::Image => limits.image_max_bytes,
                MediaAssetKind::Svg => limits.svg_max_bytes,
            };
            if written > exact_limit {
                return Err(AppError::payload_too_large());
            }
            sources.push(UploadedSource {
                path,
                kind: asset_kind,
                content_type,
            });
        } else {
            return Err(AppError::invalid_request(
                "multipart fields must be named metadata or file",
            ));
        }
    }
    let metadata =
        metadata.ok_or_else(|| AppError::invalid_request("metadata part is required"))?;
    let media = processing
        .create_uploaded_for_user(&ctx, metadata, kind, sources)
        .await?;
    Ok(HttpResponse::Created().json(media))
}

#[utoipa::path(
    put,
    path = "/api/v1/media/{media_id}/uploads",
    params(
        ("media_id" = String, Path, description = "Media identifier"),
        ("kind" = String, Query, description = "Source kind: video, audio, image, pdf, or svg"),
        ("replace_page" = Option<String>, Query, description = "Existing staged/ready deck page id to replace")
    ),
    request_body(
        content = Vec<u8>,
        content_type = "application/octet-stream",
        description = "Streaming upload body"
    ),
    responses(
        (status = 200, description = "Upload processed and media updated", body = Media),
        (status = 400, description = "Invalid kind or request", body = Problem, content_type = "application/problem+json"),
        (status = 409, description = "Media changed concurrently", body = Problem, content_type = "application/problem+json"),
        (status = 401, description = "Authentication required", body = Problem, content_type = "application/problem+json"),
        (status = 404, description = "Media not found or write access denied", body = Problem, content_type = "application/problem+json"),
        (status = 413, description = "Payload too large", body = Problem, content_type = "application/problem+json"),
        (status = 500, description = "Upload failed", body = Problem, content_type = "application/problem+json")
    ),
    tag = "Media",
    security(("SessionCookie" = []), ("SessionToken" = []))
)]
#[put("/{media_id}/uploads")]
async fn upload_media_asset(
    svc: Data<MediaAssetServiceHandle>,
    processing: Data<Arc<crate::resources::media::processing::MediaProcessingHandle>>,
    ctx: ReqData<AuthorizationContext>,
    media_id: Path<String>,
    query: Query<UploadQuery>,
    req: HttpRequest,
    payload: web::Payload,
) -> Result<HttpResponse, AppError> {
    let kind = MediaAssetKind::parse(&query.kind)
        .ok_or_else(|| AppError::invalid_request("invalid media asset kind"))?;
    let replace_page = query.replace_page.clone();
    let submitted_content_type = req
        .headers()
        .get(header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .map(str::to_owned);
    let content_type = normalized_upload_content_type(kind, submitted_content_type.as_deref())?;
    let content_length = req
        .headers()
        .get(header::CONTENT_LENGTH)
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.parse().ok());
    let operation_id = svc
        .upload_staging_for_user(&ctx, &media_id, kind, content_type, content_length, payload)
        .await?;
    if matches!(
        kind,
        MediaAssetKind::Video
            | MediaAssetKind::Audio
            | MediaAssetKind::Image
            | MediaAssetKind::Pdf
            | MediaAssetKind::Svg
    ) {
        let media = processing
            .replace_after_upload_for_user(
                &ctx,
                &media_id,
                &operation_id,
                kind,
                replace_page.as_deref(),
            )
            .await?;
        return Ok(HttpResponse::Ok().json(media));
    }
    Err(AppError::invalid_request("unsupported media upload kind"))
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
