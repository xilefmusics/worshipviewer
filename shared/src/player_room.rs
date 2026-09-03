use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
#[cfg(feature = "backend")]
use utoipa::ToSchema;

use crate::player::{Player, PlayerChordsItem, PlayerItem, TocItem};

#[derive(Debug, Serialize, Deserialize, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
#[cfg_attr(feature = "backend", derive(ToSchema))]
pub enum PlayerRoomSourceType {
    Song,
    Collection,
    Setlist,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(tag = "type", rename_all = "snake_case")]
#[cfg_attr(feature = "backend", derive(ToSchema))]
pub enum PlayerRoomSongPool {
    Open,
    Collection { id: String, title: String },
    Setlist { id: String, title: String },
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(tag = "type", rename_all = "snake_case")]
#[cfg_attr(feature = "backend", derive(ToSchema))]
pub enum PlayerRoomSongPoolSelection {
    Open,
    Collection { id: String },
    Setlist { id: String },
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[cfg_attr(feature = "backend", derive(ToSchema))]
pub struct UpdatePlayerRoomSongPool {
    pub pool: PlayerRoomSongPoolSelection,
    pub revision: u64,
}

#[derive(Debug, Serialize, Deserialize, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
#[cfg_attr(feature = "backend", derive(ToSchema))]
pub enum PlayerRoomMode {
    Sheet,
    Av,
    Slide,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
#[cfg_attr(feature = "backend", derive(ToSchema))]
pub struct PlayerRoomContent {
    pub items: Vec<PlayerItem>,
    pub toc: Vec<TocItem>,
}

impl From<&Player> for PlayerRoomContent {
    fn from(player: &Player) -> Self {
        let mut items = player.items().to_vec();
        for item in &mut items {
            if let PlayerItem::Chords(chords) = item {
                chords.song.user_specific_addons.liked = false;
            }
        }
        let toc = player
            .toc()
            .iter()
            .cloned()
            .map(|mut row| {
                row.liked = false;
                row
            })
            .collect();
        Self { items, toc }
    }
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Default)]
#[cfg_attr(feature = "backend", derive(ToSchema))]
pub struct PlayerRoomMusicalState {
    pub item_index: usize,
    pub language: Option<String>,
    pub transposition: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Default)]
