use async_trait::async_trait;
use surrealdb::types::RecordId;

use shared::media::{Media, MediaListQuery};

use crate::error::AppError;

use super::model::MediaWrite;

#[async_trait]
pub trait MediaRepository: Send + Sync {
    async fn list(
        &self,
        read_teams: &[RecordId],
        query: MediaListQuery,
    ) -> Result<Vec<Media>, AppError>;
    async fn count(&self, read_teams: &[RecordId], query: &MediaListQuery)
    -> Result<u64, AppError>;
    async fn get(&self, read_teams: &[RecordId], id: &str) -> Result<Media, AppError>;
    async fn create(&self, owner: RecordId, value: MediaWrite) -> Result<Media, AppError>;
    async fn create_with_id(
        &self,
        id: &str,
        owner: RecordId,
        value: MediaWrite,
    ) -> Result<Media, AppError>;
    async fn update_if_current(
        &self,
        write_teams: &[RecordId],
        id: &str,
        current: &Media,
        owner: Option<RecordId>,
        value: MediaWrite,
    ) -> Result<Media, AppError>;
    async fn move_owner(
        &self,
        write_teams: &[RecordId],
        id: &str,
        owner: RecordId,
    ) -> Result<Media, AppError>;
    async fn delete_if_current(
        &self,
        write_teams: &[RecordId],
        id: &str,
        current: &Media,
    ) -> Result<Media, AppError>;
}
