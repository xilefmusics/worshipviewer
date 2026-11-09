use std::io::ErrorKind;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::SystemTime;

use actix_web::web::Payload;
use futures_util::StreamExt;
use ring::digest::{Context, SHA256};
use tokio::fs::{self, File};
use tokio::io::AsyncWriteExt;

use crate::error::AppError;
use crate::http_range::etag_from_file_bytes;

/// Result of a completed streaming upload.
#[derive(Debug, Clone)]
pub struct StagingUploadResult {
    pub byte_length: u64,
    pub etag: String,
}

pub trait MediaAssetStorage: Send + Sync {
    fn staging_path(&self, operation_id: &str) -> PathBuf;
    fn final_path(&self, asset_id: &str) -> PathBuf;

    fn delete_staging_file(&self, operation_id: &str);
    fn delete_final_file(&self, asset_id: &str);

    fn promote_file(&self, operation_id: &str, asset_id: &str) -> Result<(), AppError>;

    fn ingest_final_from_path(
        &self,
        source: &Path,
        asset_id: &str,
    ) -> Result<(u64, String), AppError>;

    fn copy_final_file(
        &self,
        from_asset_id: &str,
        to_asset_id: &str,
    ) -> Result<(u64, String), AppError>;

    /// Remove staging files on disk older than `max_age_seconds` except `active` operation ids.
    fn reconcile_staging_files(
        &self,
        max_age_seconds: u64,
        active: &std::collections::HashSet<String>,
    ) -> Result<u64, AppError>;
}

#[derive(Clone)]
pub struct FsMediaAssetStorage {
    staging_dir: String,
    final_dir: String,
}

impl FsMediaAssetStorage {
    pub fn new(staging_dir: String, final_dir: String) -> Self {
        Self {
            staging_dir,
            final_dir,
        }
    }

    pub async fn ensure_directories(&self) -> Result<(), AppError> {
        fs::create_dir_all(&self.staging_dir)
            .await
            .map_err(|e| AppError::internal_from_err("media_asset.storage.staging_dir", e))?;
        fs::create_dir_all(&self.final_dir)
            .await
            .map_err(|e| AppError::internal_from_err("media_asset.storage.final_dir", e))?;
        Ok(())
    }

    pub async fn stream_upload_to_staging(
        &self,
        operation_id: &str,
        mut payload: Payload,
        max_bytes: usize,
    ) -> Result<StagingUploadResult, AppError> {
        let path = self.staging_path(operation_id);
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)
                .await
                .map_err(|e| AppError::internal_from_err("media_asset.storage.create_parent", e))?;
        }
        let mut file = File::create(&path)
            .await
            .map_err(|e| AppError::internal_from_err("media_asset.storage.create", e))?;
        let mut total: u64 = 0;
        let mut hasher = Context::new(&SHA256);
        while let Some(chunk) = payload.next().await {
            let chunk =
                chunk.map_err(|e| AppError::invalid_request(format!("upload error: {e}")))?;
            if total as usize + chunk.len() > max_bytes {
                drop(file);
                let _ = fs::remove_file(&path).await;
                return Err(AppError::payload_too_large());
            }
            hasher.update(&chunk);
            file.write_all(&chunk)
                .await
                .map_err(|e| AppError::internal_from_err("media_asset.storage.write", e))?;
            total += chunk.len() as u64;
        }
        file.flush()
            .await
            .map_err(|e| AppError::internal_from_err("media_asset.storage.flush", e))?;
        let digest = hasher.finish();
        let etag = format!("W/\"{}\"", hex::encode(digest.as_ref()));
        Ok(StagingUploadResult {
            byte_length: total,
            etag,
        })
    }
}

impl MediaAssetStorage for FsMediaAssetStorage {
    fn staging_path(&self, operation_id: &str) -> PathBuf {
        Path::new(&self.staging_dir).join(operation_id)
    }

    fn final_path(&self, asset_id: &str) -> PathBuf {
        Path::new(&self.final_dir).join(asset_id)
    }

    fn delete_staging_file(&self, operation_id: &str) {
        let path = self.staging_path(operation_id);
        match std::fs::remove_file(&path) {
            Ok(()) => {}
            Err(err) if err.kind() == ErrorKind::NotFound => {}
            Err(err) => {
                tracing::warn!(
                    operation_id = %operation_id,
                    error = %err,
                    "failed to delete staging file"
                );
            }
        }
    }

    fn delete_final_file(&self, asset_id: &str) {
        let path = self.final_path(asset_id);
        match std::fs::remove_file(&path) {
            Ok(()) => {}
            Err(err) if err.kind() == ErrorKind::NotFound => {}
            Err(err) => {
                tracing::warn!(
                    asset_id = %asset_id,
                    error = %err,
                    "failed to delete final media asset file"
                );
            }
        }
    }

