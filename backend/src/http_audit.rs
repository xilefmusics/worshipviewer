//! Best-effort async persistence of one row per HTTP request (`http_request_audit`).

use std::future::{Ready, ready};
use std::rc::Rc;
use std::time::Instant;

use actix_web::dev::{Service, ServiceRequest, ServiceResponse, Transform, forward_ready};
use actix_web::http::header::{REFERER, USER_AGENT};
use actix_web::web::Data;
use actix_web::{Error, HttpMessage};
use chrono::Utc;
use futures_util::future::LocalBoxFuture;
use ring::digest::{SHA256, digest};
use tracing::error;
use uuid::Uuid;

use crate::auth::AuthorizationContext;
use crate::client_attribution::{self, X_WORSHIP_CLIENT};
use crate::database::Database;
use crate::request_id::ApiRequestTarget;

/// Session id string for the authenticated request (set by [`crate::auth::middleware::RequireUser`]).
#[derive(Clone)]
pub struct AuditSessionId(pub String);

#[derive(Clone)]
pub struct HttpAudit {
    db: Data<Database>,
}

impl HttpAudit {
    pub fn new(db: Data<Database>) -> Self {
        Self { db }
    }
}

impl<S, B> Transform<S, ServiceRequest> for HttpAudit
where
    S: Service<ServiceRequest, Response = ServiceResponse<B>, Error = Error> + 'static,
    B: 'static,
{
    type Response = ServiceResponse<B>;
    type Error = Error;
    type InitError = ();
    type Transform = HttpAuditMiddleware<S>;
    type Future = Ready<Result<Self::Transform, Self::InitError>>;

    fn new_transform(&self, service: S) -> Self::Future {
        ready(Ok(HttpAuditMiddleware {
            service: Rc::new(service),
            db: self.db.clone(),
        }))
    }
}

pub struct HttpAuditMiddleware<S> {
    service: Rc<S>,
    db: Data<Database>,
}

impl<S, B> Service<ServiceRequest> for HttpAuditMiddleware<S>
where
    S: Service<ServiceRequest, Response = ServiceResponse<B>, Error = Error> + 'static,
    B: 'static,
{
    type Response = ServiceResponse<B>;
    type Error = Error;
    type Future = LocalBoxFuture<'static, Result<Self::Response, Self::Error>>;

    forward_ready!(service);

    fn call(&self, req: ServiceRequest) -> Self::Future {
        let service = Rc::clone(&self.service);
        let db_data = self.db.clone();
        let started = Instant::now();
        let method = req.method().as_str().to_owned();
        let path_fallback = req
            .uri()
            .path_and_query()
            .map(|pq| pq.to_string())
            .unwrap_or_else(|| req.uri().path().to_owned());
        let request_id = req
            .extensions()
            .get::<String>()
            .cloned()
            .unwrap_or_else(|| Uuid::new_v4().to_string());
        let api_path = req
            .extensions()
            .get::<ApiRequestTarget>()
            .map(|t| t.0.clone())
            .unwrap_or(path_fallback.clone());
        let headers = req.headers();
        let x_worship_client = headers
            .get(X_WORSHIP_CLIENT)
            .and_then(|v| v.to_str().ok())
            .map(str::to_owned);
        let user_agent = headers
            .get(USER_AGENT)
            .and_then(|v| v.to_str().ok())
            .map(str::to_owned);
        let referer = headers
            .get(REFERER)
            .and_then(|v| v.to_str().ok())
            .map(str::to_owned);
        let (client_origin, client_version) = client_attribution::classify(
            x_worship_client.as_deref(),
            user_agent.as_deref(),
            referer.as_deref(),
        );

        Box::pin(async move {
            let outcome = service.call(req).await;
            let duration_ms = started.elapsed().as_millis() as i64;

            let (status_code, user_id, session_id, path_for_row) = match &outcome {
                Ok(resp) => {
                    let r = resp.request();
                    let path = r
                        .extensions()
                        .get::<ApiRequestTarget>()
                        .map(|t| t.0.clone())
                        .unwrap_or_else(|| api_path.clone());
                    let user_id = r
                        .extensions()
                        .get::<AuthorizationContext>()
                        .map(|ctx| ctx.user.id.clone());
                    let session_id = r.extensions().get::<AuditSessionId>().map(|s| s.0.clone());
                    (resp.status().as_u16() as i64, user_id, session_id, path)
                }
                Err(e) => (
                    actix_web::error::ResponseError::status_code(e.as_response_error()).as_u16()
                        as i64,
                    None,
                    None,
                    api_path,
                ),
            };

            let db_inner = db_data.clone();
            let row = HttpAuditInsert {
                request_id: request_id.clone(),
                method: method.clone(),
                path: path_for_row.clone(),
                status_code,
                duration_ms,
                user_id,
                session_id,
                client_origin,
                client_version,
            };
            if cfg!(test) {
                insert_row(db_inner.get_ref(), row)
                    .await
                    .expect("http_request_audit insert (test)");
            } else {
                tokio::spawn(async move {
                    if let Err(e) = insert_row(db_inner.get_ref(), row).await {
                        error!(error = %e, "http_request_audit insert failed");
                    }
                });
            }

            outcome
        })
    }
}

struct HttpAuditInsert {
    request_id: String,
    method: String,
    path: String,
    status_code: i64,
    duration_ms: i64,
    user_id: Option<String>,
    session_id: Option<String>,
    client_origin: String,
    client_version: Option<String>,
}

