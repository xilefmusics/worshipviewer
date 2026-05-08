#[cfg(feature = "backend")]
use chrono::Utc;
use serde::{Deserialize, Serialize};
#[cfg(feature = "backend")]
use thiserror::Error;

use super::Role;
#[cfg(feature = "backend")]
use super::User;
#[cfg(feature = "backend")]
#[allow(unused_imports)]
use serde_json::json;

/// Failed to build a [`User`] from [`CreateUser`] (missing or malformed email).
#[cfg(feature = "backend")]
#[derive(Debug, Clone, Error)]
pub enum CreateUserError {
    #[error("email is required")]
    MissingEmail,
    #[error("invalid email address")]
    InvalidEmail,
}

#[cfg(feature = "backend")]
fn email_passes_basic_checks(normalized: &str) -> bool {
    let parts: Vec<&str> = normalized.split('@').collect();
    if parts.len() != 2 {
        return false;
    }
    let local = parts[0];
    let domain = parts[1];
    !local.is_empty()
        && !domain.is_empty()
        && domain.contains('.')
        && !domain.starts_with('.')
        && !domain.ends_with('.')
}

#[cfg_attr(feature = "backend", derive(utoipa::ToSchema))]
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
#[cfg_attr(
    feature = "backend",
    schema(example = json!({ "email": "singer@example.com", "role": "default" }))
)]
pub struct CreateUser {
    pub email: String,
    #[serde(default)]
    pub role: Role,
    #[serde(default)]
    pub default_collection: Option<String>,
}

impl CreateUser {
    /// Normalize and validate **`email`**, then build a new in-memory [`User`] (no id yet).
    #[cfg(feature = "backend")]
    pub fn try_into_user(self) -> Result<User, CreateUserError> {
        let email = self.email.trim().to_lowercase();
        if email.is_empty() {
            return Err(CreateUserError::MissingEmail);
        }
        if !email_passes_basic_checks(&email) {
            return Err(CreateUserError::InvalidEmail);
        }
        Ok(User {
            id: String::new(),
            email,
            role: self.role,
            default_collection: self.default_collection,
            created_at: Utc::now(),
            oauth_picture_url: None,
            oauth_avatar_blob_id: None,
            avatar_blob_id: None,
        })
    }
}
