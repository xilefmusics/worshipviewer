use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
#[cfg(feature = "backend")]
use utoipa::ToSchema;

use crate::player::{Player, PlayerItem, TocItem};

#[derive(Debug, Serialize, Deserialize, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
#[cfg_attr(feature = "backend", derive(ToSchema))]
pub enum PlayerRoomSourceType {
    Song,
    Collection,
    Setlist,
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
    pub source_type: PlayerRoomSourceType,
    pub source_id: String,
    pub source_title: String,
    pub host_email: String,
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
    pub musical_state: PlayerRoomMusicalState,
    pub projection: Option<PlayerRoomProjectionPayload>,
    pub participants: Vec<PlayerRoomParticipant>,
    pub revision: u64,
    pub host_lease_expires_at: DateTime<Utc>,
    #[serde(default = "default_guests_allowed")]
    pub guests_allowed: bool,
}

fn default_guests_allowed() -> bool {
    true
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
#[cfg_attr(feature = "backend", derive(ToSchema))]
pub struct CreatePlayerRoom {
    pub source_type: PlayerRoomSourceType,
    pub source_id: String,
    pub host_mode: PlayerRoomMode,
    pub musical_state: PlayerRoomMusicalState,
    pub projection: Option<PlayerRoomProjectionPayload>,
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
}
