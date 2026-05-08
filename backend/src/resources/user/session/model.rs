use serde::{Deserialize, Serialize};
use surrealdb::types::{Datetime, RecordId, SurrealValue};

use super::Session;
use crate::database::record_id_string;
use crate::resources::user::UserRecord;

#[derive(Clone, Debug, Deserialize, Serialize, SurrealValue)]
pub struct SessionRecord {
    pub id: RecordId,
    pub user: UserRecord,
    pub created_at: Datetime,
    pub expires_at: Datetime,
}

impl SessionRecord {
    pub fn into_session(self) -> Session {
        Session {
            id: record_id_string(&self.id),
            user: self.user.into_user(),
            created_at: self.created_at.into(),
            expires_at: self.expires_at.into(),
        }
    }
}

#[derive(Debug, Serialize, SurrealValue)]
pub struct SessionCreateRecord {
    pub user: RecordId,
    pub expires_at: Datetime,
}

impl SessionCreateRecord {
    pub fn from_session(session: Session) -> Self {
        Self {
            user: RecordId::new("user", session.user.id),
            expires_at: session.expires_at.into(),
        }
    }
}

#[derive(Deserialize, Debug, SurrealValue)]
pub struct SessionIdRecord {
    pub id: RecordId,
}
