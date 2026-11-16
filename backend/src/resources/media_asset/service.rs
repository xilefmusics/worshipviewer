use std::collections::{HashMap, HashSet};
use std::sync::Arc;

use actix_web::web::Payload;
use shared::media::{
    CreateUploadSession, UploadSession, UploadSessionTarget, UploadSourceDescriptor,
    UploadedMediaKind,
};
use shared::{MediaAsset, MediaAssetKind, MediaAssetStatus};
use surrealdb::types::RecordId;
use tokio::sync::{Mutex, RwLock};
use tracing::instrument;

use crate::auth::AuthorizationContext;
use crate::database::Database;
use crate::error::AppError;
use crate::resources::media::{MediaRepository, SurrealMediaRepo};
use crate::resources::team::parse_owner_record_id;
use crate::settings::Settings;

use super::model::{CreateFinalAsset, CreateStagingAsset};
use super::storage::{
    FsMediaAssetStorage, MediaAssetStorage, StagingCleanupGuard, StagingUploadResult,
};
use super::surreal_repo::SurrealMediaAssetRepo;
use crate::resources::media_asset::repository::MediaAssetRepository;

#[derive(Clone)]
pub struct MediaAssetService<R, M> {
    pub repo: R,
    pub media_repo: M,
    pub storage: Arc<FsMediaAssetStorage>,
    pub settings: MediaAssetSettings,
    active_uploads: Arc<RwLock<HashSet<String>>>,
    upload_sessions: Arc<RwLock<HashMap<String, Arc<Mutex<UploadSessionState>>>>>,
}

#[derive(Clone)]
pub struct UploadSessionState {
    pub id: String,
    pub creator_user_id: String,
    pub target: UploadSessionTarget,
    pub sources: Vec<UploadSourceDescriptor>,
    pub next_source: usize,
    pub next_chunk: usize,
    pub received_bytes_in_source: u64,
    pub last_activity: tokio::time::Instant,
    pub finalizing: bool,
}

pub const MEDIA_UPLOAD_CHUNK_SIZE_BYTES: usize = 8 * 1024 * 1024;

#[derive(Clone, Debug)]
pub struct MediaAssetSettings {
    pub video_max_bytes: usize,
    pub audio_max_bytes: usize,
    pub pdf_max_bytes: usize,
    pub image_max_bytes: usize,
    pub svg_max_bytes: usize,
    pub staging_max_age_seconds: u64,
}

struct FinalFileCleanup {
    storage: Arc<FsMediaAssetStorage>,
    asset_id: Option<String>,
}

impl FinalFileCleanup {
    fn new(storage: Arc<FsMediaAssetStorage>, asset_id: &str) -> Self {
        Self {
            storage,
            asset_id: Some(asset_id.to_owned()),
        }
    }

    fn disarm(&mut self) {
        self.asset_id = None;
    }
}

impl Drop for FinalFileCleanup {
    fn drop(&mut self) {
        if let Some(asset_id) = self.asset_id.take() {
            self.storage.delete_final_file(&asset_id);
        }
    }
}

impl MediaAssetSettings {
    pub fn from_settings(settings: &Settings) -> Self {
        let limits = settings.media_asset_upload_limits();
        Self {
            video_max_bytes: limits.video_max_bytes,
            audio_max_bytes: limits.audio_max_bytes,
            pdf_max_bytes: limits.pdf_max_bytes,
            image_max_bytes: limits.image_max_bytes,
            svg_max_bytes: limits.svg_max_bytes,
            staging_max_age_seconds: settings.media_staging_max_age_seconds,
        }
    }

    pub fn max_bytes_for_kind(&self, kind: MediaAssetKind) -> usize {
        match kind {
            MediaAssetKind::Video => self.video_max_bytes,
            MediaAssetKind::Audio => self.audio_max_bytes,
            MediaAssetKind::Pdf => self.pdf_max_bytes,
            MediaAssetKind::Image => self.image_max_bytes,
            MediaAssetKind::Svg => self.svg_max_bytes,
        }
    }
}

