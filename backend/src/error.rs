use actix_web::http::StatusCode;
use actix_web::web::JsonConfig;
use actix_web::{HttpMessage, HttpResponse, ResponseError};
use thiserror::Error;
use tracing::error;

use crate::observability;
use shared::error::Problem;

#[derive(Debug, Error)]
pub enum AppError {
    #[error("unauthorized")]
    Unauthorized,
    #[error("forbidden")]
    Forbidden,
    #[error("not found")]
    NotFound(String),
    #[error("invalid request: {0}")]
    InvalidRequest(String),
    #[error("invalid media URL: {detail}")]
    MediaUrl { code: &'static str, detail: String },
    #[error("media processing failed: {detail}")]
    MediaProcessing { code: &'static str, detail: String },
    #[error("invalid page size: {0}")]
    InvalidPageSize(String),
    #[error("{0}")]
    Conflict(String),
    #[error("too many requests: {0}")]
    TooManyRequests(String),
    #[error("not acceptable: {0}")]
    NotAcceptable(String),
    #[error("precondition failed")]
    PreconditionFailed,
    #[error("payload too large")]
    PayloadTooLarge,
    #[error("internal error: {0}")]
    Internal(String),
}

/// Return an actix-web `JsonConfig` that maps deserialization errors
/// (including unknown fields from `deny_unknown_fields`) to a well-formed
/// 400 `AppError::InvalidRequest` response instead of the default plain-text
/// 400 from actix-web.
pub fn json_config() -> JsonConfig {
    JsonConfig::default().error_handler(|err, req| {
        let message = err.to_string();
        let instance = req
            .extensions()
            .get::<crate::request_id::ApiRequestTarget>()
            .map(|t| t.0.clone());
        let problem = Problem::new(
            "https://worshipviewer.invalid/problems/invalid_request".into(),
            "Bad Request".into(),
            400,
            "invalid_request",
            message.clone(),
            instance,
        );
        actix_web::error::InternalError::from_response(
            err,
            HttpResponse::build(StatusCode::BAD_REQUEST)
                .content_type("application/problem+json")
                .json(problem),
        )
        .into()
    })
}

impl AppError {
    pub fn unauthorized() -> Self {
        Self::Unauthorized
    }

    pub fn forbidden() -> Self {
        Self::Forbidden
    }

    pub fn invalid_request<T: Into<String>>(msg: T) -> Self {
        Self::InvalidRequest(msg.into())
    }

    pub fn invalid_page_size<T: Into<String>>(msg: T) -> Self {
        Self::InvalidPageSize(msg.into())
    }

    pub fn media_invalid_url<T: Into<String>>(detail: T) -> Self {
        Self::MediaUrl {
            code: "media_invalid_url",
            detail: detail.into(),
        }
    }

    pub fn media_unsupported_url<T: Into<String>>(detail: T) -> Self {
        Self::MediaUrl {
            code: "media_unsupported_url",
            detail: detail.into(),
        }
    }

    pub fn media_processing(code: &'static str, detail: impl Into<String>) -> Self {
        Self::MediaProcessing {
            code,
            detail: detail.into(),
        }
    }

    pub fn invalid_state() -> Self {
        Self::InvalidRequest("login state missing or expired".into())
    }

    pub fn not_acceptable<T: Into<String>>(msg: T) -> Self {
        Self::NotAcceptable(msg.into())
    }

    pub fn oidc<E: std::fmt::Display>(err: E) -> Self {
        Self::Internal(err.to_string())
    }

    pub fn database<E: std::fmt::Display>(err: E) -> Self {
        Self::Internal(format!("database error: {}", err))
    }

    pub fn mail<E: std::fmt::Display>(err: E) -> Self {
        Self::Internal(format!("mail error: {}", err))
    }

    pub fn conflict<T: Into<String>>(msg: T) -> Self {
        Self::Conflict(msg.into())
    }

    pub fn too_many_requests<T: Into<String>>(msg: T) -> Self {
        Self::TooManyRequests(msg.into())
    }

    pub fn precondition_failed() -> Self {
        Self::PreconditionFailed
    }

    pub fn payload_too_large() -> Self {
        Self::PayloadTooLarge
    }

    /// Log full error chain at an I/O boundary, then return [`Internal`](Self::Internal).
    pub fn internal_from_err<E: std::error::Error + 'static>(target: &'static str, err: E) -> Self {
        observability::log_error_chain(target, &err);
        Self::Internal(err.to_string())
    }
}

/// Map [`shared::api::ListQuery::validate`] / [`shared::api::SongListQuery::validate`] failures to the right `AppError` (`invalid_page_size` vs `invalid_request`).
pub fn map_list_query_error(message: String) -> AppError {
    if message.contains("page_size") {
        AppError::invalid_page_size(message)
    } else {
        AppError::invalid_request(message)
    }
}

impl From<surrealdb::Error> for AppError {
    fn from(err: surrealdb::Error) -> Self {
        use surrealdb::types::{ErrorDetails, NotFoundError, QueryError};

        let msg = err.to_string();
        // SurrealDB 3.x surfaces unique indexes and field ASSERT failures as internal errors; map for HTTP.
        if msg.contains("user_email_unique") && msg.contains("already contains") {
            return Self::conflict("email already exists");
        }
        if msg.contains("field `email`") && msg.contains("string::is_email") {
            return Self::invalid_request("invalid email address");
        }
        if msg.contains("field `title`") && msg.contains("string::len(string::trim($value)) > 0") {
            return Self::invalid_request("title must not be empty");
        }

        match err.details() {
            ErrorDetails::AlreadyExists(_) => {
                error!("database conflict: {err}");
                Self::conflict("request conflicts with existing data")
            }
            ErrorDetails::Query(Some(QueryError::TransactionConflict)) => {
                error!("database conflict: {err}");
                Self::conflict("request conflicts with existing data")
            }
            ErrorDetails::NotFound(Some(NotFoundError::Record { .. })) => {
                AppError::NotFound("record not found".into())
            }
            ErrorDetails::NotFound(_) => AppError::NotFound("record not found".into()),
            ErrorDetails::Validation(_) | ErrorDetails::Thrown => {
                error!("database validation error: {err}");
                AppError::invalid_request("invalid request")
            }
            _ => {
                observability::log_error_chain("surrealdb.app_error", &err);
                Self::database(err)
            }
        }
    }
}

impl From<chordlib::Error> for AppError {
    fn from(err: chordlib::Error) -> Self {
        AppError::invalid_request(err.to_string())
    }
}

impl From<reqwest::Error> for AppError {
    fn from(err: reqwest::Error) -> Self {
        observability::log_error_chain("reqwest", &err);
        AppError::Internal(format!("HTTP client error: {}", err))
    }
}

impl AppError {
    /// Stable machine-readable code for this error variant.
    pub fn code(&self) -> &'static str {
        match self {
            AppError::Unauthorized => "unauthorized",
            AppError::Forbidden => "forbidden",
            AppError::NotFound(_) => "not_found",
            AppError::InvalidRequest(_) => "invalid_request",
            AppError::MediaUrl { code, .. } => code,
            AppError::MediaProcessing { code, .. } => code,
            AppError::InvalidPageSize(_) => "invalid_page_size",
            AppError::Conflict(_) => "conflict",
            AppError::TooManyRequests(_) => "too_many_requests",
            AppError::NotAcceptable(_) => "not_acceptable",
            AppError::PreconditionFailed => "precondition_failed",
            AppError::PayloadTooLarge => "payload_too_large",
            AppError::Internal(_) => "internal",
        }
    }

