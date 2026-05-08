use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

#[cfg(feature = "backend")]
#[allow(unused_imports)]
use serde_json::json;

use super::Role;

#[cfg_attr(feature = "backend", derive(utoipa::ToSchema))]
#[derive(Clone, Debug, Deserialize, Serialize, Default)]
#[cfg_attr(
    feature = "backend",
    schema(example = json!({
        "id": "usr_example",
        "email": "singer@example.com",
        "role": "default",
        "default_collection": null,
        "created_at": "2026-01-01T12:00:00Z",
        "oauth_picture_url": null,
        "oauth_avatar_blob_id": null,
        "avatar_blob_id": null
    }))
)]
pub struct User {
    pub id: String,
    pub email: String,
    pub role: Role,
    #[serde(default)]
    pub default_collection: Option<String>,
    pub created_at: DateTime<Utc>,
    /// Last `picture` claim URL seen from OIDC (used to detect when to re-fetch the cached avatar).
    #[serde(default)]
    pub oauth_picture_url: Option<String>,
    /// Backend-cached OAuth profile image (`GET /api/v1/blobs/{id}/data`).
    #[serde(default)]
    pub oauth_avatar_blob_id: Option<String>,
    /// User-uploaded profile image; takes precedence over [`Self::oauth_avatar_blob_id`].
    #[serde(default)]
    pub avatar_blob_id: Option<String>,
}

impl User {
    #[cfg(feature = "backend")]
    pub fn new<S: Into<String>>(email: S) -> Self {
        Self {
            id: String::new(),
            email: email.into().to_lowercase(),
            role: Role::default(),
            default_collection: None,
            created_at: Utc::now(),
            oauth_picture_url: None,
            oauth_avatar_blob_id: None,
            avatar_blob_id: None,
        }
    }
}
