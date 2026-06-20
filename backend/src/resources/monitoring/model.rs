use chrono::{DateTime, Duration, NaiveDate, Utc};
use serde::de::{Error as DeError, Visitor};
use serde::{Deserialize, Deserializer, Serialize};
use surrealdb::types::{Datetime, RecordId, SurrealValue};
use utoipa::{IntoParams, ToSchema};

use crate::database::record_id_string;

/// Maximum length of `[start, end)` for metrics queries (avoids unbounded table scans).
pub const METRICS_MAX_WINDOW_DAYS: i64 = 90;

#[derive(Debug, Clone, serde::Deserialize, IntoParams, ToSchema)]
#[into_params(parameter_in = Query)]
pub struct MonitoringMetricsQuery {
    /// Inclusive lower bound (UTC, RFC 3339 or `YYYY-MM-DD`).
    #[serde(deserialize_with = "deserialize_monitoring_metrics_datetime")]
    pub start: DateTime<Utc>,
    /// Inclusive upper bound (UTC, RFC 3339 or `YYYY-MM-DD`).
    #[serde(deserialize_with = "deserialize_monitoring_metrics_datetime")]
    pub end: DateTime<Utc>,
}

impl MonitoringMetricsQuery {
    pub fn validate(self) -> Result<Self, String> {
        if self.start > self.end {
            return Err("start must be on or before end".into());
        }
        let max = Duration::days(METRICS_MAX_WINDOW_DAYS);
        let requested_days = self
            .end
            .date_naive()
            .signed_duration_since(self.start.date_naive())
            + Duration::days(1);
        if requested_days > max {
            return Err(format!(
                "date range must include at most {METRICS_MAX_WINDOW_DAYS} days"
            ));
        }
        if self.end > Utc::now() {
            return Err("end must not be in the future".into());
        }
        Ok(self)
    }
}

fn deserialize_monitoring_metrics_datetime<'de, D>(
    deserializer: D,
) -> Result<DateTime<Utc>, D::Error>
where
    D: Deserializer<'de>,
{
    deserializer.deserialize_str(MonitoringMetricsDatetimeVisitor)
}

struct MonitoringMetricsDatetimeVisitor;

impl Visitor<'_> for MonitoringMetricsDatetimeVisitor {
    type Value = DateTime<Utc>;

    fn expecting(&self, f: &mut std::fmt::Formatter) -> std::fmt::Result {
        f.write_str("an RFC 3339 timestamp or YYYY-MM-DD date in UTC")
    }

    fn visit_str<E: DeError>(self, value: &str) -> Result<Self::Value, E> {
        parse_monitoring_metrics_datetime(value).map_err(E::custom)
    }
}

fn parse_monitoring_metrics_datetime(value: &str) -> Result<DateTime<Utc>, String> {
    if let Ok(dt) = DateTime::parse_from_rfc3339(value) {
        return Ok(dt.with_timezone(&Utc));
    }

    let date = NaiveDate::parse_from_str(value, "%Y-%m-%d")
        .map_err(|_| format!("invalid date or RFC 3339 timestamp: {value}"))?;
    let midnight = date
        .and_hms_opt(0, 0, 0)
        .ok_or_else(|| format!("invalid date or RFC 3339 timestamp: {value}"))?;
    Ok(DateTime::<Utc>::from_naive_utc_and_offset(midnight, Utc))
}

#[derive(Debug, serde::Deserialize, SurrealValue)]
pub struct HttpAuditRecord {
    #[serde(default)]
    pub id: Option<RecordId>,
    pub request_id: String,
    pub method: String,
    pub path: String,
    pub status_code: i64,
    pub duration_ms: i64,
    #[serde(default)]
    pub user: Option<RecordId>,
    #[serde(default)]
    pub session: Option<RecordId>,
    #[serde(default)]
    pub client_origin: Option<String>,
    #[serde(default)]
    pub client_version: Option<String>,
    pub created_at: Datetime,
}

impl HttpAuditRecord {
    pub fn into_wire(self) -> HttpAuditLog {
        let id = self.id.as_ref().map(record_id_string).unwrap_or_default();
        HttpAuditLog {
            id,
            request_id: self.request_id,
            method: self.method,
            path: self.path,
            status_code: self.status_code as i32,
            duration_ms: self.duration_ms as i32,
            user_id: self.user.as_ref().map(record_id_string),
            session_id: self.session.as_ref().map(record_id_string),
            client_origin: self.client_origin.unwrap_or_else(|| "unknown".to_string()),
            client_version: self.client_version,
            created_at: self.created_at.into(),
        }
    }
}

/// One persisted HTTP request audit row (admin monitoring API).
#[derive(Debug, Serialize, ToSchema)]
pub struct HttpAuditLog {
    pub id: String,
    pub request_id: String,
    pub method: String,
    pub path: String,
    pub status_code: i32,
    pub duration_ms: i32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub user_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub session_id: Option<String>,
    pub client_origin: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub client_version: Option<String>,
    pub created_at: DateTime<Utc>,
}

// --- Metrics bundle (GET /monitoring/metrics) ---

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema, PartialEq)]
pub struct MonitoringMetricsDay {
    pub date: NaiveDate,
    pub daily: MonitoringMetricWindow,
    pub weekly: MonitoringMetricWindow,
    pub monthly: MonitoringMetricWindow,
}

#[derive(Debug, Clone, Serialize, Deserialize, SurrealValue, ToSchema, PartialEq)]
pub struct MonitoringMetricWindow {
    pub users: MonitoringUserMetrics,
    pub requests: MonitoringRequestMetrics,
}

#[derive(Debug, Clone, Serialize, Deserialize, SurrealValue, ToSchema, PartialEq)]
pub struct MonitoringUserMetrics {
    pub active: u64,
    pub new: u64,
    pub returning_users: u64,
    pub retained: u64,
    pub churned: u64,
    pub net_growth: i64,
    pub retention_rate: f64,
    pub churn_rate: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, SurrealValue, ToSchema, PartialEq)]
pub struct MonitoringRequestMetrics {
    pub total: u64,
    pub successful: u64,
    pub failed: u64,
    pub client_error: u64,
    pub server_error: u64,
    pub error_rate: f64,
    pub duration: MonitoringDurationMetrics,
    pub avg_per_user: f64,
    pub median_per_user: f64,
    pub p95_per_user: f64,
    pub max_per_user: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, SurrealValue, ToSchema, PartialEq)]
pub struct MonitoringDurationMetrics {
    pub avg: f64,
    pub min: f64,
    pub max: f64,
    pub p95: f64,
    pub p99: f64,
    pub avg_success: f64,
    pub avg_failure: f64,
}