    fn problem_type_uri(&self) -> String {
        format!("https://worshipviewer.invalid/problems/{}", self.code())
    }

    fn detail_message(&self) -> String {
        if matches!(self, AppError::Internal(_)) {
            return "internal server error".to_owned();
        }
        match self {
            AppError::NotAcceptable(msg) => msg.clone(),
            AppError::PreconditionFailed => {
                "If-Match does not match the current resource representation".to_owned()
            }
            AppError::MediaUrl { detail, .. } => detail.clone(),
            AppError::MediaProcessing { detail, .. } => detail.clone(),
            _ => self.to_string(),
        }
    }
}

fn http_status_title(status: u16) -> &'static str {
    match status {
        400 => "Bad Request",
        401 => "Unauthorized",
        403 => "Forbidden",
        404 => "Not Found",
        406 => "Not Acceptable",
        409 => "Conflict",
        429 => "Too Many Requests",
        412 => "Precondition Failed",
        413 => "Payload Too Large",
        500 => "Internal Server Error",
        _ => "Error",
    }
}

impl ResponseError for AppError {
    fn status_code(&self) -> StatusCode {
        match self {
            AppError::Unauthorized => StatusCode::UNAUTHORIZED,
            AppError::Forbidden => StatusCode::FORBIDDEN,
            AppError::NotFound(_) => StatusCode::NOT_FOUND,
            AppError::InvalidRequest(_)
            | AppError::MediaUrl { .. }
            | AppError::MediaProcessing { .. }
            | AppError::InvalidPageSize(_) => StatusCode::BAD_REQUEST,
            AppError::Conflict(_) => StatusCode::CONFLICT,
            AppError::TooManyRequests(_) => StatusCode::TOO_MANY_REQUESTS,
            AppError::NotAcceptable(_) => StatusCode::NOT_ACCEPTABLE,
            AppError::PreconditionFailed => StatusCode::PRECONDITION_FAILED,
            AppError::PayloadTooLarge => StatusCode::PAYLOAD_TOO_LARGE,
            AppError::Internal(_) => StatusCode::INTERNAL_SERVER_ERROR,
        }
    }

    fn error_response(&self) -> HttpResponse {
        if matches!(self, AppError::Internal(_)) {
            error!(
                error.code = self.code(),
                error = %self,
                error_source_chain = %observability::error_source_chain_string(self),
                error_debug = ?self,
                "internal error"
            );
        }
        let status = self.status_code().as_u16();
        let detail = self.detail_message();
        let problem = Problem::new(
            self.problem_type_uri(),
            http_status_title(status).to_string(),
            status,
            self.code(),
            detail.clone(),
            None,
        );
        HttpResponse::build(self.status_code())
            .content_type("application/problem+json")
            .json(problem)
    }
}