impl<R: MediaAssetRepository, M: MediaRepository> MediaAssetService<R, M> {
    pub fn new(
        repo: R,
        media_repo: M,
        storage: Arc<FsMediaAssetStorage>,
        settings: MediaAssetSettings,
    ) -> Self {
        Self {
            repo,
            media_repo,
            storage,
            settings,
            active_uploads: Arc::new(RwLock::new(HashSet::new())),
            upload_sessions: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    pub async fn ensure_directories(&self) -> Result<(), AppError> {
        self.storage.ensure_directories().await
    }

    async fn register_active_upload(&self, operation_id: &str) {
        self.active_uploads
            .write()
            .await
            .insert(operation_id.to_owned());
    }

    async fn unregister_active_upload(&self, operation_id: &str) {
        self.active_uploads.write().await.remove(operation_id);
    }

    async fn active_upload_ids(&self) -> HashSet<String> {
        let mut active = self.active_uploads.read().await.clone();
        let sessions = self.upload_sessions.read().await.clone();
        for (session_id, session) in sessions {
            let session = session.lock().await;
            for source_index in 0..session.sources.len() {
                active.insert(format!("upload-session-{session_id}-{source_index}"));
            }
        }
        active
    }

    async fn authorize_upload_target(
        &self,
        ctx: &AuthorizationContext,
        target: &UploadSessionTarget,
    ) -> Result<(), AppError> {
        let media_id = match target {
            UploadSessionTarget::Create { metadata, .. } => {
                let owner = match metadata.owner.as_deref() {
                    Some(owner) => parse_owner_record_id(owner)?,
                    None => ctx.personal_team()?,
                };
                ctx.require_write_access_to_owner(&owner)?;
                return Ok(());
            }
            UploadSessionTarget::Asset { media_id, .. } => media_id,
        };
        let media = self.media_repo.get(&ctx.read_teams(), media_id).await?;
        let owner = parse_owner_record_id(&media.owner)?;
        ctx.require_write_access_to_owner(&owner)
    }

    fn upload_session_max_bytes(&self, target: &UploadSessionTarget) -> usize {
        match target {
            UploadSessionTarget::Asset { kind, .. } => self.settings.max_bytes_for_kind(*kind),
            UploadSessionTarget::Create { kind, .. } => match kind {
                UploadedMediaKind::Video => self.settings.video_max_bytes,
                UploadedMediaKind::Audio => self.settings.audio_max_bytes,
                UploadedMediaKind::Image => self
                    .settings
                    .image_max_bytes
                    .max(self.settings.svg_max_bytes),
                UploadedMediaKind::SlideDeck => self
                    .settings
                    .pdf_max_bytes
                    .max(self.settings.image_max_bytes)
                    .max(self.settings.svg_max_bytes),
            },
        }
    }

    #[instrument(level = "debug", err, skip(self, ctx, request))]
    pub async fn begin_upload_session(
        &self,
        ctx: &AuthorizationContext,
        request: CreateUploadSession,
    ) -> Result<UploadSession, AppError> {
        if request.sources.is_empty() || request.sources.len() > 500 {
            return Err(AppError::invalid_request(
                "upload session must contain between 1 and 500 sources",
            ));
        }
        match &request.target {
            UploadSessionTarget::Create { kind, .. } => {
                if !matches!(kind, UploadedMediaKind::SlideDeck) && request.sources.len() != 1 {
                    return Err(AppError::invalid_request(
                        "image, video, and audio uploads accept exactly one source",
                    ));
                }
            }
            UploadSessionTarget::Asset { role, kind, .. } => {
                if request.sources.len() != 1 {
                    return Err(AppError::invalid_request(
                        "media asset uploads accept exactly one source",
                    ));
                }
                if role.as_deref().is_some_and(|value| value != "thumbnail") {
                    return Err(AppError::invalid_request("unsupported upload role"));
                }
                if role.as_deref() == Some("thumbnail")
                    && !matches!(kind, MediaAssetKind::Image | MediaAssetKind::Svg)
                {
                    return Err(AppError::invalid_request(
                        "thumbnail uploads must use image or svg kind",
                    ));
                }
            }
        }
        let max_bytes = self.upload_session_max_bytes(&request.target) as u64;
        if request
            .sources
            .iter()
            .any(|source| source.byte_length == 0 || source.byte_length > max_bytes)
        {
            return Err(AppError::payload_too_large());
        }
        self.authorize_upload_target(ctx, &request.target).await?;

        let id = uuid::Uuid::new_v4().to_string();
        for source_index in 0..request.sources.len() {
            if let Err(error) = self
                .storage
                .create_upload_session_source(&id, source_index)
                .await
            {
                self.storage
                    .delete_upload_session_sources(&id, request.sources.len());
                return Err(error);
            }
        }
        let state = UploadSessionState {
            id: id.clone(),
            creator_user_id: ctx.user.id.clone(),
            target: request.target,
            sources: request.sources,
            next_source: 0,
            next_chunk: 0,
            received_bytes_in_source: 0,
            last_activity: tokio::time::Instant::now(),
            finalizing: false,
        };
        self.upload_sessions
            .write()
            .await
            .insert(id.clone(), Arc::new(Mutex::new(state)));
        Ok(UploadSession {
            id,
            chunk_size_bytes: MEDIA_UPLOAD_CHUNK_SIZE_BYTES as u64,
        })
    }

    #[instrument(level = "debug", err, skip(self, ctx, bytes))]
    pub async fn append_upload_session_chunk(
        &self,
        ctx: &AuthorizationContext,
        session_id: &str,
        source_index: usize,
        chunk_index: usize,
        bytes: &[u8],
    ) -> Result<(), AppError> {
        let session = self
            .upload_sessions
            .read()
            .await
            .get(session_id)
            .cloned()
            .ok_or_else(|| AppError::NotFound("upload session not found".into()))?;
        let mut state = session.lock().await;
        if state.creator_user_id != ctx.user.id || state.finalizing {
            return Err(AppError::NotFound("upload session not found".into()));
        }
        if state.last_activity.elapsed()
            > std::time::Duration::from_secs(self.settings.staging_max_age_seconds)
        {
            state.finalizing = true;
            drop(state);
            self.remove_upload_session(session_id).await;
            return Err(AppError::NotFound("upload session expired".into()));
        }
        self.authorize_upload_target(ctx, &state.target).await?;
        if source_index != state.next_source || chunk_index != state.next_chunk {
            return Err(AppError::invalid_request(
                "upload chunks must be sent in source and chunk order",
            ));
        }
        let source_length = state
            .sources
            .get(source_index)
            .ok_or_else(|| AppError::invalid_request("invalid upload source index"))?
            .byte_length;
        let remaining = source_length - state.received_bytes_in_source;
        let expected_len = remaining.min(MEDIA_UPLOAD_CHUNK_SIZE_BYTES as u64) as usize;
        if bytes.len() != expected_len {
            return Err(AppError::invalid_request(
                "chunk size does not match the expected source length",
            ));
        }
        if let Err(error) = self
            .storage
            .append_upload_session_chunk(session_id, source_index, bytes)
            .await
        {
            state.finalizing = true;
            drop(state);
            self.remove_upload_session(session_id).await;
            return Err(error);
        }
        state.received_bytes_in_source += bytes.len() as u64;
        state.last_activity = tokio::time::Instant::now();
        if state.received_bytes_in_source == source_length {
            state.next_source += 1;
            state.next_chunk = 0;
            state.received_bytes_in_source = 0;
        } else {
            state.next_chunk += 1;
        }
        Ok(())
    }

    #[instrument(level = "debug", err, skip(self, ctx))]
    pub async fn take_upload_session(
        &self,
        ctx: &AuthorizationContext,
        session_id: &str,
    ) -> Result<UploadSessionState, AppError> {
        let session = self
            .upload_sessions
            .read()
            .await
            .get(session_id)
            .cloned()
            .ok_or_else(|| AppError::NotFound("upload session not found".into()))?;
        let mut state = session.lock().await;
        if state.creator_user_id != ctx.user.id || state.finalizing {
            return Err(AppError::NotFound("upload session not found".into()));
        }
        if state.last_activity.elapsed()
            > std::time::Duration::from_secs(self.settings.staging_max_age_seconds)
        {
            state.finalizing = true;
            drop(state);
            self.remove_upload_session(session_id).await;
            return Err(AppError::NotFound("upload session expired".into()));
        }
        if state.next_source != state.sources.len() {
            return Err(AppError::invalid_request(
                "upload session is missing one or more chunks",
            ));
        }
        self.authorize_upload_target(ctx, &state.target).await?;
        state.finalizing = true;
        let output = state.clone();
        drop(state);
        let mut sessions = self.upload_sessions.write().await;
        if sessions
            .get(session_id)
            .is_some_and(|current| Arc::ptr_eq(current, &session))
        {
            sessions.remove(session_id);
            Ok(output)
        } else {
            Err(AppError::NotFound("upload session not found".into()))
        }
    }

    #[instrument(level = "debug", err, skip(self, ctx))]
    pub async fn abort_upload_session(
        &self,
        ctx: &AuthorizationContext,
        session_id: &str,
    ) -> Result<(), AppError> {
        let session = self
            .upload_sessions
            .read()
            .await
            .get(session_id)
            .cloned()
            .ok_or_else(|| AppError::NotFound("upload session not found".into()))?;
        let mut state = session.lock().await;
        if state.creator_user_id != ctx.user.id || state.finalizing {
            return Err(AppError::NotFound("upload session not found".into()));
        }
        self.authorize_upload_target(ctx, &state.target).await?;
        let count = state.sources.len();
        state.finalizing = true;
        drop(state);
        let mut sessions = self.upload_sessions.write().await;
        if !sessions
            .get(session_id)
            .is_some_and(|current| Arc::ptr_eq(current, &session))
        {
            return Err(AppError::NotFound("upload session not found".into()));
        }
        sessions.remove(session_id);
        drop(sessions);
        self.storage
            .delete_upload_session_sources(session_id, count);
        Ok(())
    }

    async fn remove_upload_session(&self, session_id: &str) {
        let session = self.upload_sessions.write().await.remove(session_id);
        if let Some(session) = session {
            let count = session.lock().await.sources.len();
            self.storage
                .delete_upload_session_sources(session_id, count);
        }
    }

    async fn expire_upload_sessions(&self) {
        let snapshot = self.upload_sessions.read().await.clone();
        let ttl = std::time::Duration::from_secs(self.settings.staging_max_age_seconds);
        let mut expired = Vec::new();
        for (id, session) in snapshot {
            let mut state = session.lock().await;
            if !state.finalizing && state.last_activity.elapsed() > ttl {
                state.finalizing = true;
                expired.push((id, session.clone(), state.sources.len()));
            }
        }
        if expired.is_empty() {
            return;
        }
        let mut map = self.upload_sessions.write().await;
        for (id, session, count) in expired {
            if map
                .get(&id)
                .is_some_and(|current| Arc::ptr_eq(current, &session))
            {
                map.remove(&id);
                self.storage.delete_upload_session_sources(&id, count);
            }
        }
    }

    #[instrument(level = "debug", err, skip(self, ctx, payload))]
    pub async fn upload_staging_for_user(
        &self,
        ctx: &AuthorizationContext,
        media_id: &str,
        kind: MediaAssetKind,
        content_type: String,
        content_length: Option<usize>,
        payload: Payload,
    ) -> Result<String, AppError> {
        let media = self.media_repo.get(&ctx.read_teams(), media_id).await?;
        let owner = parse_owner_record_id(&media.owner)?;
        ctx.require_write_access_to_owner(&owner)?;

        let max_bytes = self.settings.max_bytes_for_kind(kind);
        if let Some(len) = content_length
            && len > max_bytes
        {
            return Err(AppError::payload_too_large());
        }

        let operation_id = uuid::Uuid::new_v4().to_string();
        self.register_active_upload(&operation_id).await;
        let mut guard = StagingCleanupGuard::new(self.storage.clone(), operation_id.clone());

        let StagingUploadResult { byte_length, etag } = match self
            .storage
            .stream_upload_to_staging(&operation_id, payload, max_bytes)
            .await
        {
            Ok(result) => result,
            Err(e) => {
                self.unregister_active_upload(&operation_id).await;
                return Err(e);
            }
        };

        let media_rid = RecordId::new("media", media_id.to_owned());
        let asset = match self
            .repo
            .create_staging(CreateStagingAsset {
                owner,
                media_id: media_rid,
                kind,
                content_type,
                byte_length,
                operation_id: operation_id.clone(),
                etag,
            })
            .await
        {
            Ok(asset) => asset,
            Err(e) => {
                self.unregister_active_upload(&operation_id).await;
                return Err(e);
            }
        };

        guard.disarm();
        self.unregister_active_upload(&operation_id).await;
        let _ = asset;
        Ok(operation_id)
    }

    #[instrument(level = "debug", err, skip(self, ctx, source_path))]
    pub async fn upload_staging_from_path_for_user(
        &self,
        ctx: &AuthorizationContext,
        media_id: &str,
        kind: MediaAssetKind,
        content_type: String,
        source_path: &std::path::Path,
    ) -> Result<String, AppError> {
        let media = self.media_repo.get(&ctx.read_teams(), media_id).await?;
        let owner = parse_owner_record_id(&media.owner)?;
        ctx.require_write_access_to_owner(&owner)?;

        let operation_id = uuid::Uuid::new_v4().to_string();
        self.register_active_upload(&operation_id).await;
        let mut guard = StagingCleanupGuard::new(self.storage.clone(), operation_id.clone());
        let result = self
            .storage
            .copy_file_to_staging(
                source_path,
                &operation_id,
                self.settings.max_bytes_for_kind(kind),
            )
            .await;
        let StagingUploadResult { byte_length, etag } = match result {
            Ok(result) => result,
            Err(error) => {
                self.unregister_active_upload(&operation_id).await;
                return Err(error);
            }
        };

        if let Err(error) = self
            .repo
            .create_staging(CreateStagingAsset {
                owner,
                media_id: RecordId::new("media", media_id.to_owned()),
                kind,
                content_type,
                byte_length,
                operation_id: operation_id.clone(),
                etag,
            })
            .await
        {
            self.unregister_active_upload(&operation_id).await;
            return Err(error);
        }
        guard.disarm();
        self.unregister_active_upload(&operation_id).await;
        Ok(operation_id)
    }

    #[instrument(level = "debug", err, skip(self, ctx))]
    pub async fn get_final_asset_for_user(
        &self,
        ctx: &AuthorizationContext,
        media_id: &str,
        asset_id: &str,
    ) -> Result<MediaAsset, AppError> {
        let asset = self.repo.get_asset(&ctx.read_teams(), asset_id).await?;
        if asset.media_id != media_id {
            return Err(AppError::NotFound("media asset not found".into()));
        }
        if asset.status != MediaAssetStatus::Final {
            return Err(AppError::NotFound("media asset not found".into()));
        }
        Ok(asset)
    }

    pub fn final_file_path(&self, asset_id: &str) -> std::path::PathBuf {
        self.storage.final_path(asset_id)
    }

    #[instrument(level = "debug", err, skip(self))]
    pub async fn promote_staging(&self, operation_id: &str) -> Result<MediaAsset, AppError> {
        let staging = self.repo.get_staging_by_operation(operation_id).await?;
        let asset_id = staging.id.clone();
        let etag = staging
            .etag
            .clone()
            .ok_or_else(|| AppError::Internal("staging asset missing etag".into()))?;

        if let Err(e) = self.storage.promote_file(operation_id, &asset_id) {
            self.storage.delete_final_file(&asset_id);
            return Err(e);
        }

        match self
            .repo
            .promote_staging(&asset_id, operation_id, etag)
            .await
        {
            Ok(asset) => Ok(asset),
            Err(e) => {
                self.storage.delete_final_file(&asset_id);
                Err(e)
            }
        }
    }

    #[instrument(level = "debug", err, skip(self))]
    pub async fn delete_assets_for_media(&self, media_id: &str) -> Result<(), AppError> {
        let assets = self.repo.delete_assets_for_media(media_id).await?;
        for asset in assets {
            if asset.status == MediaAssetStatus::Final {
                self.storage.delete_final_file(&asset.id);
            } else if let Some(op) = asset.operation_id {
                self.storage.delete_staging_file(&op);
            }
        }
        Ok(())
    }

    pub async fn get_staging_by_operation(
        &self,
        operation_id: &str,
    ) -> Result<MediaAsset, AppError> {
        self.repo.get_staging_by_operation(operation_id).await
    }

    pub fn staging_path(&self, operation_id: &str) -> std::path::PathBuf {
        self.storage.staging_path(operation_id)
    }

    pub fn delete_staging_file(&self, operation_id: &str) {
        self.storage.delete_staging_file(operation_id);
    }

    pub fn delete_final_file(&self, asset_id: &str) {
        self.storage.delete_final_file(asset_id);
    }

    pub async fn delete_asset_record(&self, asset_id: &str) -> Result<(), AppError> {
        self.repo.delete_asset(asset_id).await
    }

    pub async fn ingest_final_file(
        &self,
        owner: RecordId,
        media_id: RecordId,
        kind: MediaAssetKind,
        content_type: String,
        source_path: &std::path::Path,
    ) -> Result<MediaAsset, AppError> {
        let asset_id = uuid::Uuid::new_v4().to_string();
        let (byte_length, etag) = self
            .storage
            .ingest_final_from_path(source_path, &asset_id)
            .map_err(|e| AppError::Internal(e.to_string()))?;
        let mut cleanup = FinalFileCleanup::new(self.storage.clone(), &asset_id);
        let asset = self
            .repo
            .create_final(
                &asset_id,
                CreateFinalAsset {
                    owner,
                    media_id,
                    kind,
                    content_type,
                    byte_length,
                    etag,
                },
            )
            .await?;
        cleanup.disarm();
        Ok(asset)
    }

    pub async fn duplicate_uploaded_content(
        &self,
        source_media_id: &str,
        dest_media_id: &str,
        content: &shared::media::MediaContent,
        owner: RecordId,
    ) -> Result<shared::media::MediaContent, AppError> {
        use shared::media::MediaContent;
        match content {
            MediaContent::Image { blob_id } => {
                let (kind, content_type) = self
                    .repo
                    .list_assets_for_media(source_media_id)
                    .await?
                    .into_iter()
                    .find(|asset| asset.id == *blob_id)
                    .map(|asset| (asset.kind, asset.content_type))
                    .unwrap_or((MediaAssetKind::Image, "application/octet-stream".into()));
                let new_id = uuid::Uuid::new_v4().to_string();
                let (byte_length, etag) = self
                    .storage
                    .copy_final_file(blob_id, &new_id)
                    .map_err(|e| AppError::Internal(e.to_string()))?;
                let mut cleanup = FinalFileCleanup::new(self.storage.clone(), &new_id);
                self.repo
                    .create_final(
                        &new_id,
                        CreateFinalAsset {
                            owner,
                            media_id: RecordId::new("media", dest_media_id.to_owned()),
                            kind,
                            content_type,
                            byte_length,
                            etag,
                        },
                    )
                    .await?;
                cleanup.disarm();
                Ok(MediaContent::Image { blob_id: new_id })
            }
            MediaContent::Video {
                blob_id,
                duration_ms,
                width,
                height,
                thumbnail_blob_id,
            } => {
                let source_assets = self.repo.list_assets_for_media(source_media_id).await?;
                let thumbnail_source = match thumbnail_blob_id {
                    Some(id) => Some(
                        source_assets
                            .iter()
                            .find(|asset| {
                                asset.id == *id
                                    && asset.status == MediaAssetStatus::Final
                                    && matches!(
                                        asset.kind,
                                        MediaAssetKind::Image | MediaAssetKind::Svg
                                    )
                            })
                            .ok_or_else(|| {
                                AppError::Internal(
                                    "video thumbnail asset is missing or invalid".into(),
                                )
                            })?,
                    ),
                    None => None,
                };
                let video_asset = source_assets.iter().find(|asset| asset.id == *blob_id);
                let (video_kind, content_type) = video_asset
                    .map(|asset| (asset.kind, asset.content_type.clone()))
                    .unwrap_or((MediaAssetKind::Video, "application/octet-stream".into()));
                let new_id = uuid::Uuid::new_v4().to_string();
                let (byte_length, etag) = self
                    .storage
                    .copy_final_file(blob_id, &new_id)
                    .map_err(|e| AppError::Internal(e.to_string()))?;
                let mut cleanup = FinalFileCleanup::new(self.storage.clone(), &new_id);
                let media_rid = RecordId::new("media", dest_media_id.to_owned());
                self.repo
                    .create_final(
                        &new_id,
                        CreateFinalAsset {
                            owner: owner.clone(),
                            media_id: media_rid.clone(),
                            kind: video_kind,
                            content_type,
                            byte_length,
                            etag,
                        },
                    )
                    .await?;
                cleanup.disarm();
                let copied_thumbnail_id = if let Some(thumbnail_source) = thumbnail_source {
                    let thumbnail_source_id = uuid::Uuid::parse_str(&thumbnail_source.id)
                        .map_err(|_| {
                            AppError::Internal("video thumbnail asset id is invalid".into())
                        })?
                        .to_string();
                    let thumbnail_id = uuid::Uuid::new_v4().to_string();
                    let (byte_length, etag) = self
                        .storage
                        .copy_final_file(&thumbnail_source_id, &thumbnail_id)
                        .map_err(|e| AppError::Internal(e.to_string()))?;
                    let mut thumbnail_cleanup =
                        FinalFileCleanup::new(self.storage.clone(), &thumbnail_id);
                    self.repo
                        .create_final(
                            &thumbnail_id,
                            CreateFinalAsset {
                                owner,
                                media_id: media_rid,
                                kind: thumbnail_source.kind,
                                content_type: thumbnail_source.content_type.clone(),
                                byte_length,
                                etag,
                            },
                        )
                        .await?;
                    thumbnail_cleanup.disarm();
                    Some(thumbnail_id)
                } else {
                    None
                };
                Ok(MediaContent::Video {
                    blob_id: new_id,
                    duration_ms: *duration_ms,
                    width: *width,
                    height: *height,
                    thumbnail_blob_id: copied_thumbnail_id,
                })
            }
            MediaContent::Audio {
                blob_id,
                duration_ms,
            } => {
                let content_type = self
                    .repo
                    .list_assets_for_media(source_media_id)
                    .await?
                    .into_iter()
                    .find(|asset| asset.id == *blob_id)
                    .map(|asset| asset.content_type)
                    .unwrap_or_else(|| "application/octet-stream".into());
                let new_id = uuid::Uuid::new_v4().to_string();
                let (byte_length, etag) = self
                    .storage
                    .copy_final_file(blob_id, &new_id)
                    .map_err(|e| AppError::Internal(e.to_string()))?;
                let mut cleanup = FinalFileCleanup::new(self.storage.clone(), &new_id);
                let media_rid = RecordId::new("media", dest_media_id.to_owned());
                self.repo
                    .create_final(
                        &new_id,
                        CreateFinalAsset {
                            owner,
                            media_id: media_rid,
                            kind: MediaAssetKind::Audio,
                            content_type,
                            byte_length,
                            etag,
                        },
                    )
                    .await?;
                cleanup.disarm();
                Ok(MediaContent::Audio {
                    blob_id: new_id,
                    duration_ms: *duration_ms,
                })
            }
            MediaContent::SlideDeck { pages } => {
                let sources = self.repo.list_assets_for_media(source_media_id).await?;
                let mut copied = Vec::with_capacity(pages.len());
                for page in pages {
                    let new_id = uuid::Uuid::new_v4().to_string();
                    let (byte_length, etag) = self
                        .storage
                        .copy_final_file(&page.blob_id, &new_id)
                        .map_err(|e| AppError::Internal(e.to_string()))?;
                    let mut cleanup = FinalFileCleanup::new(self.storage.clone(), &new_id);
                    let source_asset = sources.iter().find(|a| a.id == page.blob_id);
                    let (kind, content_type) = source_asset
                        .map(|a| (a.kind, a.content_type.clone()))
                        .unwrap_or((MediaAssetKind::Image, "application/octet-stream".into()));
                    let media_rid = RecordId::new("media", dest_media_id.to_owned());
                    self.repo
                        .create_final(
                            &new_id,
                            CreateFinalAsset {
                                owner: owner.clone(),
                                media_id: media_rid,
                                kind,
                                content_type,
                                byte_length,
                                etag,
                            },
                        )
                        .await?;
                    cleanup.disarm();
                    copied.push(shared::media::MediaDeckPage {
                        blob_id: new_id,
                        section_title: page.section_title.clone(),
                    });
                }
                Ok(MediaContent::SlideDeck { pages: copied })
            }
            _ => Ok(content.clone()),
        }
    }

    pub async fn reconcile_abandoned_staging(
        &self,
        extra_active: &std::collections::HashSet<String>,
    ) -> Result<u64, AppError> {
        self.expire_upload_sessions().await;
        let active = self.active_upload_ids().await;
        let merged: std::collections::HashSet<String> =
            active.union(extra_active).cloned().collect();
        let removed_files = self
            .storage
            .reconcile_staging_files(self.settings.staging_max_age_seconds, &merged)?;

        let stale = self
            .repo
            .list_staging_older_than(self.settings.staging_max_age_seconds)
            .await?;
        for asset in stale {
            if let Some(op) = asset.operation_id
                && !merged.contains(&op)
            {
                self.storage.delete_staging_file(&op);
                let _ = self.repo.delete_asset(&asset.id).await;
            }
        }
        Ok(removed_files)
    }

    pub async fn reconcile_orphan_assets(&self) -> Result<u64, AppError> {
        let assets = self.repo.delete_orphan_assets().await?;
        let count = assets.len() as u64;
        for asset in assets {
            match asset.status {
                MediaAssetStatus::Final => self.storage.delete_final_file(&asset.id),
                MediaAssetStatus::Staging => {
                    if let Some(operation_id) = asset.operation_id {
                        self.storage.delete_staging_file(&operation_id);
                    }
                }
            }
        }
        Ok(count)
    }
}

pub type MediaAssetServiceHandle = MediaAssetService<SurrealMediaAssetRepo, SurrealMediaRepo>;

impl MediaAssetServiceHandle {
    pub fn build(db: Arc<Database>, settings: &Settings) -> Self {
        let storage = Arc::new(FsMediaAssetStorage::new(
            settings.media_staging_dir.clone(),
            settings.media_final_dir.clone(),
        ));
        Self::new(
            SurrealMediaAssetRepo::new(db.clone()),
            SurrealMediaRepo::new(db),
            storage,
            MediaAssetSettings::from_settings(settings),
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::resources::media_asset::model::CreateStagingAsset;
    use crate::test_helpers::{TeamFixture, auth_ctx_for_user, media_service, test_db};
    use shared::media::{CreateMedia, CreateMediaContent};

    fn test_asset_service(db: &Arc<Database>) -> MediaAssetServiceHandle {
        let dir = tempfile::tempdir().unwrap();
        MediaAssetServiceHandle::build(
            db.clone(),
            &Settings {
                media_staging_dir: dir.path().join("staging").to_string_lossy().into(),
                media_final_dir: dir.path().join("final").to_string_lossy().into(),
                ..Settings::default()
            },
        )
    }

    #[tokio::test]
    async fn promote_staging_moves_bytes_and_updates_metadata() {
        let db = test_db().await.unwrap();
        let fixture = TeamFixture::build(&db).await.unwrap();
        let media_svc = media_service(&db);
        let asset_svc = test_asset_service(&db);
        asset_svc.ensure_directories().await.unwrap();

        let ctx = auth_ctx_for_user(&db, &fixture.writer).await.unwrap();
        let media = media_svc
            .create_for_user(
                &ctx,
                CreateMedia {
                    title: "Upload test".into(),
                    owner: Some(fixture.shared_team_id.clone()),
                    content: CreateMediaContent::YouTube {
                        url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ".into(),
                    },
                    is_background: false,
                },
            )
            .await
            .unwrap();

        let operation_id = uuid::Uuid::new_v4().to_string();
        let staging_path = asset_svc.storage.staging_path(&operation_id);
        std::fs::create_dir_all(staging_path.parent().unwrap()).unwrap();
        std::fs::write(&staging_path, b"testdata").unwrap();
        let etag = crate::http_range::etag_from_file_bytes(b"testdata");
        let owner = parse_owner_record_id(&fixture.shared_team_id).unwrap();
        let media_rid = RecordId::new("media", media.id.clone());
        let staging = asset_svc
            .repo
            .create_staging(CreateStagingAsset {
                owner,
                media_id: media_rid,
                kind: MediaAssetKind::Video,
                content_type: "video/mp4".into(),
                byte_length: 8,
                operation_id: operation_id.clone(),
                etag,
            })
            .await
            .unwrap();

        let promoted = asset_svc.promote_staging(&operation_id).await.unwrap();
        assert_eq!(promoted.status, MediaAssetStatus::Final);
        assert!(asset_svc.final_file_path(&staging.id).exists());

        asset_svc.delete_final_file(&staging.id);
        asset_svc.delete_asset_record(&staging.id).await.unwrap();
    }

    #[tokio::test]
    async fn orphan_reconciliation_removes_records_and_final_files() {
        let db = test_db().await.unwrap();
        let fixture = TeamFixture::build(&db).await.unwrap();
        let media_svc = media_service(&db);
        let asset_svc = test_asset_service(&db);
        asset_svc.ensure_directories().await.unwrap();
        let ctx = auth_ctx_for_user(&db, &fixture.writer).await.unwrap();
        let media = media_svc
            .create_for_user(
                &ctx,
                CreateMedia {
                    title: "Orphan owner".into(),
                    owner: Some(fixture.shared_team_id.clone()),
                    content: CreateMediaContent::YouTube {
                        url: "https://youtu.be/dQw4w9WgXcQ".into(),
                    },
                    is_background: false,
                },
            )
            .await
            .unwrap();
        let source = tempfile::NamedTempFile::new().unwrap();
        std::fs::write(source.path(), b"asset bytes").unwrap();
        let asset = asset_svc
            .ingest_final_file(
                parse_owner_record_id(&fixture.shared_team_id).unwrap(),
                RecordId::new("media", media.id.clone()),
                MediaAssetKind::Image,
                "image/png".into(),
                source.path(),
            )
            .await
            .unwrap();
        assert!(asset_svc.final_file_path(&asset.id).exists());

        db.db
            .query("DELETE type::record('media', $id)")
            .bind(("id", media.id.clone()))
            .await
            .unwrap()
            .check()
            .unwrap();
        assert_eq!(asset_svc.reconcile_orphan_assets().await.unwrap(), 1);
        assert!(!asset_svc.final_file_path(&asset.id).exists());
        assert!(
            asset_svc
                .repo
                .list_assets_for_media(&media.id)
                .await
                .unwrap()
                .is_empty()
        );
    }
}
