use serde::{Deserialize, Serialize};
use surrealdb::types::{RecordId, SurrealValue};

use shared::media::{Media, MediaContent, MediaPendingRevision};

use crate::database::record_id_string;
use crate::error::AppError;
use crate::resources::surreal_json::JsonObject;

#[derive(Clone, Debug)]
pub struct MediaWrite {
    pub title: String,
    pub content: MediaContent,
    pub pending_revision: Option<MediaPendingRevision>,
    pub is_background: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize, SurrealValue)]
pub struct MediaRecord {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub id: Option<RecordId>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub owner: Option<RecordId>,
    pub title: String,
    pub(crate) content: JsonObject<MediaContent>,
    #[serde(default)]
    pub is_background: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(crate) pending_revision: Option<JsonObject<MediaPendingRevision>>,
}

impl MediaRecord {
    pub fn from_write(id: Option<RecordId>, owner: Option<RecordId>, value: MediaWrite) -> Self {
        Self {
            id,
            owner,
            title: value.title,
            content: JsonObject(value.content),
            is_background: value.is_background,
            pending_revision: value.pending_revision.map(JsonObject),
        }
    }

    pub fn into_media(self) -> Result<Media, AppError> {
        Ok(Media {
            id: self.id.map(|v| record_id_string(&v)).unwrap_or_default(),
            owner: self.owner.map(|v| record_id_string(&v)).unwrap_or_default(),
            title: self.title,
            content: self.content.0,
            is_background: self.is_background,
            pending_revision: self.pending_revision.map(|value| value.0),
        })
    }
}