async fn insert_row(db: &Database, row: HttpAuditInsert) -> Result<(), surrealdb::Error> {
    let created_at = Utc::now();
    let created_at_db = surrealdb::types::Datetime::from(created_at);
    let day = created_at.date_naive();
    let date = day.format("%Y-%m-%d").to_string();
    let tomorrow = (day + chrono::Duration::days(1))
        .format("%Y-%m-%d")
        .to_string();
    let successful = if (200..=399).contains(&row.status_code) {
        1
    } else {
        0
    };
    let failed = if row.status_code >= 400 { 1 } else { 0 };
    let client_error = if (400..=499).contains(&row.status_code) {
        1
    } else {
        0
    };
    let server_error = if row.status_code >= 500 { 1 } else { 0 };
    let success_duration_sum = if successful == 1 { row.duration_ms } else { 0 };
    let success_duration_count = successful;
    let failure_duration_sum = if failed == 1 { row.duration_ms } else { 0 };
    let failure_duration_count = failed;

    let mut sql = String::new();
    sql.push_str("BEGIN TRANSACTION;\n");
    sql.push_str(
        "CREATE http_request_audit SET request_id = $request_id, method = $method, \
         path = $path, status_code = $status_code, duration_ms = $duration_ms, \
         client_origin = $client_origin, \
         client_version = IF $client_version = NONE THEN NONE ELSE $client_version END, \
         user = IF $user_id = NONE THEN NONE ELSE type::record('user', $user_id) END, \
         session = IF $session_id = NONE THEN NONE ELSE type::record('session', $session_id) END, \
         created_at = $created_at;\n",
    );
    sql.push_str(&format!(
        "LET $request_day = type::record('metrics_request_day', {});\n",
        sql_string(&date)
    ));
    sql.push_str(&format!(
        "UPSERT $request_day SET date = {}, total = IF total = NONE THEN 1 ELSE total + 1 END, successful = IF successful = NONE THEN {} ELSE successful + {} END, failed = IF failed = NONE THEN {} ELSE failed + {} END, client_error = IF client_error = NONE THEN {} ELSE client_error + {} END, server_error = IF server_error = NONE THEN {} ELSE server_error + {} END, duration_sum = IF duration_sum = NONE THEN {} ELSE duration_sum + {} END, success_duration_sum = IF success_duration_sum = NONE THEN {} ELSE success_duration_sum + {} END, success_duration_count = IF success_duration_count = NONE THEN {} ELSE success_duration_count + {} END, failure_duration_sum = IF failure_duration_sum = NONE THEN {} ELSE failure_duration_sum + {} END, failure_duration_count = IF failure_duration_count = NONE THEN {} ELSE failure_duration_count + {} END, complete = true, version = 1, updated_at = time::now();\n",
        sql_string(&date),
        successful,
        successful,
        failed,
        failed,
        client_error,
        client_error,
        server_error,
        server_error,
        row.duration_ms,
        row.duration_ms,
        success_duration_sum,
        success_duration_sum,
        success_duration_count,
        success_duration_count,
        failure_duration_sum,
        failure_duration_sum,
        failure_duration_count,
        failure_duration_count,
    ));
    sql.push_str(&format!(
        "LET $duration_day = type::record('metrics_duration_day', {});\n",
        sql_string(&record_key(&[&date, &row.duration_ms.to_string()]))
    ));
    sql.push_str(&format!(
        "UPSERT $duration_day SET date = {}, duration_ms = {}, count = IF count = NONE THEN 1 ELSE count + 1 END;\n",
        sql_string(&date),
        row.duration_ms,
    ));
    if let Some(user_id) = &row.user_id {
        sql.push_str(&format!(
            "LET $user_day = type::record('metrics_user_day', {});\n",
            sql_string(&record_key(&[&date, user_id]))
        ));
        sql.push_str(&format!(
            "UPSERT $user_day SET date = {}, user_key = {}, request_count = IF request_count = NONE THEN 1 ELSE request_count + 1 END;\n",
            sql_string(&date),
            sql_string(user_id),
        ));
        sql.push_str(&format!(
            "LET $first_seen = type::record('metrics_user_first_seen', {});\n",
            sql_string(user_id)
        ));
        sql.push_str(&format!(
            "UPSERT $first_seen SET user_key = {}, first_seen_date = IF first_seen_date = NONE OR first_seen_date > {} THEN {} ELSE first_seen_date END;\n",
            sql_string(user_id),
            sql_string(&date),
            sql_string(&date),
        ));
    }
    sql.push_str(&format!(
        "LET $summary_state = type::record('metrics_summary_state', 'global');\n\
         UPSERT $summary_state SET complete_from_date = complete_from_date ?? {}, version = 1;\n",
        sql_string(&tomorrow)
    ));
    sql.push_str("COMMIT TRANSACTION;");

    let response = db
        .db
        .query(sql)
        .bind(("request_id", row.request_id))
        .bind(("method", row.method))
        .bind(("path", row.path))
        .bind(("status_code", row.status_code))
        .bind(("duration_ms", row.duration_ms))
        .bind(("client_origin", row.client_origin))
        .bind(("client_version", row.client_version))
        .bind(("user_id", row.user_id))
        .bind(("session_id", row.session_id))
        .bind(("created_at", created_at_db))
        .await?;
    response.check()?;
    Ok(())
}

fn sql_string(value: &str) -> String {
    format!("'{}'", value.replace('\\', "\\\\").replace('\'', "\\'"))
}

fn record_key(parts: &[&str]) -> String {
    let mut input = String::new();
    for (index, part) in parts.iter().enumerate() {
        if index > 0 {
            input.push('\0');
        }
        input.push_str(part);
    }
    hex::encode(digest(&SHA256, input.as_bytes()).as_ref())
}
