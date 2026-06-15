use serde::Deserialize;
use surrealdb::types::SurrealValue;

use shared::api::ListQuery;

use crate::database::Database;
use crate::error::AppError;

use super::model::{HttpAuditLog, HttpAuditRecord};

pub struct MonitoringRepo;

fn surreal_query_err(ctx: &'static str, err: surrealdb::Error) -> AppError {
    crate::observability::log_error_chain(ctx, &err);
    AppError::database(err.to_string())
}

impl MonitoringRepo {
    pub async fn count_http_audit_logs(db: &Database) -> Result<u64, AppError> {
        #[derive(Deserialize, SurrealValue)]
        struct CountResult {
            count: u64,
        }
        let mut response = db
            .db
            .query("SELECT count() FROM http_request_audit GROUP ALL")
            .await
            .map_err(|e| surreal_query_err("http_audit.count", e))?;
        Ok(response
            .take::<Vec<CountResult>>(0)
            .map_err(|e| surreal_query_err("http_audit.count.take", e))?
            .into_iter()
            .next()
            .map(|r| r.count)
            .unwrap_or(0))
    }

    pub async fn list_http_audit_logs(
        db: &Database,
        query: ListQuery,
    ) -> Result<Vec<HttpAuditLog>, AppError> {
        let (offset, limit) = query.effective_offset_limit();
        let mut response = db
            .db
            .query(
                "SELECT * FROM http_request_audit ORDER BY created_at DESC LIMIT $limit START $start",
            )
            .bind(("limit", limit))
            .bind(("start", offset))
            .await
            .map_err(|e| surreal_query_err("http_audit.list", e))?;
        let rows: Vec<HttpAuditRecord> = response
            .take(0)
            .map_err(|e| surreal_query_err("http_audit.list.take", e))?;
        Ok(rows.into_iter().map(|r| r.into_wire()).collect())
    }
}
