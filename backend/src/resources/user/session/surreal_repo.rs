use std::sync::Arc;

use async_trait::async_trait;
use surrealdb::types::RecordId;

use shared::user::Session;

use crate::database::{Database, record_id_string};
use crate::error::AppError;

use super::model::{SessionCreateRecord, SessionIdRecord, SessionRecord};
use super::repository::SessionRepository;

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
