#[cfg(feature = "backend")]
use chrono::Duration;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

#[cfg(feature = "backend")]
#[allow(unused_imports)]
use serde_json::json;

use crate::team::TeamUser;

use super::User;

/// Wire representation of a session. `user` is a [`TeamUser`] link unless the client
/// passes `expand=user`, in which case it is the full [`User`] object.
#[cfg_attr(feature = "backend", derive(utoipa::ToSchema))]
#[cfg_attr(
    feature = "backend",
    schema(example = json!({
        "id": "550e8400-e29b-41d4-a716-446655440000",
        "user": { "id": "user-1", "email": "singer@example.com" },
        "created_at": "2024-01-01T12:00:00Z",
        "expires_at": "2025-01-01T12:00:00Z"
    }))
)]
#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct SessionBody {
    pub id: String,
    pub user: SessionUserBody,
    pub created_at: DateTime<Utc>,
    pub expires_at: DateTime<Utc>,
}

#[cfg_attr(feature = "backend", derive(utoipa::ToSchema))]
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(untagged)]
pub enum SessionUserBody {
    /// Try full user first so link-shaped JSON (missing required user fields) falls through to [`TeamUser`].
    Expanded(User),
    Link(TeamUser),
}

impl SessionBody {
    pub fn from_session(session: Session, expand_user: bool) -> Self {
        let user = if expand_user {
            SessionUserBody::Expanded(session.user)
        } else {
            SessionUserBody::Link(TeamUser {
                id: session.user.id.clone(),
                email: session.user.email.clone(),
            })
        };
        Self {
            id: session.id,
            user,
            created_at: session.created_at,
            expires_at: session.expires_at,
        }
    }
}

#[derive(Clone, Debug, Deserialize, Serialize, Default)]
pub struct Session {
    pub id: String,
    pub user: User,
    pub created_at: DateTime<Utc>,
    pub expires_at: DateTime<Utc>,
}

impl Session {
    #[cfg(feature = "backend")]
    pub fn new(user: User, ttl_seconds: i64) -> Self {
        let now = Utc::now();
        let expires_at = if ttl_seconds > 0 {
            now + Duration::seconds(ttl_seconds)
        } else {
            now
        };

        Self {
            id: uuid::Uuid::new_v4().to_string(),
            user,
            created_at: now,
            expires_at,
        }
    }

    #[cfg(feature = "backend")]
    pub fn admin(user: User, ttl_seconds: i64) -> Self {
        let mut session = Self::new(user, ttl_seconds);
        session.id = "admin".into();
        session
    }
}
