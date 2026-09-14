use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
#[cfg(feature = "backend")]
use utoipa::ToSchema;

use crate::player::{Player, PlayerChordsItem, PlayerItem, TocItem};

#[derive(Debug, Serialize, Deserialize, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
#[cfg_attr(feature = "backend", derive(ToSchema))]
pub enum RoomSourceType {
    Song,
    Collection,
    Setlist,
}

#[derive(Debug, Serialize, Deserialize, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
#[cfg_attr(feature = "backend", derive(ToSchema))]
pub enum RoomMode {
    Sheet,
    Av,
    Slide,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
#[cfg_attr(feature = "backend", derive(ToSchema))]
pub struct RoomContent {
    pub items: Vec<PlayerChordsItem>,
    pub toc: Vec<TocItem>,
}

impl RoomContent {
    /// Remove player-only blob slots and blob references from a chord song before it enters a room.
    pub fn normalize_song(mut song: PlayerChordsItem) -> PlayerChordsItem {
        song.song.blobs.clear();
        song.song.user_specific_addons.liked = false;
        song
    }
}

impl From<&Player> for RoomContent {
    fn from(player: &Player) -> Self {
        let mut items = Vec::new();
        let mut chord_item_indices = vec![None; player.items().len()];
        for (index, item) in player.items().iter().enumerate() {
            let PlayerItem::Chords(chords) = item else {
                continue;
            };
            chord_item_indices[index] = Some(items.len());
            items.push(Self::normalize_song((**chords).clone()));
        }

        let mut toc = Vec::new();
        for (toc_index, row) in player.toc().iter().enumerate() {
            let start = row.idx.min(player.items().len());
            let end = player
                .toc()
                .get(toc_index + 1)
                .map_or(player.items().len(), |next| next.idx)
                .min(player.items().len());
            let Some(new_index) =
                (start..end).find_map(|item_index| chord_item_indices[item_index])
            else {
                continue;
            };
            let mut row = row.clone();
            row.idx = new_index;
            row.liked = false;
            toc.push(row);
        }
        Self { items, toc }
    }
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Default)]
#[cfg_attr(feature = "backend", derive(ToSchema))]
pub struct RoomMusicalState {
    pub item_index: usize,
    #[serde(default)]
    pub started: bool,
    pub language: Option<String>,
    pub transposition: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Default)]
