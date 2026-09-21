use crate::media::{Media, MediaContent};
use crate::song::Song;
use chordlib::types::SimpleChord;
use chordlib::types::SongFlowItem;
use serde::{Deserialize, Serialize};
#[cfg(feature = "backend")]
use utoipa::ToSchema;

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
#[serde(tag = "type", rename_all = "snake_case")]
#[cfg_attr(feature = "backend", derive(ToSchema))]
pub enum PlayerItem {
    Blob(PlayerBlobItem),
    Chords(Box<PlayerChordsItem>),
    Media(Box<PlayerMediaItem>),
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
    /// Saved capo playing shape from a setlist slot, if any.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[cfg_attr(feature = "backend", schema(value_type = Option<crate::song::SimpleChordSchema>))]
    pub capo_shape: Option<SimpleChord>,
    /// Language override for this player item; `None` uses the song's default language.
    pub language: Option<String>,
    /// Custom flow override from the setlist slot, if any.
    #[cfg_attr(feature = "backend", schema(value_type = Option<Vec<crate::song::SongFlowItemSchema>>))]
    pub flow: Option<Vec<SongFlowItem>>,
}

/// Immutable Media snapshot for online AV (`type`: `"media"`).
#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
#[cfg_attr(feature = "backend", derive(ToSchema))]
pub struct PlayerMediaItem {
    /// Media resource id (stable identity for this setlist slot).
    pub id: String,
    pub title: String,
    pub content: MediaContent,
}

impl PlayerMediaItem {
    /// Snapshot playable media for AV.
    pub fn from_ready_media(media: &Media) -> Option<Self> {
        Some(Self {
            id: media.id.clone(),
            title: media.title.clone(),
            content: media.content.clone(),
        })
    }
}

impl Default for PlayerItem {
    fn default() -> Self {
        Self::Blob(PlayerBlobItem {
            blob_id: String::new(),
        })
    }
}
