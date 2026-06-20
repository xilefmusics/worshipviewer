use std::collections::{BTreeMap, HashMap, HashSet};

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

const METRICS_MONTH_WINDOW_DAYS: i64 = 30;
const METRICS_SUMMARY_VERSION: i64 = 1;

#[derive(Debug, Deserialize, SurrealValue)]
struct MetricsCacheRow {
    date: String,
    daily: MonitoringMetricWindow,
    weekly: MonitoringMetricWindow,
    monthly: MonitoringMetricWindow,
}

#[derive(Debug, Deserialize, SurrealValue)]
struct AuditMetricRow {
    #[serde(default)]
    user: Option<RecordId>,
    status_code: i64,
    duration_ms: i64,
    created_at: Datetime,
}

#[derive(Debug, Deserialize, SurrealValue)]
struct UserAuditRow {
    user: RecordId,
    created_at: Datetime,
}

#[derive(Debug, Deserialize, SurrealValue)]
struct SummaryStateRow {
    complete_from_date: String,
    version: i64,
}

#[derive(Debug, Deserialize, SurrealValue)]
struct RequestSummaryRow {
    date: String,
    total: i64,
    successful: i64,
    failed: i64,
    client_error: i64,
    server_error: i64,
    duration_sum: i64,
    success_duration_sum: i64,
    success_duration_count: i64,
    failure_duration_sum: i64,
    failure_duration_count: i64,
    complete: bool,
    #[serde(default)]
    backfilled: bool,
    version: i64,
}

#[derive(Debug, Deserialize, SurrealValue)]
struct RequestSummaryStateRow {
    date: String,
    complete: bool,
    #[serde(default)]
    backfilled: bool,
    version: i64,
}

#[derive(Debug, Deserialize, SurrealValue)]
struct DurationSummaryRow {
    date: String,
    duration_ms: i64,
    count: i64,
}

#[derive(Debug, Deserialize, SurrealValue)]
struct UserSummaryRow {
    date: String,
    user_key: String,
    request_count: i64,
}

#[derive(Debug, Deserialize, SurrealValue)]
struct FirstSeenSummaryRow {
    user_key: String,
    first_seen_date: String,
}

#[derive(Debug, Clone, Default)]
struct RequestTotals {
    total: u64,
    successful: u64,
    failed: u64,
    client_error: u64,
    server_error: u64,
    duration_sum: i64,
    success_duration_sum: i64,
    success_duration_count: u64,
    failure_duration_sum: i64,
    failure_duration_count: u64,
}

#[derive(Debug, Clone, Default)]
struct SupportDay {
    request: RequestTotals,
    duration_counts: BTreeMap<i64, u64>,
    user_counts: BTreeMap<String, u64>,
}

#[derive(Debug, Default)]
struct SupportData {
    days: BTreeMap<NaiveDate, SupportDay>,
}

impl MonitoringMetricsService {
    pub async fn get_range(
        db: &Database,
        query: MonitoringMetricsQuery,
    ) -> Result<Vec<MonitoringMetricsDay>, AppError> {
        let query = query.validate().map_err(AppError::invalid_request)?;
        let start_date = query.start.date_naive();
        let end_date = query.end.date_naive();
        let today = Utc::now().date_naive();
        let yesterday = today - Duration::days(1);

        let completed_end = end_date.min(yesterday);
        let completed_cached = if start_date <= completed_end {
            Self::read_cached_range(db, start_date, completed_end).await?
        } else {
            Vec::new()
        };
        let cached_completed_days: HashSet<NaiveDate> =
            completed_cached.iter().map(|day| day.date).collect();
        let mut missing_compute_days = inclusive_days(start_date, completed_end)
            .filter(|day| !cached_completed_days.contains(day))
            .collect::<Vec<_>>();
        if end_date >= today {
            missing_compute_days.push(today);
        }
        missing_compute_days.sort_unstable();
        missing_compute_days.dedup();

        let mut computed_days = Vec::new();
        if !missing_compute_days.is_empty() {
            let support_start = shift_date(
                *missing_compute_days
                    .first()
                    .expect("non-empty compute day set"),
                -(METRICS_MONTH_WINDOW_DAYS * 2 - 1),
            )?;
            let support_end = *missing_compute_days
                .last()
                .expect("non-empty compute day set");
            let support = Self::load_support_data(db, support_start, support_end, today).await?;

            let first_seen =
                Self::first_seen_for_support_users(db, &support, support_start).await?;

            for day in &missing_compute_days {
                computed_days.push(Self::compute_day_from_support(&support, *day, &first_seen));
            }

            Self::upsert_missing_completed_days(
                db,
                &completed_cached,
                &computed_days,
                start_date,
                completed_end,
            )
            .await?;
        }

        let mut out = merge_days(start_date, completed_end, &completed_cached, &computed_days);
        if end_date >= today
            && let Some(today_day) = computed_days.iter().find(|day| day.date == today)
        {
            out.push(today_day.clone());
        }

        out.sort_by_key(|day| day.date);
        Ok(out)
    }

