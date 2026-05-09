//! Public deployment metadata response (`GET /api/v1/about`).

use serde::{Deserialize, Serialize};

#[cfg(feature = "backend")]
use utoipa::ToSchema;

/// JSON body for the about endpoint.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[cfg_attr(feature = "backend", derive(ToSchema))]
pub struct AboutResponse {
    /// Identifies this server binary.
    pub service: String,
    /// Semver from `Cargo.toml` at compile time (`CARGO_PKG_VERSION`).
    pub version: String,
    /// Git revision if `GIT_COMMIT_SHA` was set during `cargo build`.
    pub git_commit: Option<String>,
    /// `true` when the deployment considers itself production.
    pub production: bool,
}
