use async_trait::async_trait;

use shared::api::ListQuery;
use shared::user::{HttpAuditMetrics, User};

use crate::error::AppError;

/// Pure user data access — no authorization. All operations work on platform-level identity.
#[async_trait]
pub trait UserRepository: Send + Sync {
    async fn get_users(&self, pagination: ListQuery) -> Result<Vec<User>, AppError>;
    /// Count users matching the same optional `q` filter as [`get_users`](Self::get_users) (ignores page).
    async fn count_users(&self, query: ListQuery) -> Result<u64, AppError>;
    async fn get_user(&self, id: &str) -> Result<User, AppError>;
    async fn get_http_audit_metrics_for_user(
        &self,
        user_id: &str,
    ) -> Result<HttpAuditMetrics, AppError>;
    async fn get_user_by_email(&self, email: &str) -> Result<Option<User>, AppError>;
    /// Insert a user record. Does NOT create a personal team — service layer handles that.
    async fn create_user_record(&self, user: User) -> Result<User, AppError>;
    async fn delete_user(&self, id: &str) -> Result<User, AppError>;
    async fn set_default_collection(
        &self,
        user_id: &str,
        collection_id: &str,
    ) -> Result<(), AppError>;

    async fn set_oauth_picture_and_oauth_avatar_blob(
        &self,
        user_id: &str,
        picture_url: &str,
        oauth_blob_id: &str,
    ) -> Result<(), AppError>;

    async fn set_avatar_blob(
        &self,
        user_id: &str,
        avatar_blob_id: Option<&str>,
    ) -> Result<(), AppError>;
}