    async fn upsert_missing_completed_days(
        db: &Database,
        cached: &[MonitoringMetricsDay],
        computed: &[MonitoringMetricsDay],
        start: NaiveDate,
        end: NaiveDate,
    ) -> Result<(), AppError> {
        if start > end {
            return Ok(());
        }
        let present: HashSet<NaiveDate> = cached.iter().map(|day| day.date).collect();
        let computed_by_date: HashMap<NaiveDate, &MonitoringMetricsDay> =
            computed.iter().map(|day| (day.date, day)).collect();
        for day in inclusive_days(start, end) {
            if !present.contains(&day)
                && let Some(metrics) = computed_by_date.get(&day)
            {
                Self::upsert_day(db, metrics).await?;
            }
        }
        Ok(())
    }

    async fn load_support_data(
        db: &Database,
        start: NaiveDate,
        end: NaiveDate,
        today: NaiveDate,
    ) -> Result<SupportData, AppError> {
        let mut data = SupportData::default();
        let summary_state = Self::load_summary_state(db).await?;
        for day in inclusive_days(start, end) {
            data.days.entry(day).or_default();
        }

        let completed_end = end.min(today - Duration::days(1));
        if start <= completed_end {
            Self::ensure_completed_support_days(db, start, completed_end, summary_state.as_ref())
                .await?;
            Self::load_completed_support_rows(
                db,
                start,
                completed_end,
                summary_state.as_ref(),
                &mut data,
            )
            .await?;
        }

        if end >= today {
            Self::load_today_support_day(db, today, summary_state.as_ref(), &mut data).await?;
        }
        Ok(data)
    }

    async fn load_summary_state(db: &Database) -> Result<Option<SummaryStateRow>, AppError> {
        let mut response = db
            .db
            .query("SELECT complete_from_date, version FROM metrics_summary_state LIMIT 1")
            .await
            .map_err(|e| surreal_query_err("metrics.summary_state.read", e))?;
        let row: Option<SummaryStateRow> = response
            .take(0)
            .map_err(|e| surreal_query_err("metrics.summary_state.read.take", e))?;
        Ok(row)
    }

    async fn ensure_completed_support_days(
        db: &Database,
        start: NaiveDate,
        end: NaiveDate,
        summary_state: Option<&SummaryStateRow>,
    ) -> Result<(), AppError> {
        if start > end {
            return Ok(());
        }
        let mut response = db
            .db
            .query(
                "SELECT date, complete, (backfilled ?? false) AS backfilled, version FROM metrics_request_day \
                 WHERE date >= $start AND date <= $end ORDER BY date ASC",
            )
            .bind(("start", format_date(start)))
            .bind(("end", format_date(end)))
            .await
            .map_err(|e| surreal_query_err("metrics.summary.scan", e))?;
        let rows: Vec<RequestSummaryStateRow> = response
            .take(0)
            .map_err(|e| surreal_query_err("metrics.summary.scan.take", e))?;

        let summary_coverage_start = summary_state
            .filter(|state| state.version == METRICS_SUMMARY_VERSION)
            .and_then(|state| parse_cache_date(&state.complete_from_date).ok());

        let present: HashSet<NaiveDate> = rows
            .into_iter()
            .filter_map(|row| {
                let day = parse_cache_date(&row.date).ok()?;
                let trusted = row.complete
                    && row.version == METRICS_SUMMARY_VERSION
                    && (row.backfilled
                        || summary_coverage_start
                            .map(|coverage_start| day >= coverage_start)
                            .unwrap_or(false));
                trusted.then_some(day)
            })
            .collect();

        let missing = inclusive_days(start, end)
            .filter(|day| !present.contains(day))
            .collect::<Vec<_>>();
        if missing.is_empty() {
            return Ok(());
        }

        let mut spans = Vec::new();
        let mut span_start = missing[0];
        let mut span_prev = missing[0];
        for day in missing.into_iter().skip(1) {
            if day == span_prev + Duration::days(1) {
                span_prev = day;
                continue;
            }
            spans.push((span_start, span_prev));
            span_start = day;
            span_prev = day;
        }
        spans.push((span_start, span_prev));

        for (span_start, span_end) in spans {
            if let Err(err) = Self::backfill_support_span(db, span_start, span_end).await {
                tracing::warn!(
                    target = "backend::observability",
                    error = %err,
                    start = %format_date(span_start),
                    end = %format_date(span_end),
                    "metrics summary backfill failed; continuing with raw audit fallback"
                );
            }
        }

        Ok(())
    }

    async fn backfill_support_span(
        db: &Database,
        start: NaiveDate,
        end: NaiveDate,
    ) -> Result<(), AppError> {
        let mut by_day: BTreeMap<NaiveDate, SupportDay> = BTreeMap::new();
        let mut users: HashSet<String> = HashSet::new();
        for day in inclusive_days(start, end) {
            by_day.entry(day).or_default();
        }
        for (chunk_start, chunk_end) in inclusive_chunks(start, end, 7) {
            let rows = Self::audit_rows_for_range(db, chunk_start, chunk_end).await?;
            for row in rows {
                let created_at: DateTime<Utc> = row.created_at.into();
                let day = created_at.date_naive();
                let day_support = by_day.entry(day).or_default();
                Self::accumulate_raw_row(day_support, &row);
                if let Some(user) = row.user.as_ref() {
                    users.insert(record_id_string(user));
                }
            }
        }

        let first_seen = Self::raw_first_seen_for_users(db, &users).await?;
        if !first_seen.is_empty() {
            Self::upsert_first_seen_rows(db, &first_seen).await?;
        }

        let tx = Self::build_support_backfill_sql(start, end, &by_day);
        let response = db
            .db
            .query(tx)
            .await
            .map_err(|e| surreal_query_err("metrics.summary.backfill", e))?;
        response
            .check()
            .map_err(|e| surreal_query_err("metrics.summary.backfill.check", e))?;
        Self::upsert_support_user_rows(db, start, end, &by_day).await?;
        Ok(())
    }

