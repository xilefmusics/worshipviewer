//! Internal contract for the replacement room protocol. See
//! `docs/architecture/room-message-contract.md` for wire and persistence rules.

use std::collections::{BTreeMap, BTreeSet, HashMap};

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use thiserror::Error;
#[cfg(feature = "backend")]
use utoipa::ToSchema;

/// An epoch is reserved durably before a server starts accepting room changes.
/// Sequence numbers start at one in each epoch and may have gaps in history.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[cfg_attr(feature = "backend", derive(ToSchema))]
pub struct RoomMessageOrder {
    pub epoch: u64,
    pub sequence: u64,
}

/// A preset plus an optional custom media image reference for the room AV background.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "backend", derive(ToSchema))]
pub struct RoomBackground {
    pub preset: u8,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub image: Option<RoomBackgroundImage>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "backend", derive(ToSchema))]
pub struct RoomBackgroundImage {
    pub media_id: String,
    pub asset_id: String,
}

impl RoomBackground {
    pub fn is_valid(&self) -> bool {
        self.preset <= 4
            && self.image.as_ref().is_none_or(|image| {
                !image.media_id.trim().is_empty()
                    && image.media_id.len() <= 128
                    && !image.asset_id.trim().is_empty()
                    && image.asset_id.len() <= 128
            })
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "backend", derive(ToSchema))]
#[serde(rename_all = "snake_case")]
pub enum RoomAvTextAlign {
    Left,
    Center,
    Right,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "backend", derive(ToSchema))]
#[serde(rename_all = "snake_case")]
pub enum RoomAvVerticalAlign {
    Top,
    Center,
    Bottom,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "backend", derive(ToSchema))]
#[serde(rename_all = "snake_case")]
pub enum RoomAvHorizontalAlign {
    Left,
    Center,
    Right,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "backend", derive(ToSchema))]
#[serde(rename_all = "snake_case")]
pub enum RoomAvTextShadow {
    None,
    Subtle,
    Medium,
    Strong,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "backend", derive(ToSchema))]
#[serde(rename_all = "snake_case")]
pub enum RoomAvTextTransform {
    None,
    Uppercase,
    Lowercase,
    Capitalize,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "backend", derive(ToSchema))]
#[serde(rename_all = "snake_case")]
pub enum RoomAvTransitionStyle {
    None,
    Fade,
    Slide,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "backend", derive(ToSchema))]
#[serde(rename_all = "snake_case")]
pub enum RoomAvScreenState {
    Live,
    Blank,
    Blackout,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "backend", derive(ToSchema))]
pub struct RoomAvContentLayer {
    pub max_lines_per_slide: u8,
    pub balance_slide_lines: bool,
    pub font_size: u8,
    pub text_align: RoomAvTextAlign,
    pub vertical_align: RoomAvVerticalAlign,
    pub horizontal_align: RoomAvHorizontalAlign,
    pub text_shadow: RoomAvTextShadow,
    pub text_transform: RoomAvTextTransform,
    pub primary_text_lightness: u8,
    pub secondary_text_lightness: u8,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "backend", derive(ToSchema))]
pub struct RoomAvTransition {
    pub style: RoomAvTransitionStyle,
    pub duration_ms: u16,
}

/// Rendering settings shared by the AV controller with slide-only room members.
/// Output-window preferences remain local; the room background uses its own change.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "backend", derive(ToSchema))]
pub struct RoomAvConfiguration {
    pub content_layer: RoomAvContentLayer,
    pub transition: RoomAvTransition,
    pub bilingual_enabled: bool,
    pub collapse_lyric_whitespace: bool,
    pub language_by_item: BTreeMap<String, usize>,
    pub screen_state: RoomAvScreenState,
}

impl RoomAvConfiguration {
    pub fn is_valid(&self, song_count: usize) -> bool {
        (1..=10).contains(&self.content_layer.max_lines_per_slide)
            && (20..=120).contains(&self.content_layer.font_size)
            && self.content_layer.primary_text_lightness <= 100
            && self.content_layer.secondary_text_lightness <= 100
            && self.transition.duration_ms <= 2000
            && self.language_by_item.len() <= song_count
            && self.language_by_item.iter().all(|(song, language)| {
                song.parse::<usize>().is_ok_and(|index| index < song_count) && *language <= 255
            })
    }
}