#[cfg_attr(feature = "backend", derive(ToSchema))]
pub struct RoomProjectionPayload {
    pub content_text: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[cfg_attr(feature = "backend", schema(value_type = Option<Object>))]
    pub content_lines: Option<serde_json::Value>,
    #[cfg_attr(feature = "backend", schema(value_type = Object))]
    pub content_layer: serde_json::Value,
    #[cfg_attr(feature = "backend", schema(value_type = Object))]
    pub background_layer: serde_json::Value,
    #[cfg_attr(feature = "backend", schema(value_type = Object))]
    pub transition: serde_json::Value,
    pub screen_state: String,
    pub item_title: String,
    pub next_preview: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
#[cfg_attr(feature = "backend", derive(ToSchema))]
pub struct RoomQueueItem {
    pub id: String,
    pub song_id: String,
    pub added_by: String,
    #[serde(default)]
    pub upvotes: u64,
    #[serde(default)]
    pub played: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[cfg_attr(feature = "backend", derive(ToSchema))]
pub struct RoomQueueLikes {
    pub song_ids: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
#[cfg_attr(feature = "backend", derive(ToSchema))]
pub struct RoomSession {
    pub id: String,
    pub mode: RoomMode,
    #[serde(default)]
    pub hide_chords: bool,
    pub display_name: String,
    pub avatar_url: Option<String>,
    pub anonymous: bool,
    pub connected: bool,
    pub is_host: bool,
    pub is_av_host: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
#[cfg_attr(feature = "backend", derive(ToSchema))]
pub struct RoomSummary {
    pub id: String,
    pub name: String,
    pub team_id: String,
    #[serde(default = "default_queue_additions_allowed")]
    pub queue_additions_allowed: bool,
    pub host_email: String,
    #[serde(default)]
    pub can_close: bool,
    pub session_count: usize,
    pub av_occupied: bool,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
#[cfg_attr(feature = "backend", derive(ToSchema))]
pub struct RoomSnapshot {
    #[serde(flatten)]
    pub summary: RoomSummary,
    #[serde(default)]
    pub new_joins_locked: bool,
    pub content: RoomContent,
    #[serde(default)]
    pub queue: Vec<RoomQueueItem>,
    #[serde(default)]
    pub voted_queue_ids: Vec<String>,
    pub musical_state: RoomMusicalState,
    pub projection: Option<RoomProjectionPayload>,
    pub sessions: Vec<RoomSession>,
    pub revision: u64,
    pub host_lease_expires_at: DateTime<Utc>,
    #[serde(default = "default_guest_access_allowed")]
    pub guest_access_allowed: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
#[cfg_attr(feature = "backend", derive(ToSchema))]
pub struct AddRoomQueueItem {
    pub song_id: String,
    pub revision: u64,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[cfg_attr(feature = "backend", derive(ToSchema))]
pub struct UpdateRoomQueueAccess {
    pub queue_additions_allowed: bool,
    pub revision: u64,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
#[cfg_attr(feature = "backend", derive(ToSchema))]
pub struct ReorderRoomQueue {
    pub queue_ids: Vec<String>,
    pub revision: u64,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
#[cfg_attr(feature = "backend", derive(ToSchema))]
pub struct RoomQueueRevision {
    pub revision: u64,
}

fn default_guest_access_allowed() -> bool {
    true
}

fn default_queue_additions_allowed() -> bool {
    true
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
#[cfg_attr(feature = "backend", derive(ToSchema))]
pub struct CreateRoom {
    pub team_id: String,
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub source_type: Option<RoomSourceType>,
    #[serde(default)]
    pub source_id: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
#[cfg_attr(feature = "backend", derive(ToSchema))]
pub struct JoinRoom {
    pub mode: RoomMode,
    #[serde(default)]
    pub hide_chords: bool,
    pub resume_credential: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
#[cfg_attr(feature = "backend", derive(ToSchema))]
pub struct InspectRoomInvite {
    pub invite_secret: String,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
#[cfg_attr(feature = "backend", derive(ToSchema))]
pub struct JoinRoomInvite {
    pub invite_secret: String,
    pub display_name: String,
    pub mode: RoomMode,
    #[serde(default)]
    pub hide_chords: bool,
    pub resume_credential: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
#[cfg_attr(feature = "backend", derive(ToSchema))]
pub struct RoomInviteInfo {
    pub room_id: String,
    pub name: String,
    pub host_email: String,
    pub av_occupied: bool,
    #[serde(default = "default_guest_access_allowed")]
    pub guest_access_allowed: bool,
    #[serde(default)]
    pub new_joins_locked: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
#[cfg_attr(feature = "backend", derive(ToSchema))]
pub struct RoomCredentials {
    pub room_id: String,
    pub session_id: String,
    pub mode: RoomMode,
    pub resume_credential: String,
    pub connection_ticket: String,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
#[cfg_attr(feature = "backend", derive(ToSchema))]
pub struct CreatedRoom {
    pub room: RoomSummary,
    pub credentials: RoomCredentials,
    pub invite_secret: String,
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        blob::BlobLink,
        media::MediaContent,
        player::{Player, PlayerChordsItem, PlayerItem, PlayerMediaItem},
        song::{Song, SongUserSpecificAddons},
    };

    #[test]
    fn room_content_strips_user_likes() {
        let mut song = Song {
            id: "song-1".into(),
            user_specific_addons: SongUserSpecificAddons { liked: true },
            ..Default::default()
        };
        song.data.titles = vec!["Title".into()];
        let player = Player::new(
            vec![PlayerItem::Chords(Box::new(PlayerChordsItem {
                song,
                language: None,
                flow: None,
            }))],
            vec![TocItem {
                idx: 0,
                title: "Title".into(),
                id: Some("song-1".into()),
                nr: String::new(),
                liked: true,
            }],
        );
        let content = RoomContent::from(&player);
        assert!(!content.toc[0].liked);
        assert!(!content.items[0].song.user_specific_addons.liked);
    }

    #[test]
    fn room_content_keeps_only_chord_songs_and_compacts_toc() {
        let mut blob_only = Song {
            id: "blob-song".into(),
            blobs: vec![BlobLink {
                id: "blob-1".into(),
            }],
            ..Default::default()
        };
        blob_only.data.titles = vec!["Blob song".into()];
        let mut chord_song = Song {
            id: "chord-song".into(),
            blobs: vec![BlobLink {
                id: "blob-2".into(),
            }],
            user_specific_addons: SongUserSpecificAddons { liked: true },
            ..Default::default()
        };
        chord_song.data.titles = vec!["Chord song".into()];
        chord_song.data.sections = vec![chordlib::types::Section::new("Verse".into(), vec![])];
        let player = Player::from(crate::song::LinkOwned {
            song: blob_only,
            nr: Some("1".into()),
            key: None,
            tempo: None,
            language: None,
            flow: None,
            liked: false,
        }) + Player::from(crate::song::LinkOwned {
            song: chord_song,
            nr: Some("2".into()),
            key: None,
            tempo: None,
            language: None,
            flow: None,
            liked: true,
        }) + Player::from(PlayerMediaItem {
            id: "media-1".into(),
            title: "Announcement".into(),
            content: MediaContent::WebPage {
                url: "https://example.com".into(),
            },
        });

        let content = RoomContent::from(&player);

        assert_eq!(content.items.len(), 1);
        assert_eq!(content.items[0].song.id, "chord-song");
        assert!(content.items[0].song.blobs.is_empty());
        assert_eq!(content.toc.len(), 1);
        assert_eq!(content.toc[0].idx, 0);
        assert_eq!(content.toc[0].id.as_deref(), Some("chord-song"));
        assert_eq!(content.toc[0].nr, "2");
    }

    #[test]
    fn older_room_summaries_default_to_allow_queue_additions() {
        let json = r#"{
            "id":"room-1","name":"Room","team_id":"team-1",
            "host_email":"host@example.com","can_close":false,
            "session_count":0,"av_occupied":false,
            "created_at":"2026-01-01T00:00:00Z"
        }"#;
        let summary: RoomSummary = serde_json::from_str(json).unwrap();
        assert!(summary.queue_additions_allowed);
    }
}