    async fn upsert_support_user_rows(
        db: &Database,
        start: NaiveDate,
        end: NaiveDate,
        by_day: &BTreeMap<NaiveDate, SupportDay>,
    ) -> Result<(), AppError> {
        let mut sql = String::new();
        sql.push_str("BEGIN TRANSACTION;\n");
        for day in inclusive_days(start, end) {
            let support = by_day.get(&day).cloned().unwrap_or_default();
            let date = format_date(day);
            for (user_key, count) in support.user_counts {
                let user_thing = record_expr("metrics_user_day", &format!("{date}__{user_key}"));
                sql.push_str(&format!(
                    "UPSERT {user_thing} SET date = {}, user_key = {}, request_count = {};\n",
                    sql_string(&date),
                    sql_string(&user_key),
                    count,
                ));
            }
        }
        sql.push_str("COMMIT TRANSACTION;");
        let response = db
            .db
            .query(sql)
            .await
            .map_err(|e| surreal_query_err("metrics.summary.backfill.users", e))?;
        response
            .check()
            .map_err(|e| surreal_query_err("metrics.summary.backfill.users.check", e))?;
        Ok(())
    }

    fn build_support_backfill_sql(
        start: NaiveDate,
        end: NaiveDate,
        by_day: &BTreeMap<NaiveDate, SupportDay>,
    ) -> String {
        let mut sql = String::new();
        sql.push_str("BEGIN TRANSACTION;\n");
        sql.push_str(&format!(
            "DELETE metrics_duration_day WHERE date >= {} AND date <= {};\n",
            sql_string(&format_date(start)),
            sql_string(&format_date(end))
        ));
        sql.push_str(&format!(
            "DELETE metrics_user_day WHERE date >= {} AND date <= {};\n",
            sql_string(&format_date(start)),
            sql_string(&format_date(end))
        ));

        for day in inclusive_days(start, end) {
            let support = by_day.get(&day).cloned().unwrap_or_default();
            let date = format_date(day);
            let day_thing = record_expr("metrics_request_day", &date);
            sql.push_str(&format!(
                "UPSERT {day_thing} SET date = {}, total = {}, successful = {}, failed = {}, client_error = {}, server_error = {}, duration_sum = {}, success_duration_sum = {}, success_duration_count = {}, failure_duration_sum = {}, failure_duration_count = {}, complete = true, backfilled = true, version = {}, updated_at = time::now();\n",
                sql_string(&date),
                support.request.total,
                support.request.successful,
                support.request.failed,
                support.request.client_error,
                support.request.server_error,
                support.request.duration_sum,
                support.request.success_duration_sum,
                support.request.success_duration_count,
                support.request.failure_duration_sum,
                support.request.failure_duration_count,
                METRICS_SUMMARY_VERSION,
            ));

            for (duration_ms, count) in support.duration_counts {
                let duration_thing =
                    record_expr("metrics_duration_day", &format!("{date}__{duration_ms}"));
                sql.push_str(&format!(
                    "UPSERT {duration_thing} SET date = {}, duration_ms = {}, count = {};\n",
                    sql_string(&date),
                    duration_ms,
                    count,
                ));
            }

            for (user_key, count) in support.user_counts {
                let user_thing = record_expr("metrics_user_day", &format!("{date}__{user_key}"));
                sql.push_str(&format!(
                    "UPSERT {user_thing} SET date = {}, user_key = {}, request_count = {};\n",
                    sql_string(&date),
                    sql_string(&user_key),
                    count,
                ));
            }
        }

        sql.push_str("COMMIT TRANSACTION;");
        sql
    }

