use std::collections::{HashMap, HashSet};

use chrono::{DateTime, Duration, NaiveDate, Utc};
use serde::Deserialize;
use surrealdb::types::{Datetime, RecordId, SurrealValue};

use crate::database::{Database, record_id_string};
use crate::error::AppError;

use super::model::{
    MonitoringDurationMetrics, MonitoringMetricWindow, MonitoringMetricsDay,
    MonitoringMetricsQuery, MonitoringRequestMetrics, MonitoringUserMetrics,
};

pub struct MonitoringMetricsService;

#[derive(Debug, Deserialize, SurrealValue)]
struct MetricsCacheRow {
    date: String,
    daily: MonitoringMetricWindow,
    weekly: MonitoringMetricWindow,
    monthly: MonitoringMetricWindow,
}

#[derive(Debug, Deserialize, SurrealValue)]
struct CachedDateRow {
    date: String,
}

#[derive(Debug, Deserialize, SurrealValue)]
struct AuditMetricRow {
    #[serde(default)]
    user: Option<RecordId>,
    status_code: i64,
    duration_ms: i64,
}

#[derive(Debug, Deserialize, SurrealValue)]
struct UserAuditRow {
    user: RecordId,
    created_at: Datetime,
}

impl MonitoringMetricsService {
    pub async fn get_range(
        db: &Database,
        query: MonitoringMetricsQuery,
    ) -> Result<Vec<MonitoringMetricsDay>, AppError> {
        let query = query.validate().map_err(AppError::invalid_request)?;
        let today = Utc::now().date_naive();
        let yesterday = today - Duration::days(1);

        if query.start <= yesterday {
            Self::fill_completed_cache(db, query.start, yesterday).await?;
            let cached = Self::read_cached_range(db, query.start, query.end.min(yesterday)).await?;
            Self::fill_missing_completed_days(db, query.start, query.end.min(yesterday), &cached)
                .await?;
        }

        let mut out = if query.start <= yesterday {
            Self::read_cached_range(db, query.start, query.end.min(yesterday)).await?
        } else {
            Vec::new()
        };

        if query.end >= today {
            out.push(Self::compute_day(db, today).await?);
        }

        out.sort_by_key(|day| day.date);
        Ok(out)
    }

    async fn fill_completed_cache(
        db: &Database,
        request_start: NaiveDate,
        yesterday: NaiveDate,
    ) -> Result<(), AppError> {
        let fill_start = match Self::newest_cached_date(db).await? {
            Some(date) => date + Duration::days(1),
            None => request_start,
        };
        if fill_start > yesterday {
            return Ok(());
        }
        Self::compute_and_upsert_range(db, fill_start, yesterday).await
    }

    async fn fill_missing_completed_days(
        db: &Database,
        start: NaiveDate,
        end: NaiveDate,
        cached: &[MonitoringMetricsDay],
    ) -> Result<(), AppError> {
        if start > end {
            return Ok(());
        }
        let present: HashSet<NaiveDate> = cached.iter().map(|day| day.date).collect();
        let mut day = start;
        while day <= end {
            if !present.contains(&day) {
                Self::upsert_day(db, &Self::compute_day(db, day).await?).await?;
            }
            day += Duration::days(1);
        }
        Ok(())
    }

    async fn compute_and_upsert_range(
        db: &Database,
        start: NaiveDate,
        end: NaiveDate,
    ) -> Result<(), AppError> {
        let mut day = start;
        while day <= end {
            let metrics = Self::compute_day(db, day).await?;
            Self::upsert_day(db, &metrics).await?;
            day += Duration::days(1);
        }
        Ok(())
    }

    async fn newest_cached_date(db: &Database) -> Result<Option<NaiveDate>, AppError> {
        let mut response = db
            .db
            .query("SELECT date FROM metrics ORDER BY date DESC LIMIT 1")
            .await
            .map_err(|e| surreal_query_err("metrics.cache.newest", e))?;
        let rows: Vec<CachedDateRow> = response
            .take(0)
            .map_err(|e| surreal_query_err("metrics.cache.newest.take", e))?;
        rows.into_iter()
            .next()
            .map(|row| parse_cache_date(&row.date))
            .transpose()
    }

    async fn read_cached_range(
        db: &Database,
        start: NaiveDate,
        end: NaiveDate,
    ) -> Result<Vec<MonitoringMetricsDay>, AppError> {
        if start > end {
            return Ok(Vec::new());
        }
        let mut response = db
            .db
            .query(
                "SELECT date, daily, weekly, monthly FROM metrics \
                 WHERE date >= $start AND date <= $end ORDER BY date ASC",
            )
            .bind(("start", format_date(start)))
            .bind(("end", format_date(end)))
            .await
            .map_err(|e| surreal_query_err("metrics.cache.read", e))?;
        let rows: Vec<MetricsCacheRow> = response
            .take(0)
            .map_err(|e| surreal_query_err("metrics.cache.read.take", e))?;
        rows.into_iter()
            .map(|row| {
                Ok(MonitoringMetricsDay {
                    date: parse_cache_date(&row.date)?,
                    daily: row.daily,
                    weekly: row.weekly,
                    monthly: row.monthly,
                })
            })
            .collect()
    }

