use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

#[cfg(feature = "backend")]
#[allow(unused_imports)]
use serde_json::json;

/// HTTP request audit aggregates for a user or session (`GET .../metrics`).
#[cfg_attr(feature = "backend", derive(utoipa::ToSchema))]
#[derive(Clone, Debug, Deserialize, Serialize)]
#[cfg_attr(
    feature = "backend",
    schema(example = json!({
        "request_count": 42,
        "last_used_at": "2026-01-01T12:00:00Z"
    }))
)]
pub struct HttpAuditMetrics {
    pub request_count: u64,
    pub last_used_at: Option<DateTime<Utc>>,
}
