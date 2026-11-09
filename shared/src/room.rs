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

/// Immutable chord-song content captured from the selected source at creation.
#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
#[cfg_attr(feature = "backend", derive(ToSchema))]
pub struct RoomContent {
    pub items: Vec<PlayerChordsItem>,
    pub toc: Vec<TocItem>,
}

impl RoomContent {
    /// Strip personal and player-only data before a song enters the room snapshot.
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
    fn captured_room_strips_user_likes() {
        use crate::player::{PlayerBackground, PlayerBackgroundImage};
        let mut song = Song {
            id: "song-1".into(),
            user_specific_addons: SongUserSpecificAddons { liked: true },
            ..Default::default()
        };
        song.data.titles = vec!["Title".into()];
        let player = Player::new(
            vec![PlayerItem::Chords(Box::new(PlayerChordsItem {
                song,
                capo_shape: None,
                language: None,
                flow: None,
            }))],
            vec![TocItem {
                idx: 0,
                title: "Title".into(),
                id: Some("song-1".into()),
                nr: String::new(),
                liked: true,
                background: Some(PlayerBackground {
                    preset: 2,
                    image: Some(PlayerBackgroundImage {
                        media_id: "media-bg".into(),
                        asset_id: "asset-bg".into(),
                    }),
                    video: None,
                }),
            }],
        );
        let content = RoomContent::from(&player);
        assert!(!content.toc[0].liked);
        assert_eq!(content.toc[0].background, player.toc()[0].background);
        assert!(!content.items[0].song.user_specific_addons.liked);
    }

    #[test]
    fn captured_content_keeps_only_chord_songs_and_compacts_toc() {
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
            capo_shape: None,
            tempo: None,
            language: None,
            flow: None,
            background: None,
            liked: false,
        }) + Player::from(crate::song::LinkOwned {
            song: chord_song,
            nr: Some("2".into()),
            key: None,
            capo_shape: None,
            tempo: None,
            language: None,
            flow: None,
            background: None,
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
}
