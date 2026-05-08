use async_trait::async_trait;

use shared::user::{HttpAuditMetrics, Session};

use crate::error::AppError;

/// Pure session data access — no authorization.
#[async_trait]
pub trait SessionRepository: Send + Sync {
    async fn get_session(&self, id: &str) -> Result<Session, AppError>;
    async fn get_http_audit_metrics_for_session(
        &self,
        session_id: &str,
    ) -> Result<HttpAuditMetrics, AppError>;
    async fn get_session_for_user(&self, id: &str, user_id: &str) -> Result<Session, AppError>;
    async fn create_session(&self, session: Session) -> Result<Session, AppError>;
    async fn delete_session(&self, id: &str) -> Result<Session, AppError>;
    async fn delete_session_for_user(&self, id: &str, user_id: &str) -> Result<Session, AppError>;
    async fn get_sessions_by_user_id(&self, user_id: &str) -> Result<Vec<Session>, AppError>;
}