    async fn load_completed_support_rows(
        db: &Database,
        start: NaiveDate,
        end: NaiveDate,
        summary_state: Option<&SummaryStateRow>,
        data: &mut SupportData,
    ) -> Result<(), AppError> {
        let summary_coverage_start = summary_state
            .filter(|state| state.version == METRICS_SUMMARY_VERSION)
            .and_then(|state| parse_cache_date(&state.complete_from_date).ok());
        let mut response = db
            .db
            .query(
                "SELECT date, total, successful, failed, client_error, server_error, \
                 duration_sum, success_duration_sum, success_duration_count, \
                 failure_duration_sum, failure_duration_count, complete, (backfilled ?? false) AS backfilled, version \
                 FROM metrics_request_day WHERE date >= $start AND date <= $end ORDER BY date ASC",
            )
            .bind(("start", format_date(start)))
            .bind(("end", format_date(end)))
            .await
            .map_err(|e| surreal_query_err("metrics.summary.request.read", e))?;
        let request_rows: Vec<RequestSummaryRow> = response
            .take(0)
            .map_err(|e| surreal_query_err("metrics.summary.request.read.take", e))?;
        let mut raw_fallback_days: HashSet<NaiveDate> = HashSet::new();
        let mut trusted_days: HashSet<NaiveDate> = HashSet::new();
        for row in request_rows {
            if let Ok(day) = parse_cache_date(&row.date) {
                let trusted = row.complete
                    && row.version == METRICS_SUMMARY_VERSION
                    && (row.backfilled
                        || summary_coverage_start
                            .map(|coverage_start| day >= coverage_start)
                            .unwrap_or(false));
                if trusted {
                    trusted_days.insert(day);
                    if let Some(support) = data.days.get_mut(&day) {
                        support.request = RequestTotals {
                            total: row.total.max(0) as u64,
                            successful: row.successful.max(0) as u64,
                            failed: row.failed.max(0) as u64,
                            client_error: row.client_error.max(0) as u64,
                            server_error: row.server_error.max(0) as u64,
                            duration_sum: row.duration_sum,
                            success_duration_sum: row.success_duration_sum,
                            success_duration_count: row.success_duration_count.max(0) as u64,
                            failure_duration_sum: row.failure_duration_sum,
                            failure_duration_count: row.failure_duration_count.max(0) as u64,
                        };
                    }
                } else {
                    raw_fallback_days.insert(day);
                }
            }
        }

        for day in inclusive_days(start, end) {
            if !trusted_days.contains(&day) {
                raw_fallback_days.insert(day);
            }
        }

        for day in raw_fallback_days {
            let rows = Self::audit_rows_for_day(db, day).await?;
            let support = data.days.entry(day).or_default();
            *support = SupportDay::default();
            for row in rows {
                Self::accumulate_raw_row(support, &row);
            }
        }

        let mut response = db
            .db
            .query(
                "SELECT date, duration_ms, count FROM metrics_duration_day \
                 WHERE date >= $start AND date <= $end ORDER BY date ASC, duration_ms ASC",
            )
            .bind(("start", format_date(start)))
            .bind(("end", format_date(end)))
            .await
            .map_err(|e| surreal_query_err("metrics.summary.duration.read", e))?;
        let duration_rows: Vec<DurationSummaryRow> = response
            .take(0)
            .map_err(|e| surreal_query_err("metrics.summary.duration.read.take", e))?;
        for row in duration_rows {
            if let Ok(day) = parse_cache_date(&row.date)
                && let Some(support) = data.days.get_mut(&day)
            {
                support
                    .duration_counts
                    .insert(row.duration_ms, row.count.max(0) as u64);
            }
        }

        let mut response = db
            .db
            .query(
                "SELECT date, user_key, request_count FROM metrics_user_day \
                 WHERE date >= $start AND date <= $end ORDER BY date ASC, user_key ASC",
            )
            .bind(("start", format_date(start)))
            .bind(("end", format_date(end)))
            .await
            .map_err(|e| surreal_query_err("metrics.summary.user.read", e))?;
        let user_rows: Vec<UserSummaryRow> = response
            .take(0)
            .map_err(|e| surreal_query_err("metrics.summary.user.read.take", e))?;
        for row in user_rows {
            if let Ok(day) = parse_cache_date(&row.date)
                && let Some(support) = data.days.get_mut(&day)
            {
                support
                    .user_counts
                    .insert(row.user_key, row.request_count.max(0) as u64);
            }
        }

        for day in inclusive_days(start, end) {
            let needs_retry = data
                .days
                .get(&day)
                .map(|support| {
                    support.request.total > 0
                        && (support.user_counts.is_empty() || support.duration_counts.is_empty())
                })
                .unwrap_or(false);
            if needs_retry {
                Self::load_completed_support_day_exact(db, day, data).await?;
            }
        }

        for day in inclusive_days(start, end) {
            let needs_raw_fallback = data
                .days
                .get(&day)
                .map(|support| {
                    support.request.total > 0
                        && (support.user_counts.is_empty() || support.duration_counts.is_empty())
                })
                .unwrap_or(false);
            if needs_raw_fallback {
                let rows = Self::audit_rows_for_day(db, day).await?;
                let support = data.days.entry(day).or_default();
                *support = SupportDay::default();
                for row in rows {
                    Self::accumulate_raw_row(support, &row);
                }
            }
        }

        Ok(())
    }

