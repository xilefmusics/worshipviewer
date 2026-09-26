use serde::{Deserialize, Serialize};
use surrealdb::types::{RecordId, SurrealValue};

use shared::media::{Media, MediaContent, MediaPendingRevision};

use crate::database::record_id_string;
use crate::error::AppError;

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
    pub content_json: String,
    #[serde(default)]
    pub is_background: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub pending_revision_json: Option<String>,
}

impl MediaRecord {
    pub fn from_write(
        id: Option<RecordId>,
        owner: Option<RecordId>,
        value: MediaWrite,
    ) -> Result<Self, AppError> {
        Ok(Self {
            id,
            owner,
            title: value.title,
            content_json: serde_json::to_string(&value.content)
                .map_err(|e| AppError::internal_from_err("media.model", e))?,
            is_background: value.is_background,
            pending_revision_json: value
                .pending_revision
                .map(|v| serde_json::to_string(&v))
                .transpose()
                .map_err(|e| AppError::internal_from_err("media.model", e))?,
        })
    }

    pub fn into_media(self) -> Result<Media, AppError> {
        Ok(Media {
            id: self.id.map(|v| record_id_string(&v)).unwrap_or_default(),
            owner: self.owner.map(|v| record_id_string(&v)).unwrap_or_default(),
            title: self.title,
            content: serde_json::from_str(&self.content_json)
                .map_err(|e| AppError::internal_from_err("media.model", e))?,
            is_background: self.is_background,
            pending_revision: self
                .pending_revision_json
                .map(|v| parse_pending_revision(&v))
                .transpose()
                .map_err(|e| AppError::internal_from_err("media.model", e))?,
        })
    }
}

fn parse_pending_revision(value: &str) -> Result<MediaPendingRevision, serde_json::Error> {
    serde_json::from_str(value)
}
