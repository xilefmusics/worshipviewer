use async_trait::async_trait;
use surrealdb::types::RecordId;

use shared::api::ListQuery;
use shared::collection::{Collection, CreateCollection};
use shared::song::{Link as SongLink, LinkOwned as SongLinkOwned};

use crate::error::AppError;

/// Pure collection data access (no user ACL — callers pass pre-resolved team [`RecordId`]s).
#[async_trait]
pub trait CollectionRepository: Send + Sync {
    async fn get_collections(
        &self,
        read_teams: &[RecordId],
        pagination: ListQuery,
    ) -> Result<Vec<Collection>, AppError>;

    /// Count all collections visible to `read_teams`, optionally filtered by `q`.
    async fn count_collections(
        &self,
        read_teams: &[RecordId],
        q: Option<&str>,
    ) -> Result<u64, AppError>;

    async fn get_collection(
        &self,
        read_teams: &[RecordId],
        id: &str,
    ) -> Result<Collection, AppError>;

    async fn get_collection_songs(
        &self,
        read_teams: &[RecordId],
        id: &str,
    ) -> Result<Vec<SongLinkOwned>, AppError>;

    async fn create_collection(
        &self,
        owner: RecordId,
        collection: CreateCollection,
    ) -> Result<Collection, AppError>;

    async fn update_collection(
        &self,
        write_teams: &[RecordId],
        id: &str,
        collection: CreateCollection,
        owner: Option<RecordId>,
    ) -> Result<Collection, AppError>;

    async fn delete_collection(
        &self,
        write_teams: &[RecordId],
        id: &str,
    ) -> Result<Collection, AppError>;

    /// Sets `owner` when the row is currently owned by a team in `write_teams`.
    async fn move_collection_owner(
        &self,
        write_teams: &[RecordId],
        id: &str,
        new_owner: RecordId,
    ) -> Result<Collection, AppError>;

    async fn add_song_to_collection(
        &self,
        write_teams: &[RecordId],
        id: &str,
        song_link: SongLink,
    ) -> Result<(), AppError>;

    /// Atomically remove `song_id` from `source_id` and append `link` to `target_id`.
    async fn transfer_song_link_between_collections(
        &self,
        write_teams: &[RecordId],
        source_id: &str,
        target_id: &str,
        song_id: &str,
        link: SongLink,
    ) -> Result<(Collection, Collection), AppError>;

    /// Remove `song_id` from `source_id` only (repair / unlink without deleting the song).
    async fn remove_song_link_from_collection(
        &self,
        write_teams: &[RecordId],
        source_id: &str,
        song_id: &str,
    ) -> Result<Collection, AppError>;
}