    async fn upsert_day(db: &Database, metrics: &MonitoringMetricsDay) -> Result<(), AppError> {
        let date = format_date(metrics.date);
        let response = db
            .db
            .query(
                "LET $thing = type::record('metrics', $date);
                 UPSERT $thing SET date = $date, daily = $daily, weekly = $weekly, monthly = $monthly, updated_at = time::now();",
            )
            .bind(("date", date))
            .bind(("daily", metrics.daily.clone()))
            .bind(("weekly", metrics.weekly.clone()))
            .bind(("monthly", metrics.monthly.clone()))
            .await
            .map_err(|e| surreal_query_err("metrics.cache.upsert", e))?;
        response
            .check()
            .map_err(|e| surreal_query_err("metrics.cache.upsert.check", e))?;
        Ok(())
    }

    async fn compute_day(db: &Database, date: NaiveDate) -> Result<MonitoringMetricsDay, AppError> {
        Ok(MonitoringMetricsDay {
            date,
            daily: Self::compute_window(db, date, 1).await?,
            weekly: Self::compute_window(db, date, 7).await?,
            monthly: Self::compute_window(db, date, 30).await?,
        })
    }

    async fn compute_window(
        db: &Database,
        date: NaiveDate,
        window_days: i64,
    ) -> Result<MonitoringMetricWindow, AppError> {
        let current_start = date - Duration::days(window_days - 1);
        let current_end = date + Duration::days(1);
        let previous_start = date - Duration::days((window_days * 2) - 1);
        let previous_end = current_start;

        let current_rows = Self::audit_rows(db, current_start, current_end).await?;
        let previous_rows = Self::audit_rows(db, previous_start, previous_end).await?;

        let active_users = users_from_rows(&current_rows);
        let previous_users = users_from_rows(&previous_rows);
        let first_seen = Self::first_seen_for_users(db, &active_users).await?;

        let new_users = active_users
            .iter()
            .filter(|user| {
                first_seen
                    .get(*user)
                    .map(|first| *first >= current_start && *first < current_end)
                    .unwrap_or(false)
            })
            .count() as u64;
        let active = active_users.len() as u64;
        let previous_active = previous_users.len() as u64;
        let retained = active_users.intersection(&previous_users).count() as u64;
        let churned = previous_users.difference(&active_users).count() as u64;

        Ok(MonitoringMetricWindow {
            users: MonitoringUserMetrics {
                active,
                new: new_users,
                returning_users: active.saturating_sub(new_users),
                retained,
                churned,
                net_growth: new_users as i64 - churned as i64,
                retention_rate: ratio(retained, previous_active),
                churn_rate: ratio(churned, previous_active),
            },
            requests: request_metrics(&current_rows),
        })
    }

    async fn audit_rows(
        db: &Database,
        start: NaiveDate,
        end: NaiveDate,
    ) -> Result<Vec<AuditMetricRow>, AppError> {
        let start = Datetime::from(day_start(start));
        let end = Datetime::from(day_start(end));
        let mut response = db
            .db
            .query(
                "SELECT user, status_code, duration_ms FROM http_request_audit \
                 WHERE created_at >= $start AND created_at < $end",
            )
            .bind(("start", start))
            .bind(("end", end))
            .await
            .map_err(|e| surreal_query_err("metrics.window.audit", e))?;
        response
            .take(0)
            .map_err(|e| surreal_query_err("metrics.window.audit.take", e))
    }

    async fn first_seen_for_users(
        db: &Database,
        users: &HashSet<String>,
    ) -> Result<HashMap<String, NaiveDate>, AppError> {
        if users.is_empty() {
            return Ok(HashMap::new());
        }
        let user_records = users
            .iter()
            .map(|user| RecordId::new("user", user.clone()))
            .collect::<Vec<_>>();
        let mut response = db
            .db
            .query(
                "SELECT user, created_at FROM http_request_audit \
                 WHERE user IN $users ORDER BY created_at ASC",
            )
            .bind(("users", user_records))
            .await
            .map_err(|e| surreal_query_err("metrics.window.first_seen", e))?;
        let rows: Vec<UserAuditRow> = response
            .take(0)
            .map_err(|e| surreal_query_err("metrics.window.first_seen.take", e))?;
        let mut out = HashMap::new();
        for row in rows {
            let created_at: DateTime<Utc> = row.created_at.into();
            out.entry(record_id_string(&row.user))
                .or_insert_with(|| created_at.date_naive());
        }
        Ok(out)
    }
}