/// Ordered navigation, vote, AV configuration and background events for a fixed room snapshot.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "backend", derive(ToSchema))]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum RoomChange {
    /// Selecting a song for the first time or selecting it again is an activation.
    /// Section or slide-only navigation sets `activate` to false.
    Selection {
        song: usize,
        /// Source section index. Absent only for legacy messages that used `slide` for this value.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        section: Option<usize>,
        /// Zero-based rendered AV slide index within the selected song.
        slide: usize,
        activate: bool,
    },
    /// Sets this visit's vote, rather than toggling its current value.
    Vote { song: usize, voted: bool },
    /// Replaces the shared AV background layer.
    SetBackground { background: RoomBackground },
    /// Replaces the AV rendering configuration used by slide-only members.
    SetAvConfiguration { configuration: RoomAvConfiguration },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "backend", derive(ToSchema))]
pub struct RoomMessage {
    pub id: String,
    pub room_id: String,
    /// Set from the authenticated connection, never from the submitted payload.
    pub visit_id: String,
    pub order: RoomMessageOrder,
    pub change: RoomChange,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "backend", derive(ToSchema))]
pub struct MessageRoomSummary {
    pub id: String,
    pub name: String,
    pub team_id: String,
    pub song_count: usize,
    #[serde(default)]
    pub can_delete: bool,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "backend", derive(ToSchema))]
pub struct MessageRoomCredentials {
    pub room_id: String,
    pub visit_id: String,
    pub resume_credential: String,
    pub connection_ticket: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[cfg_attr(feature = "backend", derive(ToSchema))]
pub struct MessageRoomReplay {
    pub room: crate::room::RoomContent,
    pub room_name: String,
    pub created_at: DateTime<Utc>,
    pub history: Vec<RoomMessage>,
    pub boundary: RoomMessageOrder,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "backend", derive(ToSchema))]
pub struct MessageRoomJoin {
    #[serde(default)]
    pub resume_credential: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "backend", derive(ToSchema))]