#[cfg_attr(feature = "backend", derive(ToSchema))]
pub struct PlayerRoomProjectionPayload {
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
pub struct PlayerRoomQueueItem {
    pub id: String,
    pub song_id: String,
    pub title: String,
    pub song: Box<PlayerChordsItem>,
    pub added_by: String,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
#[cfg_attr(feature = "backend", derive(ToSchema))]
pub struct PlayerRoomParticipant {
    pub id: String,
    pub mode: PlayerRoomMode,
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
pub struct PlayerRoomSummary {
    pub id: String,
    pub name: String,
    pub team_id: String,
    pub source_type: Option<PlayerRoomSourceType>,
    pub source_id: Option<String>,
    pub source_title: Option<String>,
    #[serde(default = "default_song_pool")]
    pub song_pool: PlayerRoomSongPool,
    pub host_email: String,
    #[serde(default)]
    pub can_close: bool,
    pub participant_count: usize,
    pub av_occupied: bool,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
#[cfg_attr(feature = "backend", derive(ToSchema))]
pub struct PlayerRoomSnapshot {
    #[serde(flatten)]
    pub summary: PlayerRoomSummary,
    pub content: PlayerRoomContent,
    #[serde(default)]
    pub queue: Vec<PlayerRoomQueueItem>,
    pub musical_state: PlayerRoomMusicalState,
    pub projection: Option<PlayerRoomProjectionPayload>,
    pub participants: Vec<PlayerRoomParticipant>,
    pub revision: u64,
    pub host_lease_expires_at: DateTime<Utc>,
    #[serde(default = "default_guests_allowed")]
    pub guests_allowed: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
#[cfg_attr(feature = "backend", derive(ToSchema))]
pub struct AddPlayerRoomQueueItem {
    pub song_id: String,
    pub revision: u64,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
#[cfg_attr(feature = "backend", derive(ToSchema))]
pub struct ReorderPlayerRoomQueue {
    pub queue_ids: Vec<String>,
    pub revision: u64,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
#[cfg_attr(feature = "backend", derive(ToSchema))]
pub struct PlayerRoomQueueRevision {
    pub revision: u64,
}

fn default_guests_allowed() -> bool {
    true
}

fn default_song_pool() -> PlayerRoomSongPool {
    PlayerRoomSongPool::Open
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
#[cfg_attr(feature = "backend", derive(ToSchema))]
pub struct CreatePlayerRoom {
    pub team_id: String,
    #[serde(default)]
    pub name: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
#[cfg_attr(feature = "backend", derive(ToSchema))]
pub struct JoinPlayerRoom {
    pub mode: PlayerRoomMode,
    #[serde(default)]
    pub hide_chords: bool,
    pub resume_credential: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
#[cfg_attr(feature = "backend", derive(ToSchema))]
pub struct InspectPlayerRoomInvite {
    pub invite_secret: String,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
#[cfg_attr(feature = "backend", derive(ToSchema))]
pub struct JoinPlayerRoomInvite {
    pub invite_secret: String,
    pub display_name: String,
    pub mode: PlayerRoomMode,
    #[serde(default)]
    pub hide_chords: bool,
    pub resume_credential: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
#[cfg_attr(feature = "backend", derive(ToSchema))]
pub struct PlayerRoomInviteInfo {
    pub room_id: String,
    pub name: String,
    pub host_email: String,
    pub av_occupied: bool,
    #[serde(default = "default_guests_allowed")]
    pub guests_allowed: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
#[cfg_attr(feature = "backend", derive(ToSchema))]
pub struct PlayerRoomCredentials {
    pub room_id: String,
    pub participant_id: String,
    pub mode: PlayerRoomMode,
    pub resume_credential: String,
    pub connection_ticket: String,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
#[cfg_attr(feature = "backend", derive(ToSchema))]
pub struct CreatedPlayerRoom {
    pub room: PlayerRoomSummary,
    pub credentials: PlayerRoomCredentials,
    pub invite_secret: String,
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        player::{Player, PlayerChordsItem, PlayerItem},
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
        let content = PlayerRoomContent::from(&player);
        assert!(!content.toc[0].liked);
        let PlayerItem::Chords(item) = &content.items[0] else {
            panic!("expected chords")
        };
        assert!(!item.song.user_specific_addons.liked);
    }

    #[test]
    fn song_pool_values_roundtrip_with_tagged_json() {
        let pool = PlayerRoomSongPool::Collection {
            id: "collection-1".into(),
            title: "Sunday songs".into(),
        };
        let json = serde_json::to_string(&pool).expect("song pool JSON");
        assert_eq!(
            json,
            r#"{"type":"collection","id":"collection-1","title":"Sunday songs"}"#
        );
        assert_eq!(
            serde_json::from_str::<PlayerRoomSongPool>(&json).unwrap(),
            pool
        );

        let selection = PlayerRoomSongPoolSelection::Setlist {
            id: "setlist-1".into(),
        };
        assert_eq!(
            serde_json::from_str::<PlayerRoomSongPoolSelection>(
                r#"{"type":"setlist","id":"setlist-1"}"#
            )
            .unwrap(),
            selection
        );
    }

    #[test]
    fn older_room_summaries_default_to_open_song_pool() {
        let json = r#"{
            "id":"room-1","name":"Room","team_id":"team-1",
            "source_type":null,"source_id":null,"source_title":null,
            "host_email":"host@example.com","can_close":false,
            "participant_count":0,"av_occupied":false,
            "created_at":"2026-01-01T00:00:00Z"
        }"#;
        let summary: PlayerRoomSummary = serde_json::from_str(json).unwrap();
        assert_eq!(summary.song_pool, PlayerRoomSongPool::Open);
    }
}
