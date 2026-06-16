use crate::song::Song;
use serde::{Deserialize, Serialize};
#[cfg(feature = "backend")]
use utoipa::ToSchema;

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
#[serde(tag = "type", rename_all = "snake_case")]
#[cfg_attr(feature = "backend", derive(ToSchema))]
pub enum PlayerItem {
    Blob(PlayerBlobItem),
    Chords(Box<PlayerChordsItem>),
}

/// Sheet-music or image item in a player sequence (`type`: `"blob"`).
#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
#[cfg_attr(feature = "backend", derive(ToSchema))]
pub struct PlayerBlobItem {
    pub blob_id: String,
}

/// ChordPro-backed song item in a player sequence (`type`: `"chords"`).
#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
#[cfg_attr(feature = "backend", derive(ToSchema))]
pub struct PlayerChordsItem {
    pub song: Song,
    /// Language override for this player item; `None` uses the song's default language.
    pub language: Option<String>,
}

impl Default for PlayerItem {
    fn default() -> Self {
        Self::Blob(PlayerBlobItem {
            blob_id: String::new(),
        })
    }
}