pub struct MessageRoomMember {
    pub visit_id: String,
    pub display_name: String,
    pub joined_at: DateTime<Utc>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum MessageRoomClientEvent {
    Authenticate { ticket: String },
    Change { id: String, change: RoomChange },
    HistoryReady,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum MessageRoomServerEvent {
    Authorized {
        room_id: String,
        boundary: RoomMessageOrder,
        members: Vec<MessageRoomMember>,
    },
    Change {
        message: RoomMessage,
    },
    Presence {
        members: Vec<MessageRoomMember>,
    },
    Error {
        code: String,
    },
}

#[derive(Debug, Clone, PartialEq, Eq, Error)]
pub enum RoomReplayError {
    #[error("message belongs to another room")]
    WrongRoom,
    #[error("message has an empty identifier or invalid order")]
    InvalidEnvelope,
    #[error("song or section does not exist in the captured room")]
    InvalidReference,
    #[error("message ID was reused for a different message")]
    ConflictingId,
    #[error("messages are not in strictly increasing order")]
    OutOfOrder,
}

#[derive(Debug, Clone, PartialEq, Eq, Default)]
struct SongState {
    played: bool,
    voters: BTreeSet<String>,
}

/// Deterministic replay state. Missing messages are not detected or repaired.
#[derive(Debug, Clone)]
pub struct RoomReplay {
    room_id: String,
    section_counts: Vec<usize>,
    songs: Vec<SongState>,
    selection: Option<(usize, usize, usize)>,
    background: Option<RoomBackground>,
    av_configuration: Option<RoomAvConfiguration>,
    last_order: Option<RoomMessageOrder>,
    seen: HashMap<String, RoomMessage>,
}

impl RoomReplay {
    /// One source-section count per captured song, in source order.
    pub fn new(room_id: String, section_counts: Vec<usize>) -> Self {
        Self {
            room_id,
            songs: vec![SongState::default(); section_counts.len()],
            section_counts,
            selection: None,
            background: None,
            av_configuration: None,
            last_order: None,
            seen: HashMap::new(),
        }
    }

    /// Apply a saved or echoed message. Identical retries are harmless even if
    /// they arrive after newer messages; conflicting reuse of an ID is rejected.
    pub fn apply(&mut self, message: RoomMessage) -> Result<(), RoomReplayError> {
        if message.room_id != self.room_id {
            return Err(RoomReplayError::WrongRoom);
        }
        if message.id.is_empty()
            || message.visit_id.is_empty()
            || message.order.epoch == 0
            || message.order.sequence == 0
        {
            return Err(RoomReplayError::InvalidEnvelope);
        }
        if let Some(previous) = self.seen.get(&message.id) {
            return if previous == &message {
                Ok(())
            } else {
                Err(RoomReplayError::ConflictingId)
            };
        }
        if self.last_order.is_some_and(|order| message.order <= order) {
            return Err(RoomReplayError::OutOfOrder);
        }
        match message.change {
            RoomChange::Selection {
                song,
                section,
                slide,
                activate,
            } => {
                // Older persisted messages used `slide` for the source section.
                let legacy_message = section.is_none();
                let section = section.unwrap_or(slide);
                let slide = if legacy_message { 0 } else { slide };
                if self
                    .section_counts
                    .get(song)
                    .is_none_or(|count| section >= *count)
                {
                    return Err(RoomReplayError::InvalidReference);
                }
                self.selection = Some((song, section, slide));
                if activate {
                    self.songs[song].played = true;
                    self.songs[song].voters.clear();
                }
            }
            RoomChange::Vote { song, voted } => {
                let state = self
                    .songs
                    .get_mut(song)
                    .ok_or(RoomReplayError::InvalidReference)?;
                if voted {
                    state.voters.insert(message.visit_id.clone());
                    state.played = false;
                } else {
                    state.voters.remove(&message.visit_id);
                }
            }
            RoomChange::SetBackground { ref background } => {
                if !background.is_valid() {
                    return Err(RoomReplayError::InvalidReference);
                }
                self.background = Some(background.clone());
            }
            RoomChange::SetAvConfiguration { ref configuration } => {
                if !configuration.is_valid(self.section_counts.len()) {
                    return Err(RoomReplayError::InvalidReference);
                }
                self.av_configuration = Some(configuration.clone());
            }
        }
        self.last_order = Some(message.order);
        self.seen.insert(message.id.clone(), message);
        Ok(())
    }

    pub fn selection(&self) -> Option<(usize, usize, usize)> {
        self.selection
    }

    pub fn background(&self) -> Option<&RoomBackground> {
        self.background.as_ref()
    }

    pub fn av_configuration(&self) -> Option<&RoomAvConfiguration> {
        self.av_configuration.as_ref()
    }

    /// Unplayed first, then descending votes, then the immutable source index.
    pub fn ranked_songs(&self) -> Vec<usize> {
        let mut indices: Vec<_> = (0..self.songs.len()).collect();
        indices.sort_by_key(|&index| {
            (
                self.songs[index].played,
                std::cmp::Reverse(self.songs[index].voters.len()),
                index,
            )
        });
        indices
    }

    pub fn played(&self, song: usize) -> Option<bool> {
        self.songs.get(song).map(|state| state.played)
    }
    pub fn votes(&self, song: usize) -> Option<usize> {
        self.songs.get(song).map(|state| state.voters.len())
    }
    pub fn has_vote(&self, song: usize, visit_id: &str) -> Option<bool> {
        self.songs
            .get(song)
            .map(|state| state.voters.contains(visit_id))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn av_configuration() -> RoomAvConfiguration {
        RoomAvConfiguration {
            content_layer: RoomAvContentLayer {
                max_lines_per_slide: 4,
                balance_slide_lines: true,
                font_size: 50,
                text_align: RoomAvTextAlign::Center,
                vertical_align: RoomAvVerticalAlign::Center,
                horizontal_align: RoomAvHorizontalAlign::Center,
                text_shadow: RoomAvTextShadow::Subtle,
                text_transform: RoomAvTextTransform::None,
                primary_text_lightness: 100,
                secondary_text_lightness: 80,
            },
            transition: RoomAvTransition {
                style: RoomAvTransitionStyle::Fade,
                duration_ms: 300,
            },
            bilingual_enabled: true,
            collapse_lyric_whitespace: false,
            language_by_item: BTreeMap::from([(String::from("0"), 1)]),
            screen_state: RoomAvScreenState::Live,
        }
    }

    fn message(sequence: u64, visit: &str, change: RoomChange) -> RoomMessage {
        RoomMessage {
            id: format!("message-{sequence}"),
            room_id: "room".into(),
            visit_id: visit.into(),
            order: RoomMessageOrder { epoch: 1, sequence },
            change,
        }
    }

    #[test]
    fn replay_ranks_permanent_songs_and_retains_visit_votes() {
        let mut replay = RoomReplay::new("room".into(), vec![2, 1, 1]);
        assert_eq!(replay.ranked_songs(), vec![0, 1, 2]);
        let changes = [
            message(
                1,
                "first",
                RoomChange::Selection {
                    song: 0,
                    section: Some(1),
                    slide: 1,
                    activate: true,
                },
            ),
            message(
                2,
                "first",
                RoomChange::Vote {
                    song: 0,
                    voted: true,
                },
            ),
            message(
                3,
                "second-visit",
                RoomChange::Vote {
                    song: 0,
                    voted: true,
                },
            ),
            message(
                4,
                "first",
                RoomChange::Vote {
                    song: 0,
                    voted: false,
                },
            ),
        ];
        for change in changes {
            replay.apply(change).unwrap();
        }
        assert_eq!(replay.selection(), Some((0, 1, 1)));
        assert_eq!(replay.votes(0), Some(1));
        assert_eq!(replay.played(0), Some(false));
        assert_eq!(replay.ranked_songs(), vec![0, 1, 2]);
        replay
            .apply(message(
                5,
                "first",
                RoomChange::Selection {
                    song: 0,
                    section: Some(0),
                    slide: 0,
                    activate: true,
                },
            ))
            .unwrap();
        assert_eq!(replay.votes(0), Some(0));
        assert_eq!(replay.ranked_songs(), vec![1, 2, 0]);
        replay
            .apply(message(
                6,
                "first",
                RoomChange::Selection {
                    song: 1,
                    section: Some(0),
                    slide: 0,
                    activate: false,
                },
            ))
            .unwrap();
        assert_eq!(replay.played(1), Some(false));
    }

    #[test]
    fn duplicates_order_validation_and_gaps() {
        let mut replay = RoomReplay::new("room".into(), vec![1]);
        let first = message(
            1,
            "visit",
            RoomChange::Vote {
                song: 0,
                voted: true,
            },
        );
        replay.apply(first.clone()).unwrap();
        replay
            .apply(message(
                3,
                "visit",
                RoomChange::Selection {
                    song: 0,
                    section: Some(0),
                    slide: 0,
                    activate: false,
                },
            ))
            .unwrap();
        replay.apply(first.clone()).unwrap();
        let mut conflict = first;
        conflict.change = RoomChange::Vote {
            song: 0,
            voted: false,
        };
        assert_eq!(replay.apply(conflict), Err(RoomReplayError::ConflictingId));
        assert_eq!(
            replay.apply(message(
                2,
                "visit",
                RoomChange::Vote {
                    song: 0,
                    voted: false
                }
            )),
            Err(RoomReplayError::OutOfOrder)
        );
        assert_eq!(
            replay.apply(message(
                4,
                "visit",
                RoomChange::Selection {
                    song: 0,
                    section: Some(1),
                    slide: 1,
                    activate: true
                }
            )),
            Err(RoomReplayError::InvalidReference)
        );
        let mut after_restart = message(
            1,
            "visit",
            RoomChange::Vote {
                song: 0,
                voted: false,
            },
        );
        after_restart.id = "new-epoch".into();
        after_restart.order.epoch = 2;
        replay.apply(after_restart).unwrap();
        assert_eq!(replay.votes(0), Some(0));
        assert_eq!(replay.selection(), Some((0, 0, 0)));
    }

    #[test]
    fn missing_activation_is_not_reconstructed_by_slide_selection() {
        let mut replay = RoomReplay::new("room".into(), vec![1]);
        replay
            .apply(message(
                2,
                "visit",
                RoomChange::Selection {
                    song: 0,
                    section: Some(0),
                    slide: 0,
                    activate: false,
                },
            ))
            .unwrap();
        assert_eq!(replay.selection(), Some((0, 0, 0)));
        assert_eq!(replay.played(0), Some(false));
    }

    #[test]
    fn replays_latest_valid_background_and_rejects_invalid_values() {
        let background = RoomBackground {
            preset: 2,
            image: Some(RoomBackgroundImage {
                media_id: "media:one".into(),
                asset_id: "asset:one".into(),
            }),
        };
        let mut replay = RoomReplay::new("room".into(), vec![1]);
        replay
            .apply(message(
                1,
                "visit",
                RoomChange::SetBackground {
                    background: background.clone(),
                },
            ))
            .unwrap();
        assert_eq!(replay.background(), Some(&background));
        assert_eq!(replay.selection(), None);

        assert_eq!(
            replay.apply(message(
                2,
                "visit",
                RoomChange::SetBackground {
                    background: RoomBackground {
                        preset: 5,
                        image: None,
                    },
                },
            )),
            Err(RoomReplayError::InvalidReference)
        );
    }

    #[test]
    fn replays_shared_av_configuration_and_rejects_invalid_values() {
        let configuration = av_configuration();
        let mut replay = RoomReplay::new("room".into(), vec![1]);
        replay
            .apply(message(
                1,
                "host",
                RoomChange::SetAvConfiguration {
                    configuration: configuration.clone(),
                },
            ))
            .unwrap();
        assert_eq!(replay.av_configuration(), Some(&configuration));

        let mut invalid = av_configuration();
        invalid.content_layer.max_lines_per_slide = 0;
        assert_eq!(
            replay.apply(message(
                2,
                "host",
                RoomChange::SetAvConfiguration {
                    configuration: invalid,
                },
            )),
            Err(RoomReplayError::InvalidReference)
        );
    }
}
