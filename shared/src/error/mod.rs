pub mod codes;

pub use codes::ErrorCode;

use serde::{Deserialize, Serialize};
use thiserror::Error;

/// Standard error envelope returned by all API error responses.
///
/// `code` is a stable, machine-readable identifier; `error` is a human-readable
/// description.
#[cfg_attr(feature = "backend", derive(utoipa::ToSchema))]
#[cfg_attr(
    feature = "backend",
    schema(deprecated = true, title = "ErrorResponse")
)]
#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct ErrorResponse {
    /// Stable machine-readable error code, e.g. `"unauthorized"`, `"not_found"`.
    pub code: String,
    /// Human-readable description of the error.
    pub error: String,
}

/// [RFC 7807](https://www.rfc-editor.org/rfc/rfc7807) problem document (`application/problem+json`).
///
/// Canonical error body for HTTP 4xx/5xx responses. Extension members include `code`.
#[cfg_attr(feature = "backend", derive(utoipa::ToSchema))]
#[cfg_attr(feature = "backend", schema(title = "Problem"))]
#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct Problem {
    /// URI reference identifying the problem type.
    #[serde(rename = "type")]
    pub type_uri: String,
    /// Short, stable summary of the problem class.
    pub title: String,
    /// HTTP status code.
    pub status: u16,
    /// Stable machine-readable code (extension member).
    pub code: String,
    /// Human-readable explanation.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub detail: Option<String>,
    /// Optional URI reference that identifies the specific occurrence.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub instance: Option<String>,
}

impl Problem {
    pub fn new(
        type_uri: String,
        title: String,
        status: u16,
        code: impl Into<String>,
        detail: String,
        instance: Option<String>,
    ) -> Self {
        Self {
            type_uri,
            title,
            status,
            code: code.into(),
            detail: Some(detail),
            instance,
        }
    }
}

/// Deprecated OpenAPI name for [`Problem`]; identical wire shape.
#[cfg_attr(feature = "backend", derive(utoipa::ToSchema))]
#[cfg_attr(
    feature = "backend",
    schema(deprecated = true, title = "ProblemDetails")
)]
#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct ProblemDetails {
    #[serde(rename = "type")]
    pub type_uri: String,
    pub title: String,
    pub status: u16,
    pub code: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub detail: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub instance: Option<String>,
}

impl From<Problem> for ProblemDetails {
    fn from(p: Problem) -> Self {
        Self {
            type_uri: p.type_uri,
            title: p.title,
            status: p.status,
            code: p.code,
            detail: p.detail,
            instance: p.instance,
        }
    }
}

impl From<ProblemDetails> for Problem {
    fn from(p: ProblemDetails) -> Self {
        Self {
            type_uri: p.type_uri,
            title: p.title,
            status: p.status,
            code: p.code,
            detail: p.detail,
            instance: p.instance,
        }
    }
}

#[derive(Clone, Debug, Error)]
pub enum NetworkClientError {
    #[error("request failed (status: {status:?}): {message}")]
    RequestFailed {
        status: Option<u16>,
        message: String,
    },

    #[error("connection error")]
    Connection,

    #[error("serialization error: {message}")]
    Serialization { message: String },

    #[error("invalid request: {message}")]
    InvalidRequest { message: String },

    #[error("unexpected error: {message}")]
    Unexpected { message: String },
}

impl From<serde_json::Error> for NetworkClientError {
    fn from(err: serde_json::Error) -> Self {
        Self::Serialization {
            message: err.to_string(),
        }
    }
}

#[cfg(feature = "cli")]
impl From<reqwest::Error> for NetworkClientError {
    fn from(err: reqwest::Error) -> Self {
        if err.is_timeout() || err.is_connect() {
            return Self::Connection;
        }

        if let Some(status) = err.status() {
            return Self::RequestFailed {
                status: Some(status.as_u16()),
                message: err.to_string(),
            };
        }

        Self::Unexpected {
            message: err.to_string(),
        }
    }
}