    async fn load_completed_support_day_exact(
        db: &Database,
        day: NaiveDate,
        data: &mut SupportData,
    ) -> Result<(), AppError> {
        let date = format_date(day);

        let mut response = db
            .db
            .query(
                "SELECT date, duration_ms, count FROM metrics_duration_day \
                 WHERE date = $date ORDER BY duration_ms ASC",
            )
            .bind(("date", date.clone()))
            .await
            .map_err(|e| surreal_query_err("metrics.summary.duration.retry", e))?;
        let duration_rows: Vec<DurationSummaryRow> = response
            .take(0)
            .map_err(|e| surreal_query_err("metrics.summary.duration.retry.take", e))?;
        if let Some(support) = data.days.get_mut(&day) {
            for row in duration_rows {
                support
                    .duration_counts
                    .insert(row.duration_ms, row.count.max(0) as u64);
            }
        }

        let mut response = db
            .db
            .query(
                "SELECT date, user_key, request_count FROM metrics_user_day \
                 WHERE date = $date ORDER BY user_key ASC",
            )
            .bind(("date", date))
            .await
            .map_err(|e| surreal_query_err("metrics.summary.user.retry", e))?;
        let user_rows: Vec<UserSummaryRow> = response
            .take(0)
            .map_err(|e| surreal_query_err("metrics.summary.user.retry.take", e))?;
        if let Some(support) = data.days.get_mut(&day) {
            for row in user_rows {
                support
                    .user_counts
                    .insert(row.user_key, row.request_count.max(0) as u64);
            }
        }

        Ok(())
    }

    async fn load_today_support_day(
        db: &Database,
        today: NaiveDate,
        summary_state: Option<&SummaryStateRow>,
        data: &mut SupportData,
    ) -> Result<(), AppError> {
        let mut response = db
            .db
            .query(
                "SELECT date, total, successful, failed, client_error, server_error, \
                 duration_sum, success_duration_sum, success_duration_count, \
                 failure_duration_sum, failure_duration_count, complete, version \
                 FROM metrics_request_day WHERE date = $date LIMIT 1",
            )
            .bind(("date", format_date(today)))
            .await
            .map_err(|e| surreal_query_err("metrics.summary.today.read", e))?;
        let row: Option<RequestSummaryRow> = response
            .take(0)
            .map_err(|e| surreal_query_err("metrics.summary.today.read.take", e))?;
        let trusted = row
            .as_ref()
            .map(|row| row.complete && row.version == METRICS_SUMMARY_VERSION)
            .unwrap_or(false)
            && summary_state
                .and_then(|state| parse_cache_date(&state.complete_from_date).ok())
                .map(|coverage_start| today >= coverage_start)
                .unwrap_or(false)
            && summary_state
                .map(|state| state.version == METRICS_SUMMARY_VERSION)
                .unwrap_or(false);

        if trusted {
            let support = data.days.entry(today).or_default();
            if let Some(row) = row {
                support.request = RequestTotals {
                    total: row.total.max(0) as u64,
                    successful: row.successful.max(0) as u64,
                    failed: row.failed.max(0) as u64,
                    client_error: row.client_error.max(0) as u64,
                    server_error: row.server_error.max(0) as u64,
                    duration_sum: row.duration_sum,
                    success_duration_sum: row.success_duration_sum,
                    success_duration_count: row.success_duration_count.max(0) as u64,
                    failure_duration_sum: row.failure_duration_sum,
                    failure_duration_count: row.failure_duration_count.max(0) as u64,
                };
            }

            let mut response = db
                .db
                .query(
                    "SELECT date, duration_ms, count FROM metrics_duration_day \
                     WHERE date = $date ORDER BY duration_ms ASC",
                )
                .bind(("date", format_date(today)))
                .await
                .map_err(|e| surreal_query_err("metrics.summary.today.duration.read", e))?;
            let duration_rows: Vec<DurationSummaryRow> = response
                .take(0)
                .map_err(|e| surreal_query_err("metrics.summary.today.duration.read.take", e))?;
            for row in duration_rows {
                support
                    .duration_counts
                    .insert(row.duration_ms, row.count.max(0) as u64);
            }

            let mut response = db
                .db
                .query(
                    "SELECT date, user_key, request_count FROM metrics_user_day \
                     WHERE date = $date ORDER BY user_key ASC",
                )
                .bind(("date", format_date(today)))
                .await
                .map_err(|e| surreal_query_err("metrics.summary.today.user.read", e))?;
            let user_rows: Vec<UserSummaryRow> = response
                .take(0)
                .map_err(|e| surreal_query_err("metrics.summary.today.user.read.take", e))?;
            for row in user_rows {
                support
                    .user_counts
                    .insert(row.user_key, row.request_count.max(0) as u64);
            }
            return Ok(());
        }

        let rows = Self::audit_rows_for_day(db, today).await?;
        let support = data.days.entry(today).or_default();
        for row in rows {
            Self::accumulate_raw_row(support, &row);
        }
        Ok(())
    }

