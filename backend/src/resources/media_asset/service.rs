use std::collections::HashSet;
use std::sync::Arc;

use actix_web::web::Payload;
use shared::{MediaAsset, MediaAssetKind, MediaAssetStatus};
use surrealdb::types::RecordId;
use tokio::sync::RwLock;
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
}

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
        self.active_uploads.read().await.clone()
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
                self.storage
                    .copy_final_file(blob_id, &new_id)
                    .map_err(|e| AppError::Internal(e.to_string()))?;
                let mut cleanup = FinalFileCleanup::new(self.storage.clone(), &new_id);
                let bytes = std::fs::read(self.final_file_path(&new_id))
                    .map_err(|e| AppError::internal_from_err("media.duplicate.read", e))?;
                let etag = crate::http_range::etag_from_file_bytes(&bytes);
                self.repo
                    .create_final(
                        &new_id,
                        CreateFinalAsset {
                            owner,
                            media_id: RecordId::new("media", dest_media_id.to_owned()),
                            kind,
                            content_type,
                            byte_length: bytes.len() as u64,
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
                self.storage
                    .copy_final_file(blob_id, &new_id)
                    .map_err(|e| AppError::Internal(e.to_string()))?;
                let mut cleanup = FinalFileCleanup::new(self.storage.clone(), &new_id);
                let bytes = std::fs::read(self.final_file_path(&new_id))
                    .map_err(|e| AppError::internal_from_err("media.duplicate.read", e))?;
                let etag = crate::http_range::etag_from_file_bytes(&bytes);
                let media_rid = RecordId::new("media", dest_media_id.to_owned());
                self.repo
                    .create_final(
                        &new_id,
                        CreateFinalAsset {
                            owner,
                            media_id: media_rid,
                            kind: MediaAssetKind::Video,
                            content_type,
                            byte_length: bytes.len() as u64,
                            etag,
                        },
                    )
                    .await?;
                cleanup.disarm();
                Ok(MediaContent::Video {
                    blob_id: new_id,
                    duration_ms: *duration_ms,
                    width: *width,
                    height: *height,
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
                self.storage
                    .copy_final_file(blob_id, &new_id)
                    .map_err(|e| AppError::Internal(e.to_string()))?;
                let mut cleanup = FinalFileCleanup::new(self.storage.clone(), &new_id);
                let bytes = std::fs::read(self.final_file_path(&new_id))
                    .map_err(|e| AppError::internal_from_err("media.duplicate.read", e))?;
                let etag = crate::http_range::etag_from_file_bytes(&bytes);
                let media_rid = RecordId::new("media", dest_media_id.to_owned());
                self.repo
                    .create_final(
                        &new_id,
                        CreateFinalAsset {
                            owner,
                            media_id: media_rid,
                            kind: MediaAssetKind::Audio,
                            content_type,
                            byte_length: bytes.len() as u64,
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
                    self.storage
                        .copy_final_file(&page.blob_id, &new_id)
                        .map_err(|e| AppError::Internal(e.to_string()))?;
                    let mut cleanup = FinalFileCleanup::new(self.storage.clone(), &new_id);
                    let bytes = std::fs::read(self.final_file_path(&new_id))
                        .map_err(|e| AppError::internal_from_err("media.duplicate.read", e))?;
                    let etag = crate::http_range::etag_from_file_bytes(&bytes);
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
                                byte_length: bytes.len() as u64,
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
