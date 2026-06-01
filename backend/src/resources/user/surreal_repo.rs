use std::sync::Arc;

use async_trait::async_trait;
use surrealdb::types::RecordId;

use serde::Deserialize;
use surrealdb::types::SurrealValue;

use shared::api::ListQuery;
use shared::user::{HttpAuditMetrics, User};

use crate::database::{Database, surreal_take_errors};
use crate::error::AppError;

use super::model::{UserRecord, user_resource};
use super::repository::UserRepository;

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
pub struct SurrealUserRepo {
    db: Arc<Database>,
}

impl SurrealUserRepo {
    pub fn new(db: Arc<Database>) -> Self {
        Self { db }
    }

    fn inner(&self) -> &Database {
        &self.db
    }
}

#[async_trait]
impl UserRepository for SurrealUserRepo {
    async fn get_users(&self, pagination: ListQuery) -> Result<Vec<User>, AppError> {
        let (offset, limit) = pagination.effective_offset_limit();
        let needle = pagination.q.as_ref().and_then(|s| {
            let t = s.trim();
            if t.is_empty() {
                None
            } else {
                Some(t.to_lowercase())
            }
        });
        let mut response = if let Some(needle) = needle {
            self.inner()
                .db
                .query(
                    "SELECT * FROM user WHERE string::contains(string::lowercase(email), $needle) \
                     OR string::contains(string::lowercase(type::string(id)), $needle) \
                     LIMIT $limit START $start",
                )
                .bind(("needle", needle))
                .bind(("limit", limit))
                .bind(("start", offset))
                .await?
        } else {
            self.inner()
                .db
                .query("SELECT * FROM user LIMIT $limit START $start")
                .bind(("limit", limit))
                .bind(("start", offset))
                .await?
        };
        Ok(response
            .take::<Vec<UserRecord>>(0)?
            .into_iter()
            .map(UserRecord::into_user)
            .collect())
    }

    async fn count_users(&self, query: ListQuery) -> Result<u64, AppError> {
        #[derive(Deserialize, SurrealValue)]
        struct CountResult {
            count: u64,
        }
        let needle = query.q.as_ref().and_then(|s| {
            let t = s.trim();
            if t.is_empty() {
                None
            } else {
                Some(t.to_lowercase())
            }
        });
        let mut response = if let Some(needle) = needle {
            self.inner()
                .db
                .query(
                    "SELECT count() FROM user WHERE string::contains(string::lowercase(email), $needle) \
                     OR string::contains(string::lowercase(type::string(id)), $needle) GROUP ALL",
                )
                .bind(("needle", needle))
                .await?
        } else {
            self.inner()
                .db
                .query("SELECT count() FROM user GROUP ALL")
                .await?
        };
        Ok(response
            .take::<Vec<CountResult>>(0)?
            .into_iter()
            .next()
            .map(|r| r.count)
            .unwrap_or(0))
    }

    async fn get_user(&self, id: &str) -> Result<User, AppError> {
        self.inner()
            .db
            .select(user_resource(id)?)
            .await?
            .map(UserRecord::into_user)
            .ok_or(AppError::NotFound("user not found".into()))
    }

    async fn get_http_audit_metrics_for_user(
        &self,
        user_id: &str,
    ) -> Result<HttpAuditMetrics, AppError> {
        let mut response = self
            .inner()
            .db
            .query(
                "RETURN { request_count: fn::http_audit_count_for_user($rid), last_used_at: fn::http_audit_last_used_at_for_user($rid) };",
            )
            .bind(("rid", RecordId::new("user", user_id.to_owned())))
            .await
            .map_err(|e| crate::log_and_convert!(AppError::database, "user.http_audit_metrics.query", e))?;
        let row = response
            .take::<Option<HttpAuditMetricsRow>>(0)
            .map_err(|e| {
                crate::log_and_convert!(AppError::database, "user.http_audit_metrics.take", e)
            })?
            .ok_or_else(|| AppError::database("http audit metrics for user returned no row"))?;
        Ok(row.into())
    }

    async fn get_user_by_email(&self, email: &str) -> Result<Option<User>, AppError> {
        Ok(self
            .inner()
            .db
            .query("SELECT * FROM user WHERE email = $email LIMIT 1")
            .bind(("email", email.to_lowercase()))
            .await?
            .take::<Option<UserRecord>>(0)?
            .map(UserRecord::into_user))
    }

    async fn create_user_record(&self, user: User) -> Result<User, AppError> {
        self.inner()
            .db
            .create("user")
            .content(UserRecord::from_user(user))
            .await?
            .map(UserRecord::into_user)
            .ok_or_else(|| AppError::database("failed to create user"))
    }

    async fn delete_user(&self, id: &str) -> Result<User, AppError> {
        self.inner()
            .db
            .delete(user_resource(id)?)
            .await?
            .map(UserRecord::into_user)
            .ok_or(AppError::NotFound("user not found".into()))
    }

    async fn set_oauth_picture_and_oauth_avatar_blob(
        &self,
        user_id: &str,
        picture_url: &str,
        oauth_blob_id: &str,
    ) -> Result<(), AppError> {
        let mut response = self
            .inner()
            .db
            .query("UPDATE $user SET oauth_picture_url = $url, oauth_avatar_blob = $blob_ref")
            .bind(("user", RecordId::new("user", user_id)))
            .bind(("url", picture_url.to_owned()))
            .bind(("blob_ref", RecordId::new("blob", oauth_blob_id)))
            .await?;
        surreal_take_errors(
            "user.set_oauth_picture_and_oauth_avatar_blob",
            &mut response,
        )?;
        let _ = response.check().map_err(|e| {
            crate::log_and_convert!(
                AppError::database,
                "user.set_oauth_picture_and_oauth_avatar_blob.check",
                e
            )
        })?;
        Ok(())
    }

    async fn set_avatar_blob(
        &self,
        user_id: &str,
        avatar_blob_id: Option<&str>,
    ) -> Result<(), AppError> {
        let mut response = if let Some(bid) = avatar_blob_id {
            self.inner()
                .db
                .query("UPDATE $user SET avatar_blob = $blob_ref")
                .bind(("user", RecordId::new("user", user_id)))
                .bind(("blob_ref", RecordId::new("blob", bid)))
                .await?
        } else {
            self.inner()
                .db
                .query("UPDATE $user SET avatar_blob = NONE")
                .bind(("user", RecordId::new("user", user_id)))
                .await?
        };
        surreal_take_errors("user.set_avatar_blob", &mut response)?;
        let _ = response.check().map_err(|e| {
            crate::log_and_convert!(AppError::database, "user.set_avatar_blob.check", e)
        })?;
        Ok(())
    }
}