    async fn raw_first_seen_for_users(
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
                 WHERE user IN $users ORDER BY user ASC, created_at ASC",
            )
            .bind(("users", user_records))
            .await
            .map_err(|e| surreal_query_err("metrics.window.first_seen.raw", e))?;
        let rows: Vec<UserAuditRow> = response
            .take(0)
            .map_err(|e| surreal_query_err("metrics.window.first_seen.raw.take", e))?;
        let mut out = HashMap::new();
        for row in rows {
            let created_at: DateTime<Utc> = row.created_at.into();
            let key = record_id_string(&row.user);
            out.entry(key).or_insert_with(|| created_at.date_naive());
        }
        Ok(out)
    }

    async fn first_seen_for_support_users(
        db: &Database,
        support: &SupportData,
        support_start: NaiveDate,
    ) -> Result<HashMap<String, NaiveDate>, AppError> {
        let users = support
            .days
            .values()
            .flat_map(|day| day.user_counts.keys().cloned())
            .collect::<HashSet<_>>();
        if users.is_empty() {
            return Ok(HashMap::new());
        }

        let mut cached = Self::load_first_seen_rows(db, &users).await?;
        let uncertain = cached
            .iter()
            .filter(|(_, date)| **date >= support_start)
            .map(|(user, _)| user.clone())
            .collect::<HashSet<_>>();
        let missing = users
            .into_iter()
            .filter(|user| !cached.contains_key(user) || uncertain.contains(user))
            .collect::<HashSet<_>>();
        if !missing.is_empty() {
            let raw = Self::raw_first_seen_for_users(db, &missing).await?;
            if !raw.is_empty() {
                Self::upsert_first_seen_rows(db, &raw).await?;
                cached.extend(raw);
            }
        }
        Ok(cached)
    }

    async fn load_first_seen_rows(
        db: &Database,
        users: &HashSet<String>,
    ) -> Result<HashMap<String, NaiveDate>, AppError> {
        if users.is_empty() {
            return Ok(HashMap::new());
        }
        let user_keys = users.iter().cloned().collect::<Vec<_>>();
        let mut response = db
            .db
            .query(
                "SELECT user_key, first_seen_date FROM metrics_user_first_seen \
                 WHERE user_key IN $users",
            )
            .bind(("users", user_keys))
            .await
            .map_err(|e| surreal_query_err("metrics.first_seen.read", e))?;
        let rows: Vec<FirstSeenSummaryRow> = response
            .take(0)
            .map_err(|e| surreal_query_err("metrics.first_seen.read.take", e))?;
        let mut out = HashMap::with_capacity(rows.len());
        for row in rows {
            out.insert(row.user_key, parse_cache_date(&row.first_seen_date)?);
        }
        Ok(out)
    }

    async fn upsert_first_seen_rows(
        db: &Database,
        first_seen: &HashMap<String, NaiveDate>,
    ) -> Result<(), AppError> {
        if first_seen.is_empty() {
            return Ok(());
        }
        let mut sql = String::new();
        sql.push_str("BEGIN TRANSACTION;\n");
        for (user_key, date) in first_seen {
            let user_thing = record_expr("metrics_user_first_seen", user_key);
            let date = format_date(*date);
            sql.push_str(&format!(
                "UPSERT {user_thing} SET user_key = {}, first_seen_date = {};\n",
                sql_string(user_key),
                sql_string(&date)
            ));
        }
        sql.push_str("COMMIT TRANSACTION;");
        let response = db
            .db
            .query(sql)
            .await
            .map_err(|e| surreal_query_err("metrics.first_seen.upsert", e))?;
        response
            .check()
            .map_err(|e| surreal_query_err("metrics.first_seen.upsert.check", e))?;
        Ok(())
    }

    async fn upsert_day(db: &Database, metrics: &MonitoringMetricsDay) -> Result<(), AppError> {
        let date = format_date(metrics.date);
        let response = db
            .db
            .query(
                "LET $thing = type::record('metrics', $date);
                 UPSERT $thing SET date = $date, daily = $daily, weekly = $weekly, monthly = $monthly, updated_at = time::now();",
            )
            .bind(("date", date.clone()))
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

    async fn audit_rows_for_day(
        db: &Database,
        day: NaiveDate,
    ) -> Result<Vec<AuditMetricRow>, AppError> {
        let start = Datetime::from(day_start(day));
        let end = next_day_start(day)?;
        let mut response = db
            .db
            .query(
                "SELECT user, status_code, duration_ms, created_at FROM http_request_audit \
                 WHERE created_at >= $start AND created_at < $end ORDER BY created_at ASC",
            )
            .bind(("start", start))
            .bind(("end", Datetime::from(end)))
            .await
            .map_err(|e| surreal_query_err("metrics.window.audit", e))?;
        response
            .take(0)
            .map_err(|e| surreal_query_err("metrics.window.audit.take", e))
    }

    async fn audit_rows_for_range(
        db: &Database,
        start: NaiveDate,
        end: NaiveDate,
    ) -> Result<Vec<AuditMetricRow>, AppError> {
        let mut response = db
            .db
            .query(
                "SELECT user, status_code, duration_ms, created_at FROM http_request_audit \
                 WHERE created_at >= $start AND created_at < $end ORDER BY created_at ASC",
            )
            .bind(("start", Datetime::from(day_start(start))))
            .bind(("end", Datetime::from(next_day_start(end)?)))
            .await
            .map_err(|e| surreal_query_err("metrics.window.audit_range", e))?;
        response
            .take(0)
            .map_err(|e| surreal_query_err("metrics.window.audit_range.take", e))
    }

    fn accumulate_raw_row(day: &mut SupportDay, row: &AuditMetricRow) {
        day.request.total += 1;
        day.request.duration_sum += row.duration_ms;
        if (200..=399).contains(&row.status_code) {
            day.request.successful += 1;
            day.request.success_duration_sum += row.duration_ms;
            day.request.success_duration_count += 1;
        }
        if row.status_code >= 400 {
            day.request.failed += 1;
            day.request.failure_duration_sum += row.duration_ms;
            day.request.failure_duration_count += 1;
        }
        if (400..=499).contains(&row.status_code) {
            day.request.client_error += 1;
        }
        if row.status_code >= 500 {
            day.request.server_error += 1;
        }
        *day.duration_counts.entry(row.duration_ms).or_insert(0) += 1;
        if let Some(user) = row.user.as_ref() {
            *day.user_counts.entry(record_id_string(user)).or_insert(0) += 1;
        }
    }

    fn compute_day_from_support(
        support: &SupportData,
        date: NaiveDate,
        first_seen: &HashMap<String, NaiveDate>,
    ) -> MonitoringMetricsDay {
        MonitoringMetricsDay {
            date,
            daily: Self::compute_window(support, date, 1, first_seen),
            weekly: Self::compute_window(support, date, 7, first_seen),
            monthly: Self::compute_window(support, date, 30, first_seen),
        }
    }

    fn compute_window(
        support: &SupportData,
        date: NaiveDate,
        window_days: i64,
        first_seen: &HashMap<String, NaiveDate>,
    ) -> MonitoringMetricWindow {
        let current_start = date - Duration::days(window_days - 1);
        let current_end = date + Duration::days(1);
        let previous_start = date - Duration::days((window_days * 2) - 1);
        let previous_end = current_start;

        let current_days = days_in_range(&support.days, current_start, current_end);
        let previous_days = days_in_range(&support.days, previous_start, previous_end);

        let current = aggregate_support_window(&current_days);

        let current_users = users_from_support_days(&current_days);
        let previous_users = users_from_support_days(&previous_days);
        let new_users = current_users
            .iter()
            .filter(|user| {
                first_seen
                    .get(*user)
                    .map(|first| *first >= current_start && *first < current_end)
                    .unwrap_or(false)
            })
            .count() as u64;

        let active = current_users.len() as u64;
        let previous_active = previous_users.len() as u64;
        let retained = current_users.intersection(&previous_users).count() as u64;
        let churned = previous_users.difference(&current_users).count() as u64;

        let user_counts = current
            .per_user_counts
            .values()
            .copied()
            .collect::<Vec<_>>();

        MonitoringMetricWindow {
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
            requests: MonitoringRequestMetrics {
                total: current.request.total,
                successful: current.request.successful,
                failed: current.request.failed,
                client_error: current.request.client_error,
                server_error: current.request.server_error,
                error_rate: ratio(current.request.failed, current.request.total),
                duration: MonitoringDurationMetrics {
                    avg: avg_i64(current.request.duration_sum, current.request.total),
                    min: duration_min(&current.duration_counts),
                    max: duration_max(&current.duration_counts),
                    p95: percentile_i64(&current.duration_counts, 0.95),
                    p99: percentile_i64(&current.duration_counts, 0.99),
                    avg_success: avg_i64(
                        current.request.success_duration_sum,
                        current.request.success_duration_count,
                    ),
                    avg_failure: avg_i64(
                        current.request.failure_duration_sum,
                        current.request.failure_duration_count,
                    ),
                },
                avg_per_user: avg_u64(user_counts.iter().copied().sum(), user_counts.len() as u64),
                median_per_user: median_u64(&user_counts),
                p95_per_user: percentile_u64(&user_counts, 0.95),
                max_per_user: user_counts.into_iter().max().unwrap_or(0),
            },
        }
    }
}

