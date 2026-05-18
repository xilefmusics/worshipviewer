//! One persisted HTTP request audit row (admin monitoring API).

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

/// Wire shape for `GET /api/v1/monitoring/http-audit-logs` items.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct HttpAuditLog {
    pub id: String,
    pub request_id: String,
    pub method: String,
    pub path: String,
    pub status_code: i32,
    pub duration_ms: i32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub user_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub session_id: Option<String>,
    pub client_origin: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub client_version: Option<String>,
    pub created_at: DateTime<Utc>,
}
