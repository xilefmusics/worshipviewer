use std::sync::Arc;

use async_trait::async_trait;
use serde::Deserialize;
use surrealdb::types::{RecordId, SurrealValue};

use shared::user::{HttpAuditMetrics, Session};

use crate::database::{Database, record_id_string};
use crate::error::AppError;

use super::model::{SessionCreateRecord, SessionIdRecord, SessionRecord};
use super::repository::SessionRepository;

#[derive(Debug, Deserialize, SurrealValue)]
struct HttpAuditMetricsRow {
    request_count: i64,
    last_used_at: Option<surrealdb::types::Datetime>,
}

impl From<HttpAuditMetricsRow> for HttpAuditMetrics {
    fn from(row: HttpAuditMetricsRow) -> Self {
        Self {
            request_count: row.request_count.max(0) as u64,
            last_used_at: row.last_used_at.map(Into::into),
        }
    }
}

#[derive(Clone)]
pub struct SurrealSessionRepo {
    db: Arc<Database>,
}

impl SurrealSessionRepo {
    pub fn new(db: Arc<Database>) -> Self {
        Self { db }
    }

    fn inner(&self) -> &Database {
        &self.db
    }
}

#[async_trait]
impl SessionRepository for SurrealSessionRepo {
    async fn get_session(&self, id: &str) -> Result<Session, AppError> {
        self.inner()
            .db
            .query("SELECT * FROM session WHERE id = $id FETCH user")
            .bind(("id", RecordId::new("session", id.to_string())))
            .await?
            .take::<Option<SessionRecord>>(0)?
            .map(SessionRecord::into_session)
            .ok_or(AppError::NotFound("session not found".into()))
    }

    async fn get_http_audit_metrics_for_session(
        &self,
        session_id: &str,
    ) -> Result<HttpAuditMetrics, AppError> {
        let mut response = self
            .inner()
            .db
            .query(
                "RETURN { request_count: fn::http_audit_count_for_session($rid), last_used_at: fn::http_audit_last_used_at_for_session($rid) };",
            )
            .bind(("rid", RecordId::new("session", session_id.to_owned())))
            .await
            .map_err(|e| {
                crate::log_and_convert!(AppError::database, "session.http_audit_metrics.query", e)
            })?;
        let row = response
            .take::<Option<HttpAuditMetricsRow>>(0)
            .map_err(|e| {
                crate::log_and_convert!(AppError::database, "session.http_audit_metrics.take", e)
            })?
            .ok_or_else(|| AppError::database("http audit metrics for session returned no row"))?;
        Ok(row.into())
    }

    async fn get_session_for_user(&self, id: &str, user_id: &str) -> Result<Session, AppError> {
        self.inner()
            .db
            .query("SELECT * FROM session WHERE id = $id AND user = $user FETCH user")
            .bind(("id", RecordId::new("session", id.to_string())))
            .bind(("user", RecordId::new("user", user_id.to_owned())))
            .await?
            .take::<Option<SessionRecord>>(0)?
            .map(SessionRecord::into_session)
            .ok_or(AppError::NotFound("session not found".into()))
    }

    async fn create_session(&self, session: Session) -> Result<Session, AppError> {
        let record: SessionIdRecord = self
            .inner()
            .db
            .create(("session", session.id.clone()))
            .content(SessionCreateRecord::from_session(session))
            .await?
            .ok_or_else(|| AppError::database("Failed to create session"))?;

        self.get_session(&record_id_string(&record.id)).await
    }

    async fn delete_session(&self, id: &str) -> Result<Session, AppError> {
        let session = self.get_session(id).await?;
        let _: Option<SessionIdRecord> = self.inner().db.delete(("session", id)).await?;
        Ok(session)
    }

    async fn delete_session_for_user(&self, id: &str, user_id: &str) -> Result<Session, AppError> {
        let session = self.get_session_for_user(id, user_id).await?;
        let _: Option<SessionIdRecord> = self.inner().db.delete(("session", id)).await?;
        Ok(session)
    }

    async fn get_sessions_by_user_id(&self, user_id: &str) -> Result<Vec<Session>, AppError> {
        Ok(self
            .inner()
            .db
            .query("SELECT * FROM session WHERE user = $user FETCH user")
            .bind(("user", RecordId::new("user", user_id.to_owned())))
            .await?
            .take::<Vec<SessionRecord>>(0)?
            .into_iter()
            .map(|record| record.into_session())
            .collect())
    }
}