fn users_from_rows(rows: &[AuditMetricRow]) -> HashSet<String> {
    rows.iter()
        .filter_map(|row| row.user.as_ref().map(record_id_string))
        .collect()
}

fn request_metrics(rows: &[AuditMetricRow]) -> MonitoringRequestMetrics {
    let total = rows.len() as u64;
    let successful = rows
        .iter()
        .filter(|row| (200..=399).contains(&row.status_code))
        .count() as u64;
    let failed = rows.iter().filter(|row| row.status_code >= 400).count() as u64;
    let client_error = rows
        .iter()
        .filter(|row| (400..=499).contains(&row.status_code))
        .count() as u64;
    let server_error = rows.iter().filter(|row| row.status_code >= 500).count() as u64;

    let durations = rows.iter().map(|row| row.duration_ms).collect::<Vec<_>>();
    let success_durations = rows
        .iter()
        .filter(|row| (200..=399).contains(&row.status_code))
        .map(|row| row.duration_ms)
        .collect::<Vec<_>>();
    let failure_durations = rows
        .iter()
        .filter(|row| row.status_code >= 400)
        .map(|row| row.duration_ms)
        .collect::<Vec<_>>();

    let mut per_user: HashMap<String, u64> = HashMap::new();
    for row in rows {
        if let Some(user) = &row.user {
            *per_user.entry(record_id_string(user)).or_insert(0) += 1;
        }
    }
    let user_counts = per_user.values().copied().collect::<Vec<_>>();

    MonitoringRequestMetrics {
        total,
        successful,
        failed,
        client_error,
        server_error,
        error_rate: ratio(failed, total),
        duration: MonitoringDurationMetrics {
            avg: avg_i64(&durations),
            min: durations.iter().min().copied().unwrap_or(0) as f64,
            max: durations.iter().max().copied().unwrap_or(0) as f64,
            p95: percentile_i64(&durations, 0.95),
            p99: percentile_i64(&durations, 0.99),
            avg_success: avg_i64(&success_durations),
            avg_failure: avg_i64(&failure_durations),
        },
        avg_per_user: avg_u64(&user_counts),
        median_per_user: median_u64(&user_counts),
        p95_per_user: percentile_u64(&user_counts, 0.95),
        max_per_user: user_counts.into_iter().max().unwrap_or(0),
    }
}

fn day_start(date: NaiveDate) -> DateTime<Utc> {
    date.and_hms_opt(0, 0, 0)
        .map(|t| DateTime::<Utc>::from_naive_utc_and_offset(t, Utc))
        .expect("valid midnight")
}

fn format_date(date: NaiveDate) -> String {
    date.format("%Y-%m-%d").to_string()
}

fn parse_cache_date(s: &str) -> Result<NaiveDate, AppError> {
    NaiveDate::parse_from_str(s, "%Y-%m-%d")
        .map_err(|e| AppError::database(format!("invalid cached metrics date '{s}': {e}")))
}

fn ratio(num: u64, den: u64) -> f64 {
    if den == 0 {
        0.0
    } else {
        num as f64 / den as f64
    }
}

fn avg_i64(values: &[i64]) -> f64 {
    if values.is_empty() {
        0.0
    } else {
        values.iter().sum::<i64>() as f64 / values.len() as f64
    }
}

fn avg_u64(values: &[u64]) -> f64 {
    if values.is_empty() {
        0.0
    } else {
        values.iter().sum::<u64>() as f64 / values.len() as f64
    }
}

fn percentile_i64(values: &[i64], percentile: f64) -> f64 {
    let values = values.iter().map(|v| *v as f64).collect::<Vec<_>>();
    percentile_f64(values, percentile)
}

fn percentile_u64(values: &[u64], percentile: f64) -> f64 {
    let values = values.iter().map(|v| *v as f64).collect::<Vec<_>>();
    percentile_f64(values, percentile)
}

fn median_u64(values: &[u64]) -> f64 {
    if values.is_empty() {
        return 0.0;
    }
    let mut values = values.iter().map(|v| *v as f64).collect::<Vec<_>>();
    values.sort_by(|a, b| a.total_cmp(b));
    let mid = values.len() / 2;
    if values.len().is_multiple_of(2) {
        (values[mid - 1] + values[mid]) / 2.0
    } else {
        values[mid]
    }
}

fn percentile_f64(mut values: Vec<f64>, percentile: f64) -> f64 {
    if values.is_empty() {
        return 0.0;
    }
    values.sort_by(|a, b| a.total_cmp(b));
    let rank = ((values.len() as f64) * percentile).ceil() as usize;
    values[rank.saturating_sub(1).min(values.len() - 1)]
}

fn surreal_query_err(ctx: &'static str, err: surrealdb::Error) -> AppError {
    crate::observability::log_error_chain(ctx, &err);
    AppError::database(err.to_string())
}