fn aggregate_support_window(days: &[&SupportDay]) -> WindowAggregate {
    let mut aggregate = WindowAggregate::default();
    for day in days {
        aggregate.request.total += day.request.total;
        aggregate.request.successful += day.request.successful;
        aggregate.request.failed += day.request.failed;
        aggregate.request.client_error += day.request.client_error;
        aggregate.request.server_error += day.request.server_error;
        aggregate.request.duration_sum += day.request.duration_sum;
        aggregate.request.success_duration_sum += day.request.success_duration_sum;
        aggregate.request.success_duration_count += day.request.success_duration_count;
        aggregate.request.failure_duration_sum += day.request.failure_duration_sum;
        aggregate.request.failure_duration_count += day.request.failure_duration_count;
        for (duration_ms, count) in &day.duration_counts {
            *aggregate.duration_counts.entry(*duration_ms).or_insert(0) += *count;
        }
        for (user_key, count) in &day.user_counts {
            *aggregate
                .per_user_counts
                .entry(user_key.clone())
                .or_insert(0) += *count;
        }
    }
    aggregate
}

#[derive(Debug, Default)]
struct WindowAggregate {
    request: RequestTotals,
    duration_counts: BTreeMap<i64, u64>,
    per_user_counts: HashMap<String, u64>,
}

fn days_in_range(
    days: &BTreeMap<NaiveDate, SupportDay>,
    start: NaiveDate,
    end: NaiveDate,
) -> Vec<&SupportDay> {
    if start >= end {
        return Vec::new();
    }
    let mut out = Vec::new();
    for (_, day) in days.range(start..end) {
        out.push(day);
    }
    out
}