    fn promote_file(&self, operation_id: &str, asset_id: &str) -> Result<(), AppError> {
        let from = self.staging_path(operation_id);
        let to = self.final_path(asset_id);
        if let Some(parent) = to.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|e| AppError::internal_from_err("media_asset.storage.promote_mkdir", e))?;
        }
        std::fs::rename(&from, &to)
            .map_err(|e| AppError::internal_from_err("media_asset.storage.promote_rename", e))?;
        Ok(())
    }

    fn reconcile_staging_files(
        &self,
        max_age_seconds: u64,
        active: &std::collections::HashSet<String>,
    ) -> Result<u64, AppError> {
        let staging = Path::new(&self.staging_dir);
        if !staging.exists() {
            return Ok(0);
        }
        let cutoff = SystemTime::now()
            .checked_sub(std::time::Duration::from_secs(max_age_seconds))
            .unwrap_or(SystemTime::UNIX_EPOCH);
        let mut removed = 0u64;
        let entries = std::fs::read_dir(staging)
            .map_err(|e| AppError::internal_from_err("media_asset.storage.reconcile_read", e))?;
        for entry in entries {
            let entry = entry.map_err(|e| {
                AppError::internal_from_err("media_asset.storage.reconcile_entry", e)
            })?;
            let name = entry.file_name().to_string_lossy().into_owned();
            if active.contains(&name) {
                continue;
            }
            let meta = entry.metadata().map_err(|e| {
                AppError::internal_from_err("media_asset.storage.reconcile_meta", e)
            })?;
            let modified = meta.modified().unwrap_or(SystemTime::UNIX_EPOCH);
            if modified < cutoff
                && entry.path().is_file()
                && std::fs::remove_file(entry.path()).is_ok()
            {
                removed += 1;
            }
        }
        Ok(removed)
    }

    fn ingest_final_from_path(
        &self,
        source: &Path,
        asset_id: &str,
    ) -> Result<(u64, String), AppError> {
        let to = self.final_path(asset_id);
        if let Some(parent) = to.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|e| AppError::internal_from_err("media_asset.storage.ingest_mkdir", e))?;
        }
        std::fs::copy(source, &to)
            .map_err(|e| AppError::internal_from_err("media_asset.storage.ingest_copy", e))?;
        let bytes = std::fs::read(&to)
            .map_err(|e| AppError::internal_from_err("media_asset.storage.ingest_read", e))?;
        let etag = etag_from_file_bytes(&bytes);
        Ok((bytes.len() as u64, etag))
    }

    fn copy_final_file(
        &self,
        from_asset_id: &str,
        to_asset_id: &str,
    ) -> Result<(u64, String), AppError> {
        let from = self.final_path(from_asset_id);
        self.ingest_final_from_path(&from, to_asset_id)
    }
}

/// Deletes the staging file on drop unless disarmed.
pub struct StagingCleanupGuard {
    storage: Arc<FsMediaAssetStorage>,
    operation_id: String,
    armed: bool,
}

impl StagingCleanupGuard {
    pub fn new(storage: Arc<FsMediaAssetStorage>, operation_id: String) -> Self {
        Self {
            storage,
            operation_id,
            armed: true,
        }
    }

    pub fn disarm(&mut self) {
        self.armed = false;
    }
}

impl Drop for StagingCleanupGuard {
    fn drop(&mut self) {
        if self.armed {
            self.storage.delete_staging_file(&self.operation_id);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dirs() -> (tempfile::TempDir, FsMediaAssetStorage) {
        let dir = tempfile::tempdir().unwrap();
        let staging = dir.path().join("staging").to_string_lossy().into_owned();
        let final_dir = dir.path().join("final").to_string_lossy().into_owned();
        (dir, FsMediaAssetStorage::new(staging, final_dir))
    }

    #[test]
    fn promote_moves_file() {
        let (_dir, storage) = temp_dirs();
        let staging = storage.staging_path("op3");
        std::fs::create_dir_all(staging.parent().unwrap()).unwrap();
        std::fs::write(&staging, b"data").unwrap();
        storage.promote_file("op3", "asset3").unwrap();
        assert!(!staging.exists());
        assert!(storage.final_path("asset3").exists());
    }

    #[test]
    fn cleanup_guard_removes_on_drop() {
        let (_dir, storage) = temp_dirs();
        let storage = std::sync::Arc::new(storage);
        let path = storage.staging_path("op4");
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(&path, b"x").unwrap();
        {
            let _guard = StagingCleanupGuard::new(storage.clone(), "op4".into());
        }
        assert!(!path.exists());
    }
}