fn users_from_support_days(days: &[&SupportDay]) -> HashSet<String> {
    let mut out = HashSet::new();
    for day in days {
        out.extend(day.user_counts.keys().cloned());
    }
    out
}

fn ratio(num: u64, den: u64) -> f64 {
    if den == 0 {
        0.0
    } else {
        num as f64 / den as f64
    }
}

fn avg_i64(sum: i64, count: u64) -> f64 {
    if count == 0 {
        0.0
    } else {
        sum as f64 / count as f64
    }
}

fn avg_u64(sum: u64, count: u64) -> f64 {
    if count == 0 {
        0.0
    } else {
        sum as f64 / count as f64
    }
}

fn duration_min(counts: &BTreeMap<i64, u64>) -> f64 {
    counts.keys().next().copied().unwrap_or(0) as f64
}

fn duration_max(counts: &BTreeMap<i64, u64>) -> f64 {
    counts.keys().next_back().copied().unwrap_or(0) as f64
}

fn percentile_i64(counts: &BTreeMap<i64, u64>, percentile: f64) -> f64 {
    percentile_from_counts(counts, percentile)
}

fn percentile_u64(values: &[u64], percentile: f64) -> f64 {
    if values.is_empty() {
        return 0.0;
    }
    let mut values = values.iter().map(|v| *v as f64).collect::<Vec<_>>();
    values.sort_by(|a, b| a.total_cmp(b));
    let rank = ((values.len() as f64) * percentile).ceil() as usize;
    values[rank.saturating_sub(1).min(values.len() - 1)]
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

fn percentile_from_counts(counts: &BTreeMap<i64, u64>, percentile: f64) -> f64 {
    let total: u64 = counts.values().sum();
    if total == 0 {
        return 0.0;
    }
    let target = ((total as f64) * percentile).ceil() as u64;
    let mut seen = 0u64;
    for (value, count) in counts {
        seen += *count;
        if seen >= target {
            return *value as f64;
        }
    }
    counts.keys().next_back().copied().unwrap_or(0) as f64
}

fn day_start(date: NaiveDate) -> DateTime<Utc> {
    date.and_hms_opt(0, 0, 0)
        .map(|t| DateTime::<Utc>::from_naive_utc_and_offset(t, Utc))
        .expect("valid midnight")
}

fn format_date(date: NaiveDate) -> String {
    date.format("%Y-%m-%d").to_string()
}

fn sql_string(value: &str) -> String {
    format!("'{}'", value.replace('\\', "\\\\").replace('\'', "\\'"))
}

fn record_expr(table: &str, key: &str) -> String {
    format!("type::record({}, {})", sql_string(table), sql_string(key))
}

fn parse_cache_date(s: &str) -> Result<NaiveDate, AppError> {
    NaiveDate::parse_from_str(s, "%Y-%m-%d")
        .map_err(|e| AppError::database(format!("invalid cached metrics date '{s}': {e}")))
}

fn shift_date(date: NaiveDate, days: i64) -> Result<NaiveDate, AppError> {
    date.checked_add_signed(Duration::days(days))
        .ok_or_else(|| AppError::database("date arithmetic overflow"))
}

fn next_day_start(date: NaiveDate) -> Result<DateTime<Utc>, AppError> {
    shift_date(date, 1).map(day_start)
}

fn inclusive_days(start: NaiveDate, end: NaiveDate) -> impl Iterator<Item = NaiveDate> {
    let mut current = start;
    std::iter::from_fn(move || {
        if current > end {
            None
        } else {
            let day = current;
            current += Duration::days(1);
            Some(day)
        }
    })
}

fn inclusive_chunks(
    start: NaiveDate,
    end: NaiveDate,
    max_days: i64,
) -> impl Iterator<Item = (NaiveDate, NaiveDate)> {
    let mut current = start;
    std::iter::from_fn(move || {
        if current > end {
            return None;
        }
        let chunk_start = current;
        let chunk_end = std::cmp::min(
            end,
            chunk_start
                .checked_add_signed(Duration::days(max_days - 1))
                .expect("valid chunk range"),
        );
        current = chunk_end + Duration::days(1);
        Some((chunk_start, chunk_end))
    })
}

fn merge_days(
    start: NaiveDate,
    end: NaiveDate,
    cached: &[MonitoringMetricsDay],
    computed: &[MonitoringMetricsDay],
) -> Vec<MonitoringMetricsDay> {
    if start > end {
        return Vec::new();
    }
    let cached_by_date: HashMap<NaiveDate, &MonitoringMetricsDay> =
        cached.iter().map(|day| (day.date, day)).collect();
    let computed_by_date: HashMap<NaiveDate, &MonitoringMetricsDay> =
        computed.iter().map(|day| (day.date, day)).collect();
    inclusive_days(start, end)
        .filter_map(|day| {
            cached_by_date
                .get(&day)
                .copied()
                .or_else(|| computed_by_date.get(&day).copied())
                .cloned()
        })
        .collect()
}

fn surreal_query_err(ctx: &'static str, err: surrealdb::Error) -> AppError {
    crate::observability::log_error_chain(ctx, &err);
    AppError::database(err.to_string())
}
