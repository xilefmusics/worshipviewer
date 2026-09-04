use std::{
    collections::{HashMap, HashSet},
    sync::Arc,
};

use chrono::{DateTime, Duration, Utc};
use rand::RngExt;
use ring::{
    digest,
    rand::{SecureRandom, SystemRandom},
};
use serde::Deserialize;
use surrealdb::types::{Datetime, RecordId, SurrealValue};
use tokio::sync::{RwLock, broadcast};
use uuid::Uuid;

use shared::player::{PlayerItem, TocItem};
use shared::room::*;

use crate::{
    database::{Database, record_id_string, surreal_take_errors},
    error::AppError,
    resources::song::LikedSongIds,
};

const LEASE_SECONDS: i64 = 30;
const TICKET_SECONDS: i64 = 60;
const MAX_GUEST_NAME: usize = 80;
const MAX_ROOM_NAME: usize = 80;
const MAX_PROJECTION_BYTES: usize = 256 * 1024;

const ROOM_NAME_VERBS: &[&str] = &[
    "Praise",
    "Sing",
    "Worship",
    "Pray",
    "Rejoice",
    "Glorify",
    "Exalt",
    "Serve",
    "Gather",
    "Celebrate",
    "Proclaim",
];
const ROOM_NAME_NOUNS: &[&str] = &[
    "Hymn",
    "Psalm",
    "Chorus",
    "Grace",
    "Hallelujah",
    "Amen",
    "Light",
    "Song",
    "Praise",
    "Gospel",
    "Worship",
];

#[derive(Clone)]
pub struct RoomService {
    db: Arc<Database>,
    /// Process-local delivery only. Durable room state always comes from the database;
    /// clients on other instances reconcile by revision on their next heartbeat.
    senders: Arc<RwLock<HashMap<String, broadcast::Sender<ServerEvent>>>>,
}

#[derive(Debug, Clone, Deserialize, SurrealValue)]
struct RoomRecord {
    id: RecordId,
    owner: RecordId,
    source_type: Option<String>,
    source_id: Option<String>,
    source_title: Option<String>,
    #[serde(default = "default_room_open")]
    open: bool,
    name: String,
    host_user_id: Option<String>,
    host_email: String,
    musical_state_json: String,
    #[serde(default = "default_queue_json")]
    queue_json: String,
    #[serde(default = "default_queue_votes_json")]
    queue_votes_json: String,
    projection_json: Option<String>,
    revision: i64,
    invite_hash: String,
    host_participant_id: String,
    av_participant_id: Option<String>,
    media_ids: Vec<String>,
    created_at: Datetime,
    host_lease_expires_at: Datetime,
    closed_at: Option<Datetime>,
    #[serde(default = "default_guests_allowed")]
    guests_allowed: bool,
}

#[derive(Debug, Clone, Deserialize, SurrealValue)]
struct RoomSummaryRecord {
    id: RecordId,
    owner: RecordId,
    source_type: Option<String>,
    source_id: Option<String>,
    source_title: Option<String>,
    #[serde(default = "default_room_open")]
    open: bool,
    name: String,
    host_user_id: Option<String>,
    host_email: String,
    av_participant_id: Option<String>,
    created_at: Datetime,
}

#[derive(Debug, Clone, Deserialize, SurrealValue)]
struct BlobOwnerRecord {
    owner: RecordId,
}

#[derive(Debug, Clone, Deserialize, SurrealValue)]
struct ParticipantRecord {
    participant_id: String,
    user_id: Option<String>,
    display_name: String,
    avatar_url: Option<String>,
    anonymous: bool,
    mode: String,
    #[serde(default)]
    hide_chords: bool,
    resume_hash: String,
    connected: bool,
    lease_expires_at: Datetime,
}

#[derive(Debug, Clone, Deserialize, SurrealValue)]
struct SnapshotRecord {
    content_json: String,
}

#[derive(Debug, Clone, Deserialize, SurrealValue)]
struct TicketRecord {
    room: RecordId,
    participant_id: String,
}

#[derive(Debug, Clone, Deserialize, SurrealValue)]
struct RevisionRecord {
    revision: i64,
    host_lease_expires_at: Datetime,
}

#[derive(Debug, Clone, Deserialize, SurrealValue)]
struct HeartbeatParticipantRecord {
    participant_id: String,
}

struct RoomAggregate {
    room: RoomRecord,
    content: RoomContent,
    queue: Vec<RoomQueueItem>,
    queue_votes: HashMap<String, Vec<String>>,
    musical_state: RoomMusicalState,
    projection: Option<RoomProjectionPayload>,
    open: bool,
    participants: Vec<ParticipantRecord>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ClientEvent {
    Authenticate {
        ticket: String,
    },
    Heartbeat {
        #[serde(default)]
        revision: Option<u64>,
    },
    UpdateMusicalState {
        command_id: String,
        musical_state: RoomMusicalState,
    },
    UpdateProjection {
        command_id: String,
        projection: RoomProjectionPayload,
    },
    UpdateGuestsAllowed {
        command_id: String,
        guests_allowed: bool,
    },
    UpdateQueueVote {
        command_id: String,
        queue_id: String,
        upvoted: bool,
        revision: u64,
    },
    RequestSnapshot,
    Leave,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ServerEvent {
    Snapshot {
        snapshot: Box<RoomSnapshot>,
    },
    Heartbeat {
        revision: u64,
        host_lease_expires_at: DateTime<Utc>,
    },
    MusicalStateUpdated {
        musical_state: RoomMusicalState,
        revision: u64,
    },
    ProjectionUpdated {
        projection: RoomProjectionPayload,
        revision: u64,
    },
    QueueUpdated {
        queue: Vec<RoomQueueItem>,
        revision: u64,
    },
    GuestsAllowedUpdated {
        guests_allowed: bool,
        revision: u64,
    },
    QueueAccessUpdated {
        open: bool,
        revision: u64,
    },
    ParticipantsChanged {
        participants: Vec<RoomParticipant>,
        participant_count: usize,
        av_occupied: bool,
        revision: u64,
    },
    CommandAccepted {
        command_id: String,
        revision: u64,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        queue_id: Option<String>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        upvoted: Option<bool>,
    },
    CommandRejected {
        command_id: String,
        reason: String,
        revision: u64,
    },
    RoomEnded,
}

pub struct CreateRoomInput {
    pub team_id: String,
    pub name: Option<String>,
    pub host_user_id: String,
    pub host_email: String,
    pub host_avatar_url: Option<String>,
    pub source_type: Option<RoomSourceType>,
    pub source_id: Option<String>,
    pub source_title: Option<String>,
    pub content: RoomContent,
    pub initial_queue: Vec<RoomQueueItem>,
    pub host_mode: RoomMode,
    pub musical_state: RoomMusicalState,
    pub projection: Option<RoomProjectionPayload>,
}

fn default_guests_allowed() -> bool {
    true
}

fn default_queue_json() -> String {
    "[]".into()
}

fn default_queue_votes_json() -> String {
    "{}".into()
}

fn default_room_open() -> bool {
    true
}

impl RoomService {
    pub fn new(db: Arc<Database>) -> Self {
        Self {
            db,
            senders: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    fn secret() -> Result<String, AppError> {
        let mut bytes = [0u8; 32];
        SystemRandom::new()
            .fill(&mut bytes)
            .map_err(|_| AppError::Internal("secure random generation failed".into()))?;
        Ok(hex::encode(bytes))
    }

    fn generated_room_name() -> String {
        let mut rng = rand::rng();
        let verb = ROOM_NAME_VERBS[rng.random_range(0..ROOM_NAME_VERBS.len())];
        let noun = ROOM_NAME_NOUNS[rng.random_range(0..ROOM_NAME_NOUNS.len())];
        format!("{verb} {noun}")
    }

    fn hash(secret: &str) -> String {
        hex::encode(digest::digest(&digest::SHA256, secret.as_bytes()))
    }

    fn source_type_to_db(source_type: RoomSourceType) -> &'static str {
        match source_type {
            RoomSourceType::Song => "song",
            RoomSourceType::Collection => "collection",
            RoomSourceType::Setlist => "setlist",
        }
    }

    fn source_type_from_db(value: Option<&str>) -> Result<Option<RoomSourceType>, AppError> {
        match value {
            None => Ok(None),
            Some("song") => Ok(Some(RoomSourceType::Song)),
            Some("collection") => Ok(Some(RoomSourceType::Collection)),
            Some("setlist") => Ok(Some(RoomSourceType::Setlist)),
            _ => Err(AppError::database("invalid room source type")),
        }
    }

    fn mode_to_db(mode: RoomMode) -> &'static str {
        match mode {
            RoomMode::Sheet => "sheet",
            RoomMode::Av => "av",
            RoomMode::Slide => "slide",
        }
    }

    fn mode_from_db(value: &str) -> Result<RoomMode, AppError> {
        match value {
            "sheet" => Ok(RoomMode::Sheet),
            "av" => Ok(RoomMode::Av),
            "slide" => Ok(RoomMode::Slide),
            _ => Err(AppError::database("invalid room participant mode")),
        }
    }

    fn effective_language_is_available(song: &chordlib::types::Song, candidate: &str) -> bool {
        let lyric_track_count = song
            .sections
            .iter()
            .flat_map(|section| &section.lines)
            .flat_map(|line| &line.parts)
            .map(|part| part.languages.len())
            .max()
            .unwrap_or_default();
        let count = song.languages.len().max(lyric_track_count);
        (0..count).any(|index| {
            song.languages
                .get(index)
                .map(|language| language.trim())
                .filter(|language| !language.is_empty())
                .map_or_else(
                    || format!("L{}", index + 1) == candidate,
                    |language| language == candidate,
                )
        })
    }

    fn validate_state(content: &RoomContent, state: &RoomMusicalState) -> Result<(), AppError> {
        let Some(item) = content.items.get(state.item_index) else {
            return Err(AppError::invalid_request("room item index is out of range"));
        };
        match item {
            PlayerItem::Blob(_) if state.language.is_some() || state.transposition.is_some() => {
                Err(AppError::invalid_request(
                    "blob items do not accept language or transposition",
                ))
            }
            PlayerItem::Chords(chords) => {
                if let Some(language) = state.language.as_deref()
                    && !Self::effective_language_is_available(&chords.song.data, language)
                {
                    return Err(AppError::invalid_request(
                        "language is unavailable for this item",
                    ));
                }
                if state
                    .transposition
                    .as_ref()
                    .is_some_and(|key| key.trim().is_empty() || key.len() > 16)
                {
                    return Err(AppError::invalid_request("invalid transposition"));
                }
                Ok(())
            }
            _ => Ok(()),
        }
    }

    fn normalize_initial_language(content: &RoomContent, state: &mut RoomMusicalState) {
        let Some(language) = state.language.as_deref() else {
            return;
        };
        let Some(PlayerItem::Chords(chords)) = content.items.get(state.item_index) else {
            return;
        };
        if !Self::effective_language_is_available(&chords.song.data, language) {
            state.language = None;
        }
    }

    fn validate_projection(projection: &RoomProjectionPayload) -> Result<(), AppError> {
        let size = serde_json::to_vec(projection)
            .map_err(|e| AppError::internal_from_err("room.projection", e))?
            .len();
        if size > MAX_PROJECTION_BYTES {
            return Err(AppError::invalid_request(
                "room projection payload is too large",
            ));
        }
        if !matches!(
            projection.screen_state.as_str(),
            "live" | "blank" | "blackout"
        ) {
            return Err(AppError::invalid_request("invalid projection screen state"));
        }
        Ok(())
    }

    fn collect_media(content: &RoomContent) -> HashSet<String> {
        let mut ids = HashSet::new();
        for item in &content.items {
            match item {
                PlayerItem::Blob(blob) => {
                    ids.insert(blob.blob_id.clone());
                }
                PlayerItem::Chords(chords) => {
                    ids.extend(chords.song.blobs.iter().map(|blob| blob.id.clone()));
                }
                PlayerItem::Media(_) => {}
            }
        }
        ids
    }

    fn is_active(room: &RoomRecord) -> bool {
        room.closed_at.is_none()
    }

    fn participant_is_active(participant: &ParticipantRecord) -> bool {
        let lease: DateTime<Utc> = participant.lease_expires_at.into();
        lease > Utc::now()
    }

    fn public_participant(
        room: &RoomRecord,
        participant: &ParticipantRecord,
    ) -> Result<RoomParticipant, AppError> {
        let mode = Self::mode_from_db(&participant.mode)?;
        Ok(RoomParticipant {
            id: participant.participant_id.clone(),
            mode,
            hide_chords: participant.hide_chords,
            display_name: participant.display_name.clone(),
            avatar_url: participant.avatar_url.clone(),
            anonymous: participant.anonymous,
            connected: participant.connected && Self::participant_is_active(participant),
            is_host: Self::participant_is_host(room, participant),
            is_av_host: room.av_participant_id.as_deref()
                == Some(participant.participant_id.as_str())
                && Self::participant_is_active(participant),
        })
    }

    fn participant_is_host(room: &RoomRecord, participant: &ParticipantRecord) -> bool {
        room.host_user_id.as_deref().map_or_else(
            || participant.participant_id == room.host_participant_id,
            |host_user_id| participant.user_id.as_deref() == Some(host_user_id),
        )
    }

    fn host_user_id<'a>(
        room: &'a RoomRecord,
        participants: &'a [ParticipantRecord],
    ) -> Option<&'a str> {
        room.host_user_id.as_deref().or_else(|| {
            participants
                .iter()
                .find(|participant| participant.participant_id == room.host_participant_id)
                .and_then(|participant| participant.user_id.as_deref())
        })
    }

    fn summary_from_room(
        room: &RoomRecord,
        participants: &[ParticipantRecord],
    ) -> Result<RoomSummary, AppError> {
        let active = participants
            .iter()
            .filter(|participant| Self::participant_is_active(participant))
            .collect::<Vec<_>>();
        let av_occupied = room.av_participant_id.as_ref().is_some_and(|id| {
            active
                .iter()
                .any(|participant| participant.participant_id == *id)
        });
        Ok(RoomSummary {
            id: record_id_string(&room.id),
            name: room.name.clone(),
            team_id: record_id_string(&room.owner),
            source_type: Self::source_type_from_db(room.source_type.as_deref())?,
            source_id: room.source_id.clone(),
            source_title: room.source_title.clone(),
            open: room.open,
            host_email: room.host_email.clone(),
            can_close: false,
            participant_count: active.len(),
            av_occupied,
            created_at: room.created_at.into(),
        })
    }

    fn queue_with_vote_counts(
        queue: &[RoomQueueItem],
        queue_votes: &HashMap<String, Vec<String>>,
    ) -> Vec<RoomQueueItem> {
        let mut queue = queue.to_vec();
        for item in &mut queue {
            item.upvotes = queue_votes
                .get(&item.id)
                .map_or(0, |voters| voters.len() as u64);
        }
        queue
    }

    fn rank_queue(queue: &mut [RoomQueueItem]) {
        queue.sort_by(|left, right| {
            left.played
                .cmp(&right.played)
                .then_with(|| right.upvotes.cmp(&left.upvotes))
        });
    }

    fn ranked_queue(
        queue: &[RoomQueueItem],
        queue_votes: &HashMap<String, Vec<String>>,
    ) -> Vec<RoomQueueItem> {
        let mut queue = Self::queue_with_vote_counts(queue, queue_votes);
        Self::rank_queue(&mut queue);
        queue
    }

    fn snapshot(
        aggregate: &RoomAggregate,
        participant_id: Option<&str>,
    ) -> Result<RoomSnapshot, AppError> {
        let participants = aggregate
            .participants
            .iter()
            .filter(|participant| Self::participant_is_active(participant))
            .map(|participant| Self::public_participant(&aggregate.room, participant))
            .collect::<Result<Vec<_>, _>>()?;
        Ok(RoomSnapshot {
            summary: Self::summary_from_room(&aggregate.room, &aggregate.participants)?,
            content: aggregate.content.clone(),
            queue: Self::ranked_queue(&aggregate.queue, &aggregate.queue_votes),
            voted_queue_ids: participant_id
                .map(|id| {
                    let queue_ids = aggregate
                        .queue
                        .iter()
                        .map(|item| item.id.as_str())
                        .collect::<HashSet<_>>();
                    aggregate
                        .queue_votes
                        .iter()
                        .filter(|(queue_id, voters)| {
                            queue_ids.contains(queue_id.as_str())
                                && voters.iter().any(|voter| voter == id)
                        })
                        .map(|(queue_id, _)| queue_id.clone())
                        .collect()
                })
                .unwrap_or_default(),
            musical_state: aggregate.musical_state.clone(),
            projection: aggregate.projection.clone(),
            participants,
            revision: aggregate.room.revision.max(0) as u64,
            host_lease_expires_at: aggregate.room.host_lease_expires_at.into(),
            guests_allowed: aggregate.room.guests_allowed,
        })
    }

    async fn sender(&self, room_id: &str) -> broadcast::Sender<ServerEvent> {
        if let Some(sender) = self.senders.read().await.get(room_id).cloned() {
            return sender;
        }
        let mut senders = self.senders.write().await;
        senders
            .entry(room_id.to_string())
            .or_insert_with(|| broadcast::channel(128).0)
            .clone()
    }

    async fn publish(&self, room_id: &str, event: ServerEvent) {
        if let Some(sender) = self.senders.read().await.get(room_id).cloned() {
            let _ = sender.send(event);
        }
    }

    async fn load_aggregate(&self, room_id: &str) -> Result<Option<RoomAggregate>, AppError> {
        let mut response = self
            .db
            .db
            .query(
                r#"
SELECT id, owner, source_type, source_id, source_title, name, host_user_id, host_email,
       musical_state_json, queue_json, queue_votes_json, projection_json, revision, open,
       invite_hash, host_participant_id, av_participant_id, media_ids,
       created_at, host_lease_expires_at, closed_at, guests_allowed
FROM ONLY type::record('player_room', $room_id);
SELECT content_json FROM ONLY type::record('player_room_snapshot', $room_id);
SELECT participant_id, user_id, display_name, avatar_url, anonymous, mode,
       hide_chords, resume_hash, connected, lease_expires_at
FROM player_room_participant
WHERE room = type::record('player_room', $room_id);
"#,
            )
            .bind(("room_id", room_id.to_string()))
            .await
            .map_err(|e| crate::log_and_convert!(AppError::database, "room.load", e))?;
        surreal_take_errors("room.load", &mut response)?;
        let Some(room) = response.take::<Option<RoomRecord>>(0)? else {
            return Ok(None);
        };
        let snapshot = response
            .take::<Option<SnapshotRecord>>(1)?
            .ok_or_else(|| AppError::Internal("room snapshot is missing".into()))?;
        let participants = response.take::<Vec<ParticipantRecord>>(2)?;
        let content = serde_json::from_str(&snapshot.content_json)
            .map_err(|e| AppError::internal_from_err("room.snapshot.decode", e))?;
        let musical_state = serde_json::from_str(&room.musical_state_json)
            .map_err(|e| AppError::internal_from_err("room.musical.decode", e))?;
        let queue = serde_json::from_str(&room.queue_json)
            .map_err(|e| AppError::internal_from_err("room.queue.decode", e))?;
        let queue_votes = serde_json::from_str(&room.queue_votes_json)
            .map_err(|e| AppError::internal_from_err("room.queue_votes.decode", e))?;
        let projection = room
            .projection_json
            .as_deref()
            .map(serde_json::from_str)
            .transpose()
            .map_err(|e| AppError::internal_from_err("room.projection.decode", e))?;
        let open = room.open;
        Ok(Some(RoomAggregate {
            room,
            content,
            queue,
            queue_votes,
            musical_state,
            projection,
            open,
            participants,
        }))
    }

    async fn load_active_aggregate(&self, room_id: &str) -> Result<RoomAggregate, AppError> {
        let aggregate = self
            .load_aggregate(room_id)
            .await?
            .ok_or_else(|| AppError::NotFound("room not found".into()))?;
        if !Self::is_active(&aggregate.room) {
            return Err(AppError::NotFound("room has ended".into()));
        }
        Ok(aggregate)
    }

    async fn issue_ticket(&self, room_id: &str, participant_id: &str) -> Result<String, AppError> {
        let ticket = Self::secret()?;
        let now = Utc::now();
        let expires_at = now + Duration::seconds(TICKET_SECONDS);
        let mut response = self
            .db
            .db
            .query(
                "CREATE type::record('player_room_ticket', $id) CONTENT { room: type::record('player_room', $room_id), participant_id: $participant_id, ticket_hash: $ticket_hash, expires_at: $expires_at, consumed_at: NONE }",
            )
            .bind(("id", Uuid::new_v4().to_string()))
            .bind(("room_id", room_id.to_string()))
            .bind(("participant_id", participant_id.to_string()))
            .bind(("ticket_hash", Self::hash(&ticket)))
            .bind(("expires_at", expires_at))
            .await?;
        surreal_take_errors("room.ticket.create", &mut response)?;
        Ok(ticket)
    }

    pub async fn create(&self, mut input: CreateRoomInput) -> Result<CreatedRoom, AppError> {
        Self::normalize_initial_language(&input.content, &mut input.musical_state);
        if !input.content.items.is_empty() {
            Self::validate_state(&input.content, &input.musical_state)?;
        } else if input.musical_state != RoomMusicalState::default() {
            return Err(AppError::invalid_request(
                "an empty room must use the default musical state",
            ));
        }
        if let Some(projection) = &input.projection {
            Self::validate_projection(projection)?;
        }
        if input.host_mode == RoomMode::Slide {
            return Err(AppError::invalid_request(
                "a room host must start in Sheet or AV mode",
            ));
        }

        let now = Utc::now();
        let room_id = Uuid::new_v4().to_string();
        let participant_id = Uuid::new_v4().to_string();
        let invite_secret = Self::secret()?;
        let resume_credential = Self::secret()?;
        let connection_ticket = Self::secret()?;
        let lease = now + Duration::seconds(LEASE_SECONDS);
        let snapshot_json = serde_json::to_string(&input.content)
            .map_err(|e| AppError::internal_from_err("room.snapshot.encode", e))?;
        let queue_json = serde_json::to_string(&input.initial_queue)
            .map_err(|e| AppError::internal_from_err("room.queue.encode", e))?;
        let musical_json = serde_json::to_string(&input.musical_state)
            .map_err(|e| AppError::internal_from_err("room.musical.encode", e))?;
        let projection_json = input
            .projection
            .as_ref()
            .map(serde_json::to_string)
            .transpose()
            .map_err(|e| AppError::internal_from_err("room.projection.encode", e))?;
        let media_ids = Self::collect_media(&input.content)
            .into_iter()
            .chain(input.initial_queue.iter().flat_map(Self::queue_media_ids))
            .collect::<HashSet<_>>();
        let mut media_ids = media_ids.into_iter().collect::<Vec<_>>();
        media_ids.sort();
        let name = input
            .name
            .take()
            .map(|name| name.trim().to_string())
            .filter(|name| !name.is_empty())
            .unwrap_or_else(Self::generated_room_name);
        if name.chars().count() > MAX_ROOM_NAME {
            return Err(AppError::invalid_request("room name is too long"));
        }

        let mut response = self
            .db
            .db
            .query(
                r#"
BEGIN TRANSACTION;
CREATE type::record('player_room', $room_id) CONTENT {
    owner: type::record('team', $team_id), source_type: $source_type,
    source_id: $source_id, source_title: $source_title, name: $name,
    host_user_id: $host_user_id, host_email: $host_email, snapshot_json: NONE, state_json: NONE,
    musical_state_json: $musical_json, queue_json: $queue_json, queue_votes_json: "{}", projection_json: $projection_json,
    open: false,
    revision: 1, invite_hash: $invite_hash, host_participant_id: $participant_id,
    av_participant_id: $av_participant_id, media_ids: $media_ids,
    created_at: $now, host_lease_expires_at: $lease, closed_at: NONE,
    guests_allowed: true
};
CREATE type::record('player_room_snapshot', $room_id) CONTENT {
    room: type::record('player_room', $room_id), content_json: $snapshot_json
};
CREATE type::record('player_room_participant', $participant_row_id) CONTENT {
    room: type::record('player_room', $room_id), participant_id: $participant_id,
    user_id: $user_id, display_name: $display_name, avatar_url: $avatar_url,
    anonymous: false, mode: $mode, hide_chords: false,
    resume_hash: $resume_hash, connected: false, lease_expires_at: $lease,
    joined_at: $now
};
CREATE type::record('player_room_ticket', $ticket_id) CONTENT {
    room: type::record('player_room', $room_id), participant_id: $participant_id,
    ticket_hash: $ticket_hash, expires_at: $ticket_expires_at, consumed_at: NONE
};
COMMIT TRANSACTION;
"#,
            )
            .bind(("room_id", room_id.clone()))
            .bind(("team_id", input.team_id.clone()))
            .bind((
                "source_type",
                input
                    .source_type
                    .map(Self::source_type_to_db)
                    .map(str::to_string),
            ))
            .bind(("source_id", input.source_id.clone()))
            .bind(("source_title", input.source_title.clone()))
            .bind(("name", name.clone()))
            .bind(("host_user_id", input.host_user_id.clone()))
            .bind(("host_email", input.host_email.clone()))
            .bind(("snapshot_json", snapshot_json))
            .bind(("queue_json", queue_json))
            .bind(("musical_json", musical_json))
            .bind(("projection_json", projection_json))
            .bind(("invite_hash", Self::hash(&invite_secret)))
            .bind(("participant_id", participant_id.clone()))
            .bind((
                "av_participant_id",
                (input.host_mode == RoomMode::Av).then(|| participant_id.clone()),
            ))
            .bind(("media_ids", media_ids))
            .bind(("now", now))
            .bind(("lease", lease))
            .bind(("participant_row_id", format!("{room_id}:{participant_id}")))
            .bind(("user_id", Some(input.host_user_id)))
            .bind(("display_name", input.host_email.clone()))
            .bind(("avatar_url", input.host_avatar_url))
            .bind(("mode", Self::mode_to_db(input.host_mode).to_string()))
            .bind(("resume_hash", Self::hash(&resume_credential)))
            .bind(("ticket_id", Uuid::new_v4().to_string()))
            .bind(("ticket_hash", Self::hash(&connection_ticket)))
            .bind(("ticket_expires_at", now + Duration::seconds(TICKET_SECONDS)))
            .await?;
        surreal_take_errors("room.create", &mut response)?;

        let summary = RoomSummary {
            id: room_id.clone(),
            name,
            team_id: input.team_id,
            source_type: input.source_type,
            source_id: input.source_id,
            source_title: input.source_title,
            open: false,
            host_email: input.host_email,
            can_close: true,
            participant_count: 1,
            av_occupied: input.host_mode == RoomMode::Av,
            created_at: now,
        };
        Ok(CreatedRoom {
            room: summary,
            credentials: RoomCredentials {
                room_id,
                participant_id,
                mode: input.host_mode,
                resume_credential,
                connection_ticket,
            },
            invite_secret,
        })
    }

    pub async fn list(
        &self,
        teams: &[String],
        q: Option<&str>,
        user_id: &str,
        closable_teams: &[String],
    ) -> Result<Vec<RoomSummary>, AppError> {
        let owners = teams
            .iter()
            .map(|team| RecordId::new("team", team.clone()))
            .collect::<Vec<_>>();
        let mut response = self
            .db
            .db
            .query(
                r#"
SELECT id, owner, source_type, source_id, source_title, open, name, host_email,
       host_user_id, av_participant_id, created_at
FROM player_room
WHERE owner IN $owners AND closed_at = NONE
ORDER BY created_at DESC;
"#,
            )
            .bind(("owners", owners))
            .await?;
        surreal_take_errors("room.list", &mut response)?;
        let rooms = response.take::<Vec<RoomSummaryRecord>>(0)?;
        if rooms.is_empty() {
            return Ok(Vec::new());
        }
        let room_ids = rooms.iter().map(|room| room.id.clone()).collect::<Vec<_>>();
        let mut response = self
            .db
            .db
            .query(
                "SELECT room, participant_id FROM player_room_participant WHERE room IN $rooms AND lease_expires_at > time::now()",
            )
            .bind(("rooms", room_ids))
            .await?;
        #[derive(Deserialize, SurrealValue)]
        struct ActiveParticipant {
            room: RecordId,
            participant_id: String,
        }
        let active = response.take::<Vec<ActiveParticipant>>(0)?;
        let needle = q.unwrap_or("").trim().to_lowercase();
        let mut summaries = Vec::new();
        for room in rooms {
            let room_id = record_id_string(&room.id);
            let participants = active
                .iter()
                .filter(|participant| participant.room == room.id)
                .collect::<Vec<_>>();
            let haystack = format!(
                "{} {} {}",
                room.name,
                room.source_title.as_deref().unwrap_or_default(),
                room.host_email
            )
            .to_lowercase();
            if !needle.is_empty() && !haystack.contains(&needle) {
                continue;
            }
            let av_occupied = room.av_participant_id.as_ref().is_some_and(|id| {
                participants
                    .iter()
                    .any(|participant| participant.participant_id == *id)
            });
            summaries.push(RoomSummary {
                id: room_id,
                name: room.name,
                team_id: record_id_string(&room.owner),
                source_type: Self::source_type_from_db(room.source_type.as_deref())?,
                source_id: room.source_id,
                source_title: room.source_title,
                open: room.open,
                host_email: room.host_email,
                can_close: room.host_user_id.as_deref() == Some(user_id)
                    || closable_teams.contains(&record_id_string(&room.owner)),
                participant_count: participants.len(),
                av_occupied,
                created_at: room.created_at.into(),
            });
        }
        Ok(summaries)
    }

    pub async fn get_for_teams(
        &self,
        room_id: &str,
        teams: &[String],
    ) -> Result<RoomSnapshot, AppError> {
        let aggregate = self.load_active_aggregate(room_id).await?;
        if !teams.contains(&record_id_string(&aggregate.room.owner)) {
            return Err(AppError::NotFound("room not found".into()));
        }
        Self::snapshot(&aggregate, None)
    }

    #[allow(clippy::too_many_arguments)]
    pub async fn join_authenticated(
        &self,
        room_id: &str,
        user_id: &str,
        email: &str,
        avatar_url: Option<String>,
        mode: RoomMode,
        hide_chords: bool,
        resume: Option<&str>,
        teams: &[String],
    ) -> Result<RoomCredentials, AppError> {
        self.join(
            room_id,
            Some(user_id),
            email,
            avatar_url,
            false,
            mode,
            hide_chords,
            resume,
            Some(teams),
        )
        .await
    }

    #[allow(clippy::too_many_arguments)]
    async fn join(
        &self,
        room_id: &str,
        user_id: Option<&str>,
        display_name: &str,
        avatar_url: Option<String>,
        anonymous: bool,
        mode: RoomMode,
        hide_chords: bool,
        resume: Option<&str>,
        teams: Option<&[String]>,
    ) -> Result<RoomCredentials, AppError> {
        if display_name.trim().is_empty() || display_name.chars().count() > MAX_GUEST_NAME {
            return Err(AppError::invalid_request(
                "display name must be 1-80 characters",
            ));
        }
        let aggregate = self.load_active_aggregate(room_id).await?;
        if teams.is_some_and(|allowed| !allowed.contains(&record_id_string(&aggregate.room.owner)))
        {
            return Err(AppError::NotFound("room has ended".into()));
        }
        if anonymous && !aggregate.room.guests_allowed {
            return Err(AppError::conflict("guests_not_allowed"));
        }

        let host_account = user_id.is_some_and(|user_id| {
            Self::host_user_id(&aggregate.room, &aggregate.participants) == Some(user_id)
        });
        let resume_hash = resume.map(Self::hash);
        let resumed = resume_hash.as_ref().and_then(|hash| {
            aggregate.participants.iter().find(|participant| {
                participant.resume_hash == *hash
                    && Self::participant_is_active(participant)
                    && user_id.is_none_or(|user_id| participant.user_id.as_deref() == Some(user_id))
            })
        });
        let (participant_id, resume_credential, is_new) = if let Some(participant) = resumed {
            if Self::mode_from_db(&participant.mode)? != mode {
                return Err(AppError::conflict(
                    "participant mode is fixed; leave and join again",
                ));
            }
            (
                participant.participant_id.clone(),
                resume.unwrap().to_string(),
                false,
            )
        } else {
            (Uuid::new_v4().to_string(), Self::secret()?, true)
        };

        if mode == RoomMode::Av
            && aggregate.room.av_participant_id.as_ref().is_some_and(|id| {
                id != &participant_id
                    && aggregate.participants.iter().any(|participant| {
                        participant.participant_id == *id
                            && Self::participant_is_active(participant)
                    })
            })
        {
            return Err(AppError::conflict("AV mode is already occupied"));
        }

        let now = Utc::now();
        let lease = now + Duration::seconds(LEASE_SECONDS);
        let ticket = Self::secret()?;
        let mut response = self
            .db
            .db
            .query(
                r#"
BEGIN TRANSACTION;
UPSERT type::record('player_room_participant', $participant_row_id) MERGE {
    room: type::record('player_room', $room_id), participant_id: $participant_id,
    user_id: $user_id, display_name: $display_name, avatar_url: $avatar_url,
    anonymous: $anonymous, mode: $mode, hide_chords: $hide_chords,
    resume_hash: $resume_hash, connected: false, lease_expires_at: $lease,
    joined_at: $joined_at
};
UPDATE type::record('player_room', $room_id)
SET revision += 1,
    host_user_id = IF host_user_id = NONE THEN $host_user_id ELSE host_user_id END,
    av_participant_id = IF $claim_av THEN $participant_id ELSE av_participant_id END;
CREATE type::record('player_room_ticket', $ticket_id) CONTENT {
    room: type::record('player_room', $room_id), participant_id: $participant_id,
    ticket_hash: $ticket_hash, expires_at: $ticket_expires_at, consumed_at: NONE
};
COMMIT TRANSACTION;
"#,
            )
            .bind(("participant_row_id", format!("{room_id}:{participant_id}")))
            .bind(("room_id", room_id.to_string()))
            .bind(("participant_id", participant_id.clone()))
            .bind(("user_id", user_id.map(str::to_string)))
            .bind(("display_name", display_name.trim().to_string()))
            .bind(("avatar_url", avatar_url))
            .bind(("anonymous", anonymous))
            .bind(("mode", Self::mode_to_db(mode).to_string()))
            .bind(("hide_chords", mode == RoomMode::Sheet && hide_chords))
            .bind(("resume_hash", Self::hash(&resume_credential)))
            .bind(("lease", lease))
            .bind(("joined_at", now))
            .bind((
                "host_user_id",
                host_account.then(|| user_id.unwrap().to_string()),
            ))
            .bind(("claim_av", mode == RoomMode::Av))
            .bind(("ticket_id", Uuid::new_v4().to_string()))
            .bind(("ticket_hash", Self::hash(&ticket)))
            .bind(("ticket_expires_at", now + Duration::seconds(TICKET_SECONDS)))
            .await?;
        surreal_take_errors("room.join", &mut response)?;

        if is_new {
            let aggregate = self.load_active_aggregate(room_id).await?;
            self.publish_participants(room_id, &aggregate).await?;
        }
        Ok(RoomCredentials {
            room_id: room_id.to_string(),
            participant_id,
            mode,
            resume_credential,
            connection_ticket: ticket,
        })
    }

    pub async fn inspect_invite(&self, secret: &str) -> Result<RoomInviteInfo, AppError> {
        let mut response = self
            .db
            .db
            .query("SELECT id FROM ONLY player_room WHERE invite_hash = $hash AND closed_at = NONE")
            .bind(("hash", Self::hash(secret)))
            .await?;
        #[derive(Deserialize, SurrealValue)]
        struct IdRecord {
            id: RecordId,
        }
        let room = response
            .take::<Option<IdRecord>>(0)?
            .ok_or_else(|| AppError::NotFound("room has ended".into()))?;
        let aggregate = self
            .load_active_aggregate(&record_id_string(&room.id))
            .await?;
        let summary = Self::summary_from_room(&aggregate.room, &aggregate.participants)?;
        Ok(RoomInviteInfo {
            room_id: summary.id,
            name: summary.name,
            host_email: summary.host_email,
            av_occupied: summary.av_occupied,
            guests_allowed: aggregate.room.guests_allowed,
        })
    }

    pub async fn join_invite(&self, request: &JoinRoomInvite) -> Result<RoomCredentials, AppError> {
        let info = self.inspect_invite(&request.invite_secret).await?;
        self.join(
            &info.room_id,
            None,
            &request.display_name,
            None,
            true,
            request.mode,
            request.hide_chords,
            request.resume_credential.as_deref(),
            None,
        )
        .await
    }

    pub async fn reconnect(
        &self,
        room_id: &str,
        resume: &str,
    ) -> Result<RoomCredentials, AppError> {
        let aggregate = self
            .load_active_aggregate(room_id)
            .await
            .map_err(|_| AppError::unauthorized())?;
        let hash = Self::hash(resume);
        let participant = aggregate
            .participants
            .iter()
            .find(|participant| participant.resume_hash == hash)
            .ok_or_else(AppError::unauthorized)?;
        let mode = Self::mode_from_db(&participant.mode)?;
        let lease = Utc::now() + Duration::seconds(LEASE_SECONDS);
        let mut response = self
            .db
            .db
            .query("UPDATE type::record('player_room_participant', $row_id) SET lease_expires_at = $lease")
            .bind((
                "row_id",
                format!("{room_id}:{}", participant.participant_id),
            ))
            .bind(("lease", lease))
            .await?;
        surreal_take_errors("room.reconnect", &mut response)?;
        let connection_ticket = self
            .issue_ticket(room_id, &participant.participant_id)
            .await?;
        Ok(RoomCredentials {
            room_id: room_id.to_string(),
            participant_id: participant.participant_id.clone(),
            mode,
            resume_credential: resume.to_string(),
            connection_ticket,
        })
    }

    pub async fn close(
        &self,
        room_id: &str,
        user_id: &str,
        teams: &[String],
        closable_teams: &[String],
    ) -> Result<(), AppError> {
        let aggregate = self
            .load_aggregate(room_id)
            .await?
            .ok_or_else(|| AppError::NotFound("room not found".into()))?;
        let owner = record_id_string(&aggregate.room.owner);
        if !teams.contains(&owner) {
            return Err(AppError::NotFound("room not found".into()));
        }
        if aggregate.room.closed_at.is_some() {
            return Ok(());
        }
        if Self::host_user_id(&aggregate.room, &aggregate.participants) != Some(user_id)
            && !closable_teams.contains(&owner)
        {
            return Err(AppError::forbidden());
        }
        let mut response = self
            .db
            .db
            .query(
                "UPDATE type::record('player_room', $room_id) SET closed_at = time::now(), revision += 1 WHERE closed_at = NONE RETURN AFTER",
            )
            .bind(("room_id", room_id.to_string()))
            .await?;
        surreal_take_errors("room.close", &mut response)?;
        if !response.take::<Vec<RoomRecord>>(0)?.is_empty() {
            self.publish(room_id, ServerEvent::RoomEnded).await;
        }
        Ok(())
    }

    pub async fn consume_ticket(
        &self,
        secret: &str,
    ) -> Result<
        (
            String,
            String,
            broadcast::Receiver<ServerEvent>,
            RoomSnapshot,
        ),
        AppError,
    > {
        let mut response = self
            .db
            .db
            .query(
                "UPDATE player_room_ticket SET consumed_at = time::now() WHERE ticket_hash = $hash AND consumed_at = NONE AND expires_at > time::now() RETURN BEFORE",
            )
            .bind(("hash", Self::hash(secret)))
            .await?;
        let ticket = response
            .take::<Vec<TicketRecord>>(0)?
            .into_iter()
            .next()
            .ok_or_else(AppError::unauthorized)?;
        let room_id = record_id_string(&ticket.room);
        let mut aggregate = self
            .load_active_aggregate(&room_id)
            .await
            .map_err(|_| AppError::unauthorized())?;
        let participant_index = aggregate
            .participants
            .iter()
            .position(|participant| participant.participant_id == ticket.participant_id)
            .ok_or_else(AppError::unauthorized)?;
        let participant_id = aggregate.participants[participant_index]
            .participant_id
            .clone();
        let sender = self.sender(&room_id).await;
        let receiver = sender.subscribe();
        let lease = Utc::now() + Duration::seconds(LEASE_SECONDS);
        let mut response = self
            .db
            .db
            .query(
                r#"
UPDATE type::record('player_room_participant', $row_id)
SET connected = true, lease_expires_at = $lease;
UPDATE type::record('player_room', $room_id)
SET revision += 1;
"#,
            )
            .bind(("row_id", format!("{room_id}:{participant_id}")))
            .bind(("room_id", room_id.clone()))
            .bind(("lease", lease))
            .await?;
        surreal_take_errors("room.ticket.consume", &mut response)?;
        aggregate.room.revision += 1;
        aggregate.participants[participant_index].connected = true;
        aggregate.participants[participant_index].lease_expires_at = lease.into();
        let snapshot = Self::snapshot(&aggregate, Some(&participant_id))?;
        self.publish_participants(&room_id, &aggregate).await?;
        Ok((room_id, participant_id, receiver, snapshot))
    }

    pub async fn snapshot_for_participant(
        &self,
        room_id: &str,
        participant_id: &str,
    ) -> Result<RoomSnapshot, AppError> {
        let aggregate = self
            .load_active_aggregate(room_id)
            .await
            .map_err(|_| AppError::unauthorized())?;
        if !aggregate.participants.iter().any(|participant| {
            participant.participant_id == participant_id && Self::participant_is_active(participant)
        }) {
            return Err(AppError::unauthorized());
        }
        Self::snapshot(&aggregate, Some(participant_id))
    }

    fn participant_is_active_member(aggregate: &RoomAggregate, user_id: &str) -> bool {
        aggregate.participants.iter().any(|participant| {
            participant.user_id.as_deref() == Some(user_id)
                && Self::participant_is_active(participant)
        })
    }

    fn queue_contains_song(aggregate: &RoomAggregate, song_id: &str) -> bool {
        aggregate.queue.iter().any(|item| item.song_id == song_id)
    }

    fn queue_media_ids(item: &RoomQueueItem) -> HashSet<String> {
        Self::collect_media(&RoomContent {
            items: vec![PlayerItem::Chords(item.song.clone())],
            toc: Vec::new(),
        })
    }

    pub async fn ensure_queue_additions_allowed(
        &self,
        room_id: &str,
        user_id: &str,
        teams: &[String],
    ) -> Result<(), AppError> {
        let aggregate = self.load_active_aggregate(room_id).await?;
        let owner = record_id_string(&aggregate.room.owner);
        if !teams.contains(&owner) || !Self::participant_is_active_member(&aggregate, user_id) {
            return Err(AppError::unauthorized());
        }
        if !aggregate.open {
            return Err(AppError::conflict("room_queue_additions_disabled"));
        }
        Ok(())
    }

    pub async fn queue_likes(
        &self,
        room_id: &str,
        user_id: &str,
        teams: &[String],
    ) -> Result<RoomQueueLikes, AppError> {
        let aggregate = self.load_active_aggregate(room_id).await?;
        let owner = record_id_string(&aggregate.room.owner);
        if !teams.contains(&owner) || !Self::participant_is_active_member(&aggregate, user_id) {
            return Err(AppError::unauthorized());
        }
        let liked_song_ids = self.db.liked_song_ids(user_id).await?;
        let mut seen = HashSet::new();
        Ok(RoomQueueLikes {
            song_ids: aggregate
                .queue
                .iter()
                .map(|item| item.song_id.as_str())
                .filter(|song_id| {
                    liked_song_ids.contains(*song_id) && seen.insert((*song_id).to_owned())
                })
                .map(str::to_string)
                .collect(),
        })
    }

    pub async fn set_queue_access(
        &self,
        room_id: &str,
        user_id: &str,
        teams: &[String],
        open: bool,
        revision: u64,
    ) -> Result<(), AppError> {
        let aggregate = self.load_active_aggregate(room_id).await?;
        let owner = record_id_string(&aggregate.room.owner);
        if !teams.contains(&owner)
            || Self::host_user_id(&aggregate.room, &aggregate.participants) != Some(user_id)
        {
            return Err(AppError::forbidden());
        }
        if aggregate.room.revision.max(0) as u64 != revision {
            return Err(AppError::conflict("revision_conflict"));
        }
        if aggregate.open == open {
            return Ok(());
        }
        let mut response = self
            .db
            .db
            .query(
                "UPDATE player_room SET open = type::bool($open), revision += 1 WHERE id = type::record('player_room', $room_id) AND revision = $revision AND closed_at = NONE RETURN AFTER",
            )
            .bind(("room_id", room_id.to_string()))
            .bind(("revision", revision))
            .bind(("open", open.to_string()))
            .await?;
        surreal_take_errors("room.queue_access.update", &mut response)?;
        let Some(next_revision) = response
            .take::<Vec<RevisionRecord>>(0)?
            .into_iter()
            .next()
            .map(|record| record.revision.max(0) as u64)
        else {
            return Err(AppError::conflict("revision_conflict"));
        };
        self.publish(
            room_id,
            ServerEvent::QueueAccessUpdated {
                open,
                revision: next_revision,
            },
        )
        .await;
        Ok(())
    }

    fn queue_event(aggregate: &RoomAggregate) -> ServerEvent {
        ServerEvent::QueueUpdated {
            queue: Self::ranked_queue(&aggregate.queue, &aggregate.queue_votes),
            revision: aggregate.room.revision.max(0) as u64,
        }
    }

    pub async fn add_queue_item(
        &self,
        room_id: &str,
        user_id: &str,
        teams: &[String],
        item: RoomQueueItem,
        revision: u64,
    ) -> Result<(), AppError> {
        let aggregate = self.load_active_aggregate(room_id).await?;
        let owner = record_id_string(&aggregate.room.owner);
        if !teams.contains(&owner) || !Self::participant_is_active_member(&aggregate, user_id) {
            return Err(AppError::unauthorized());
        }
        if !aggregate.open {
            return Err(AppError::conflict("room_queue_additions_disabled"));
        }
        if item.song_id.trim().is_empty() || item.song.song.id != item.song_id {
            return Err(AppError::invalid_request("invalid room queue song"));
        }
        if Self::queue_contains_song(&aggregate, &item.song_id) {
            return Err(AppError::conflict("song_already_in_queue"));
        }

        let participant_name = aggregate
            .participants
            .iter()
            .find(|participant| participant.user_id.as_deref() == Some(user_id))
            .map(|participant| participant.display_name.clone())
            .unwrap_or_else(|| item.added_by.clone());
        let mut item = item;
        item.added_by = participant_name;
        item.played = false;
        item.upvotes = 0;
        let mut queue = Self::ranked_queue(&aggregate.queue, &aggregate.queue_votes);
        queue.push(item.clone());
        Self::rank_queue(&mut queue);
        let queue_json = serde_json::to_string(&queue)
            .map_err(|e| AppError::internal_from_err("room.queue.encode", e))?;
        let mut media_ids = aggregate.room.media_ids.clone();
        media_ids.extend(Self::queue_media_ids(&item));
        media_ids.sort();
        media_ids.dedup();
        let mut response = self
            .db
            .db
            .query(
                "UPDATE type::record('player_room', $room_id) SET queue_json = $queue_json, media_ids = $media_ids, revision += 1 WHERE revision = $revision AND closed_at = NONE RETURN AFTER",
            )
            .bind(("room_id", room_id.to_string()))
            .bind(("queue_json", queue_json))
            .bind(("media_ids", media_ids))
            .bind(("revision", revision))
            .await?;
        surreal_take_errors("room.queue.add", &mut response)?;
        if response.take::<Vec<RoomRecord>>(0)?.is_empty() {
            return Err(AppError::conflict("revision_conflict"));
        }
        let refreshed = self.load_active_aggregate(room_id).await?;
        self.publish(room_id, Self::queue_event(&refreshed)).await;
        Ok(())
    }

    async fn update_queue_for_host(
        &self,
        room_id: &str,
        user_id: &str,
        teams: &[String],
        queue: Vec<RoomQueueItem>,
        revision: u64,
    ) -> Result<(), AppError> {
        let aggregate = self.load_active_aggregate(room_id).await?;
        let owner = record_id_string(&aggregate.room.owner);
        if !teams.contains(&owner)
            || Self::host_user_id(&aggregate.room, &aggregate.participants) != Some(user_id)
        {
            return Err(AppError::forbidden());
        }
        if aggregate.room.revision.max(0) as u64 != revision {
            return Err(AppError::conflict("revision_conflict"));
        }
        let queue = Self::ranked_queue(&queue, &aggregate.queue_votes);
        let queue_json = serde_json::to_string(&queue)
            .map_err(|e| AppError::internal_from_err("room.queue.encode", e))?;
        let queue_ids = queue
            .iter()
            .map(|item| item.id.as_str())
            .collect::<HashSet<_>>();
        let queue_votes = aggregate
            .queue_votes
            .into_iter()
            .filter(|(queue_id, _)| queue_ids.contains(queue_id.as_str()))
            .collect::<HashMap<_, _>>();
        let queue_votes_json = serde_json::to_string(&queue_votes)
            .map_err(|e| AppError::internal_from_err("room.queue_votes.encode", e))?;
        let mut response = self
            .db
            .db
            .query(
                "UPDATE type::record('player_room', $room_id) SET queue_json = $queue_json, queue_votes_json = $queue_votes_json, revision += 1 WHERE revision = $revision AND closed_at = NONE RETURN AFTER",
            )
            .bind(("room_id", room_id.to_string()))
            .bind(("queue_json", queue_json))
            .bind(("queue_votes_json", queue_votes_json))
            .bind(("revision", revision))
            .await?;
        surreal_take_errors("room.queue.update", &mut response)?;
        if response.take::<Vec<RoomRecord>>(0)?.is_empty() {
            return Err(AppError::conflict("revision_conflict"));
        }
        let refreshed = self.load_active_aggregate(room_id).await?;
        self.publish(room_id, Self::queue_event(&refreshed)).await;
        Ok(())
    }

    pub async fn update_queue_vote(
        &self,
        room_id: &str,
        participant_id: &str,
        queue_id: &str,
        upvoted: bool,
        revision: u64,
    ) -> Result<u64, AppError> {
        let aggregate = self.load_active_aggregate(room_id).await?;
        if !aggregate.participants.iter().any(|participant| {
            participant.participant_id == participant_id && Self::participant_is_active(participant)
        }) {
            return Err(AppError::unauthorized());
        }
        if !aggregate.queue.iter().any(|item| item.id == queue_id) {
            return Err(AppError::NotFound("room queue item not found".into()));
        }
        if aggregate.room.revision.max(0) as u64 != revision {
            return Err(AppError::conflict("revision_conflict"));
        }

        let mut queue = aggregate.queue.clone();
        if upvoted && let Some(item) = queue.iter_mut().find(|item| item.id == queue_id) {
            item.played = false;
        }

        let mut queue_votes = aggregate.queue_votes.clone();
        let voters = queue_votes.entry(queue_id.to_string()).or_default();
        if upvoted {
            if !voters.iter().any(|voter| voter == participant_id) {
                voters.push(participant_id.to_string());
            }
        } else {
            voters.retain(|voter| voter != participant_id);
            if voters.is_empty() {
                queue_votes.remove(queue_id);
            }
        }
        let mut queue = Self::queue_with_vote_counts(&queue, &queue_votes);
        Self::rank_queue(&mut queue);
        let queue_json = serde_json::to_string(&queue)
            .map_err(|e| AppError::internal_from_err("room.queue.encode", e))?;
        let queue_votes_json = serde_json::to_string(&queue_votes)
            .map_err(|e| AppError::internal_from_err("room.queue_votes.encode", e))?;
        let mut response = self
            .db
            .db
            .query(
                "UPDATE type::record('player_room', $room_id) SET queue_json = $queue_json, queue_votes_json = $queue_votes_json, revision += 1 WHERE revision = $revision AND closed_at = NONE RETURN AFTER",
            )
            .bind(("room_id", room_id.to_string()))
            .bind(("queue_json", queue_json))
            .bind(("queue_votes_json", queue_votes_json))
            .bind(("revision", revision))
            .await?;
        surreal_take_errors("room.queue.vote", &mut response)?;
        let Some(next_revision) = response
            .take::<Vec<RevisionRecord>>(0)?
            .into_iter()
            .next()
            .map(|record| record.revision.max(0) as u64)
        else {
            return Err(AppError::conflict("revision_conflict"));
        };
        let refreshed = self.load_active_aggregate(room_id).await?;
        self.publish(room_id, Self::queue_event(&refreshed)).await;
        Ok(next_revision)
    }

    pub async fn remove_queue_item(
        &self,
        room_id: &str,
        user_id: &str,
        teams: &[String],
        queue_id: &str,
        revision: u64,
    ) -> Result<(), AppError> {
        let aggregate = self.load_active_aggregate(room_id).await?;
        if !aggregate.queue.iter().any(|item| item.id == queue_id) {
            return Err(AppError::NotFound("room queue item not found".into()));
        }
        let queue = aggregate
            .queue
            .into_iter()
            .filter(|item| item.id != queue_id)
            .collect();
        self.update_queue_for_host(room_id, user_id, teams, queue, revision)
            .await
    }

    pub async fn reorder_queue(
        &self,
        room_id: &str,
        user_id: &str,
        teams: &[String],
        queue_ids: &[String],
        revision: u64,
    ) -> Result<(), AppError> {
        let aggregate = self.load_active_aggregate(room_id).await?;
        let mut by_id = aggregate
            .queue
            .into_iter()
            .map(|item| (item.id.clone(), item))
            .collect::<HashMap<_, _>>();
        if queue_ids.len() != by_id.len() || queue_ids.iter().any(|id| !by_id.contains_key(id)) {
            return Err(AppError::invalid_request(
                "queue order does not match room queue",
            ));
        }
        let queue = queue_ids
            .iter()
            .map(|id| by_id.remove(id).expect("queue id was validated"))
            .collect();
        self.update_queue_for_host(room_id, user_id, teams, queue, revision)
            .await
    }

    async fn activate_song_from_aggregate(
        &self,
        room_id: &str,
        aggregate: RoomAggregate,
        queue_id: Option<&str>,
        queue_item: RoomQueueItem,
        revision: u64,
    ) -> Result<(), AppError> {
        let (content, item_index) = if let Some(index) = aggregate
            .content
            .toc
            .iter()
            .find(|toc| toc.id.as_deref() == Some(queue_item.song_id.as_str()))
            .map(|toc| toc.idx)
        {
            (aggregate.content.clone(), index)
        } else {
            let mut content = aggregate.content.clone();
            let item_index = content.items.len();
            content
                .items
                .push(PlayerItem::Chords(queue_item.song.clone()));
            content.toc.push(TocItem {
                idx: item_index,
                title: queue_item.title.clone(),
                id: Some(queue_item.song_id.clone()),
                nr: String::new(),
                liked: false,
            });
            (content, item_index)
        };
        let musical_state = RoomMusicalState {
            item_index,
            language: None,
            transposition: None,
        };
        Self::validate_state(&content, &musical_state)?;
        let mut requeued_item = queue_item.clone();
        requeued_item.id = Uuid::new_v4().to_string();
        requeued_item.upvotes = 0;
        requeued_item.played = true;
        let mut queue = aggregate
            .queue
            .into_iter()
            .filter(|item| Some(item.id.as_str()) != queue_id)
            .chain(std::iter::once(requeued_item))
            .collect::<Vec<_>>();
        Self::rank_queue(&mut queue);
        let content_json = serde_json::to_string(&content)
            .map_err(|e| AppError::internal_from_err("room.snapshot.encode", e))?;
        let queue_json = serde_json::to_string(&queue)
            .map_err(|e| AppError::internal_from_err("room.queue.encode", e))?;
        let mut queue_votes = aggregate.queue_votes;
        if let Some(queue_id) = queue_id {
            queue_votes.remove(queue_id);
        }
        let queue_votes_json = serde_json::to_string(&queue_votes)
            .map_err(|e| AppError::internal_from_err("room.queue_votes.encode", e))?;
        let musical_json = serde_json::to_string(&musical_state)
            .map_err(|e| AppError::internal_from_err("room.musical.encode", e))?;
        let mut media_ids = aggregate.room.media_ids;
        media_ids.extend(Self::queue_media_ids(&queue_item));
        media_ids.sort();
        media_ids.dedup();
        let mut response = self
            .db
            .db
            .query(
                r#"
BEGIN TRANSACTION;
UPDATE type::record('player_room', $room_id)
SET queue_json = $queue_json, queue_votes_json = $queue_votes_json, musical_state_json = $musical_json,
    media_ids = $media_ids, revision += 1
WHERE revision = $revision AND closed_at = NONE RETURN AFTER;
UPDATE type::record('player_room_snapshot', $room_id)
SET content_json = $content_json
WHERE (SELECT VALUE revision FROM ONLY type::record('player_room', $room_id)) = $next_revision;
COMMIT TRANSACTION;
"#,
            )
            .bind(("room_id", room_id.to_string()))
            .bind(("queue_json", queue_json))
            .bind(("queue_votes_json", queue_votes_json))
            .bind(("musical_json", musical_json))
            .bind(("media_ids", media_ids))
            .bind(("content_json", content_json))
            .bind(("revision", revision))
            .bind(("next_revision", revision + 1))
            .await?;
        surreal_take_errors("room.queue.promote", &mut response)?;
        let refreshed = self.load_active_aggregate(room_id).await?;
        if refreshed.room.revision.max(0) as u64 != revision + 1 {
            return Err(AppError::conflict("revision_conflict"));
        }
        self.publish(
            room_id,
            ServerEvent::Snapshot {
                snapshot: Box::new(Self::snapshot(&refreshed, None)?),
            },
        )
        .await;
        Ok(())
    }

    pub async fn promote_queue_item(
        &self,
        room_id: &str,
        user_id: &str,
        teams: &[String],
        queue_id: &str,
        revision: u64,
    ) -> Result<(), AppError> {
        let aggregate = self.load_active_aggregate(room_id).await?;
        let owner = record_id_string(&aggregate.room.owner);
        if !teams.contains(&owner)
            || Self::host_user_id(&aggregate.room, &aggregate.participants) != Some(user_id)
        {
            return Err(AppError::forbidden());
        }
        if aggregate.room.revision.max(0) as u64 != revision {
            return Err(AppError::conflict("revision_conflict"));
        }
        let Some(queue_item) = aggregate
            .queue
            .iter()
            .find(|item| item.id == queue_id)
            .cloned()
        else {
            return Err(AppError::NotFound("room queue item not found".into()));
        };
        self.activate_song_from_aggregate(room_id, aggregate, Some(queue_id), queue_item, revision)
            .await
    }

    async fn update_revision_field(
        &self,
        room_id: &str,
        revision: u64,
        assignment: &str,
        binding_name: &'static str,
        binding_value: String,
    ) -> Result<Option<u64>, AppError> {
        let query = format!(
            "UPDATE player_room SET {assignment}, revision += 1 WHERE id = type::record('player_room', $room_id) AND revision = $revision AND closed_at = NONE RETURN AFTER"
        );
        let mut response = self
            .db
            .db
            .query(query)
            .bind(("room_id", room_id.to_string()))
            .bind(("revision", revision))
            .bind((binding_name, binding_value))
            .await?;
        surreal_take_errors("room.state.update", &mut response)?;
        Ok(response
            .take::<Vec<RevisionRecord>>(0)?
            .into_iter()
            .next()
            .map(|record| record.revision.max(0) as u64))
    }

    async fn heartbeat(
        &self,
        room_id: &str,
        participant_id: &str,
        client_revision: Option<u64>,
    ) -> Result<Option<ServerEvent>, AppError> {
        let lease = Utc::now() + Duration::seconds(LEASE_SECONDS);
        let mut response = self
            .db
            .db
            .query(
                r#"
UPDATE type::record('player_room_participant', $row_id)
SET connected = true, lease_expires_at = $lease
WHERE connected = true AND lease_expires_at > time::now()
RETURN participant_id;
SELECT revision, host_lease_expires_at
FROM ONLY type::record('player_room', $room_id)
WHERE closed_at = NONE;
"#,
            )
            .bind(("row_id", format!("{room_id}:{participant_id}")))
            .bind(("room_id", room_id.to_string()))
            .bind(("lease", lease))
            .await?;
        surreal_take_errors("room.heartbeat", &mut response)?;
        let participant = response
            .take::<Vec<HeartbeatParticipantRecord>>(0)?
            .into_iter()
            .next();
        if participant
            .as_ref()
            .map(|record| record.participant_id.as_str())
            != Some(participant_id)
        {
            return Err(AppError::unauthorized());
        }
        let Some(room) = response.take::<Vec<RevisionRecord>>(1)?.into_iter().next() else {
            return Ok(Some(ServerEvent::RoomEnded));
        };
        let revision = room.revision.max(0) as u64;
        if client_revision != Some(revision) {
            let refreshed = self.load_active_aggregate(room_id).await?;
            return Ok(Some(ServerEvent::Snapshot {
                snapshot: Box::new(Self::snapshot(&refreshed, Some(participant_id))?),
            }));
        }
        Ok(Some(ServerEvent::Heartbeat {
            revision,
            host_lease_expires_at: room.host_lease_expires_at.into(),
        }))
    }

    pub async fn command(
        &self,
        room_id: &str,
        participant_id: &str,
        command: ClientEvent,
    ) -> Result<Option<ServerEvent>, AppError> {
        if let ClientEvent::Heartbeat { revision } = command {
            return self.heartbeat(room_id, participant_id, revision).await;
        }
        let aggregate = match self.load_active_aggregate(room_id).await {
            Ok(aggregate) => aggregate,
            Err(AppError::NotFound(_)) => return Ok(Some(ServerEvent::RoomEnded)),
            Err(error) => return Err(error),
        };
        if !aggregate.participants.iter().any(|participant| {
            participant.participant_id == participant_id && Self::participant_is_active(participant)
        }) {
            return Err(AppError::unauthorized());
        }
        let revision = aggregate.room.revision.max(0) as u64;

        match command {
            ClientEvent::Heartbeat { .. } => {
                unreachable!("heartbeat handled before aggregate load")
            }
            ClientEvent::RequestSnapshot => Ok(Some(ServerEvent::Snapshot {
                snapshot: Box::new(Self::snapshot(&aggregate, Some(participant_id))?),
            })),
            ClientEvent::Leave => {
                let mut response = self
                    .db
                    .db
                    .query(
                        r#"
UPDATE type::record('player_room_participant', $row_id)
SET connected = false, lease_expires_at = time::now();
UPDATE type::record('player_room', $room_id)
SET revision += 1,
    av_participant_id = IF av_participant_id = $participant_id THEN NONE ELSE av_participant_id END;
"#,
                    )
                    .bind(("row_id", format!("{room_id}:{participant_id}")))
                    .bind(("room_id", room_id.to_string()))
                    .bind(("participant_id", participant_id.to_string()))
                    .await?;
                surreal_take_errors("room.leave", &mut response)?;
                let refreshed = self.load_active_aggregate(room_id).await?;
                let event = self.participants_event(&refreshed)?;
                self.publish(room_id, event.clone()).await;
                Ok(Some(event))
            }
            ClientEvent::UpdateMusicalState {
                command_id,
                musical_state,
            } => {
                let participant = aggregate
                    .participants
                    .iter()
                    .find(|participant| participant.participant_id == participant_id)
                    .expect("participant was checked above");
                if !Self::participant_is_host(&aggregate.room, participant) {
                    return Ok(Some(ServerEvent::CommandRejected {
                        command_id,
                        reason: "room_host_required".into(),
                        revision,
                    }));
                }
                if Self::validate_state(&aggregate.content, &musical_state).is_err() {
                    return Ok(Some(ServerEvent::CommandRejected {
                        command_id,
                        reason: "invalid_musical_state".into(),
                        revision,
                    }));
                }
                if aggregate.musical_state == musical_state {
                    return Ok(Some(ServerEvent::CommandAccepted {
                        command_id,
                        revision,
                        queue_id: None,
                        upvoted: None,
                    }));
                }
                let encoded = serde_json::to_string(&musical_state)
                    .map_err(|e| AppError::internal_from_err("room.musical.encode", e))?;
                let Some(next_revision) = self
                    .update_revision_field(
                        room_id,
                        revision,
                        "musical_state_json = $value",
                        "value",
                        encoded,
                    )
                    .await?
                else {
                    let current = self.load_active_aggregate(room_id).await?;
                    return Ok(Some(ServerEvent::CommandRejected {
                        command_id,
                        reason: "revision_conflict".into(),
                        revision: current.room.revision.max(0) as u64,
                    }));
                };
                self.publish(
                    room_id,
                    ServerEvent::MusicalStateUpdated {
                        musical_state,
                        revision: next_revision,
                    },
                )
                .await;
                Ok(Some(ServerEvent::CommandAccepted {
                    command_id,
                    revision: next_revision,
                    queue_id: None,
                    upvoted: None,
                }))
            }
            ClientEvent::UpdateProjection {
                command_id,
                projection,
            } => {
                if aggregate.room.av_participant_id.as_deref() != Some(participant_id) {
                    return Ok(Some(ServerEvent::CommandRejected {
                        command_id,
                        reason: "av_host_required".into(),
                        revision,
                    }));
                }
                if Self::validate_projection(&projection).is_err() {
                    return Ok(Some(ServerEvent::CommandRejected {
                        command_id,
                        reason: "invalid_projection".into(),
                        revision,
                    }));
                }
                if aggregate.projection.as_ref() == Some(&projection) {
                    return Ok(Some(ServerEvent::CommandAccepted {
                        command_id,
                        revision,
                        queue_id: None,
                        upvoted: None,
                    }));
                }
                let encoded = serde_json::to_string(&projection)
                    .map_err(|e| AppError::internal_from_err("room.projection.encode", e))?;
                let Some(next_revision) = self
                    .update_revision_field(
                        room_id,
                        revision,
                        "projection_json = $value",
                        "value",
                        encoded,
                    )
                    .await?
                else {
                    let current = self.load_active_aggregate(room_id).await?;
                    return Ok(Some(ServerEvent::CommandRejected {
                        command_id,
                        reason: "revision_conflict".into(),
                        revision: current.room.revision.max(0) as u64,
                    }));
                };
                self.publish(
                    room_id,
                    ServerEvent::ProjectionUpdated {
                        projection,
                        revision: next_revision,
                    },
                )
                .await;
                Ok(Some(ServerEvent::CommandAccepted {
                    command_id,
                    revision: next_revision,
                    queue_id: None,
                    upvoted: None,
                }))
            }
            ClientEvent::UpdateGuestsAllowed {
                command_id,
                guests_allowed,
            } => {
                let participant = aggregate
                    .participants
                    .iter()
                    .find(|participant| participant.participant_id == participant_id)
                    .expect("participant was checked above");
                if !Self::participant_is_host(&aggregate.room, participant) {
                    return Ok(Some(ServerEvent::CommandRejected {
                        command_id,
                        reason: "room_host_required".into(),
                        revision,
                    }));
                }
                if aggregate.room.guests_allowed == guests_allowed {
                    return Ok(Some(ServerEvent::CommandAccepted {
                        command_id,
                        revision,
                        queue_id: None,
                        upvoted: None,
                    }));
                }
                let Some(next_revision) = self
                    .update_revision_field(
                        room_id,
                        revision,
                        "guests_allowed = type::bool($value)",
                        "value",
                        guests_allowed.to_string(),
                    )
                    .await?
                else {
                    let current = self.load_active_aggregate(room_id).await?;
                    return Ok(Some(ServerEvent::CommandRejected {
                        command_id,
                        reason: "revision_conflict".into(),
                        revision: current.room.revision.max(0) as u64,
                    }));
                };
                self.publish(
                    room_id,
                    ServerEvent::GuestsAllowedUpdated {
                        guests_allowed,
                        revision: next_revision,
                    },
                )
                .await;
                Ok(Some(ServerEvent::CommandAccepted {
                    command_id,
                    revision: next_revision,
                    queue_id: None,
                    upvoted: None,
                }))
            }
            ClientEvent::UpdateQueueVote {
                command_id,
                queue_id,
                upvoted,
                revision: vote_revision,
            } => {
                if vote_revision != revision {
                    return Ok(Some(ServerEvent::CommandRejected {
                        command_id,
                        reason: "revision_conflict".into(),
                        revision,
                    }));
                }
                let next_revision = match self
                    .update_queue_vote(room_id, participant_id, &queue_id, upvoted, vote_revision)
                    .await
                {
                    Ok(next_revision) => next_revision,
                    Err(AppError::Conflict(reason)) if reason == "revision_conflict" => {
                        let current = self.load_active_aggregate(room_id).await?;
                        return Ok(Some(ServerEvent::CommandRejected {
                            command_id,
                            reason,
                            revision: current.room.revision.max(0) as u64,
                        }));
                    }
                    Err(error) => return Err(error),
                };
                Ok(Some(ServerEvent::CommandAccepted {
                    command_id,
                    revision: next_revision,
                    queue_id: Some(queue_id),
                    upvoted: Some(upvoted),
                }))
            }
            ClientEvent::Authenticate { .. } => {
                Err(AppError::invalid_request("already authenticated"))
            }
        }
    }

    fn participants_event(&self, aggregate: &RoomAggregate) -> Result<ServerEvent, AppError> {
        let snapshot = Self::snapshot(aggregate, None)?;
        Ok(ServerEvent::ParticipantsChanged {
            participant_count: snapshot.summary.participant_count,
            av_occupied: snapshot.summary.av_occupied,
            participants: snapshot.participants,
            revision: snapshot.revision,
        })
    }

    async fn publish_participants(
        &self,
        room_id: &str,
        aggregate: &RoomAggregate,
    ) -> Result<(), AppError> {
        let event = self.participants_event(aggregate)?;
        self.publish(room_id, event).await;
        Ok(())
    }

    pub async fn disconnect(&self, room_id: &str, participant_id: &str) {
        let Ok(Some(aggregate)) = self.load_aggregate(room_id).await else {
            return;
        };
        let Some(participant) = aggregate
            .participants
            .iter()
            .find(|participant| participant.participant_id == participant_id)
        else {
            return;
        };
        if !participant.connected {
            return;
        }
        let mut response = match self
            .db
            .db
            .query(
                r#"
UPDATE type::record('player_room_participant', $row_id)
SET connected = false, lease_expires_at = time::now();
UPDATE type::record('player_room', $room_id)
SET revision += 1,
    av_participant_id = IF av_participant_id = $participant_id THEN NONE ELSE av_participant_id END;
"#,
            )
            .bind(("row_id", format!("{room_id}:{participant_id}")))
            .bind(("room_id", room_id.to_string()))
            .bind(("participant_id", participant_id.to_string()))
            .await
        {
            Ok(response) => response,
            Err(_) => return,
        };
        if surreal_take_errors("room.disconnect", &mut response).is_err() {
            return;
        }
        if let Ok(aggregate) = self.load_active_aggregate(room_id).await {
            let _ = self.publish_participants(room_id, &aggregate).await;
        }
    }

    pub async fn authorize_media(
        &self,
        room_id: &str,
        resume: &str,
        blob_id: &str,
    ) -> Result<String, AppError> {
        let aggregate = self.load_active_aggregate(room_id).await?;
        if !aggregate.room.media_ids.iter().any(|id| id == blob_id)
            || !aggregate.participants.iter().any(|participant| {
                participant.resume_hash == Self::hash(resume)
                    && Self::participant_is_active(participant)
            })
        {
            return Err(AppError::NotFound("room media not found".into()));
        }
        let (table, id) = crate::resources::common::resource_id("blob", blob_id)?;
        let mut response = self
            .db
            .db
            .query("SELECT owner FROM type::record($table, $id)")
            .bind(("table", table))
            .bind(("id", id))
            .await?;
        surreal_take_errors("room.media_owner", &mut response)?;
        let blob = response
            .take::<Option<BlobOwnerRecord>>(0)?
            .ok_or_else(|| AppError::NotFound("room media not found".into()))?;
        Ok(record_id_string(&blob.owner))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use chordlib::types::{Line, Part, Section, Song as SongData};
    use shared::blob::BlobLink;
    use shared::player::{PlayerBlobItem, PlayerChordsItem, PlayerItem};

    #[derive(Debug, Deserialize, SurrealValue)]
    struct PersistedRoomState {
        musical_state_json: String,
        projection_json: Option<String>,
        revision: i64,
    }

    fn service(db: Arc<Database>) -> RoomService {
        RoomService::new(db)
    }

    async fn create_room(service: &RoomService) -> CreatedRoom {
        service
            .create(CreateRoomInput {
                team_id: "team-1".into(),
                name: None,
                host_user_id: "user-1".into(),
                host_email: "host@example.com".into(),
                host_avatar_url: None,
                source_type: Some(RoomSourceType::Song),
                source_id: Some("song-1".into()),
                source_title: Some("Song".into()),
                content: RoomContent {
                    items: vec![PlayerItem::Blob(PlayerBlobItem {
                        blob_id: "blob-1".into(),
                    })],
                    toc: vec![],
                },
                initial_queue: Vec::new(),
                host_mode: RoomMode::Sheet,
                musical_state: RoomMusicalState::default(),
                projection: None,
            })
            .await
            .unwrap()
    }

    async fn persisted_room_state(db: &Database, room_id: &str) -> (String, PersistedRoomState) {
        let mut response = db
            .db
            .query(
                "SELECT content_json FROM type::record('player_room_snapshot', $room_id); SELECT musical_state_json, projection_json, revision FROM type::record('player_room', $room_id)",
            )
            .bind(("room_id", room_id.to_string()))
            .await
            .unwrap();
        surreal_take_errors("room.test.persisted_state", &mut response).unwrap();
        let snapshot = response
            .take::<Vec<SnapshotRecord>>(0)
            .unwrap()
            .into_iter()
            .next()
            .unwrap()
            .content_json;
        let state = response
            .take::<Vec<PersistedRoomState>>(1)
            .unwrap()
            .into_iter()
            .next()
            .unwrap();
        (snapshot, state)
    }

    #[tokio::test]
    async fn captured_media_uses_blob_owner_across_teams_and_rejects_other_blobs() {
        let db = crate::test_helpers::test_db().await.unwrap();
        db.db
            .query(
                "CREATE type::record('blob', 'blob-1') CONTENT { owner: type::record('team', 'source-team'), file_type: 'image/svg', width: 1, height: 1, ocr: '' }",
            )
            .await
            .unwrap();
        let service = service(db);
        let created = create_room(&service).await;
        let credentials = service
            .reconnect(&created.room.id, &created.credentials.resume_credential)
            .await
            .unwrap();

        assert_eq!(
            service
                .authorize_media(&created.room.id, &credentials.resume_credential, "blob-1",)
                .await
                .unwrap(),
            "source-team"
        );
        assert!(
            service
                .authorize_media(&created.room.id, &credentials.resume_credential, "blob-2",)
                .await
                .is_err()
        );
    }

    fn queued_song(id: &str) -> RoomQueueItem {
        RoomQueueItem {
            id: format!("queue-{id}"),
            song_id: id.into(),
            title: format!("Song {id}"),
            song: Box::new(PlayerChordsItem {
                song: shared::song::Song {
                    id: id.into(),
                    data: SongData {
                        titles: vec![format!("Song {id}")],
                        ..SongData::default()
                    },
                    blobs: vec![BlobLink {
                        id: format!("blob-{id}"),
                    }],
                    ..shared::song::Song::default()
                },
                language: None,
                flow: None,
            }),
            added_by: "host@example.com".into(),
            upvotes: 0,
            played: false,
        }
    }

    #[test]
    fn queue_ranking_puts_upcoming_items_first_and_preserves_ties() {
        let mut first = queued_song("first");
        first.upvotes = 1;
        let mut second = queued_song("second");
        second.upvotes = 1;
        let mut played = queued_song("played");
        played.played = true;
        played.upvotes = 1;
        let mut last = queued_song("last");
        last.played = true;
        last.upvotes = 1;
        let mut queue = vec![first, second, played, last];

        RoomService::rank_queue(&mut queue);

        assert_eq!(
            queue
                .iter()
                .map(|item| item.song_id.as_str())
                .collect::<Vec<_>>(),
            ["first", "second", "played", "last"]
        );
    }

    #[test]
    fn legacy_queue_items_default_to_unplayed() {
        let mut value = serde_json::to_value(queued_song("legacy")).unwrap();
        value.as_object_mut().unwrap().remove("played");

        let item: RoomQueueItem = serde_json::from_value(value).unwrap();

        assert!(!item.played);
    }

    #[tokio::test]
    async fn authenticated_members_can_queue_and_only_the_host_can_promote() {
        let db = crate::test_helpers::test_db().await.unwrap();
        let service = service(db);
        let created = create_room(&service).await;
        service
            .set_queue_access(&created.room.id, "user-1", &["team-1".into()], true, 1)
            .await
            .unwrap();

        service
            .add_queue_item(
                &created.room.id,
                "user-1",
                &["team-1".into()],
                queued_song("song-2"),
                2,
            )
            .await
            .unwrap();
        service
            .add_queue_item(
                &created.room.id,
                "user-1",
                &["team-1".into()],
                queued_song("song-3"),
                3,
            )
            .await
            .unwrap();
        let queued = service
            .snapshot_for_participant(&created.room.id, &created.credentials.participant_id)
            .await
            .unwrap();
        assert_eq!(queued.queue.len(), 2);
        assert_eq!(queued.queue[0].song_id, "song-2");
        assert!(queued.queue.iter().all(|item| !item.played));
        assert!(
            queued.queue[0]
                .song
                .song
                .blobs
                .iter()
                .any(|blob| blob.id == "blob-song-2")
        );
        service
            .update_queue_vote(
                &created.room.id,
                &created.credentials.participant_id,
                "queue-song-2",
                true,
                queued.revision,
            )
            .await
            .unwrap();
        let voted = service
            .snapshot_for_participant(&created.room.id, &created.credentials.participant_id)
            .await
            .unwrap();
        assert_eq!(voted.queue[0].upvotes, 1);

        let member = service
            .join_authenticated(
                &created.room.id,
                "user-2",
                "member@example.com",
                None,
                RoomMode::Sheet,
                false,
                None,
                &["team-1".into()],
            )
            .await
            .unwrap();
        let current_revision = service
            .snapshot_for_participant(&created.room.id, &member.participant_id)
            .await
            .unwrap()
            .revision;
        assert!(
            service
                .promote_queue_item(
                    &created.room.id,
                    "user-2",
                    &["team-1".into()],
                    "queue-song-2",
                    current_revision,
                )
                .await
                .is_err()
        );

        service
            .promote_queue_item(
                &created.room.id,
                "user-1",
                &["team-1".into()],
                "queue-song-2",
                current_revision,
            )
            .await
            .unwrap();
        let promoted = service
            .snapshot_for_participant(&member.room_id, &member.participant_id)
            .await
            .unwrap();
        assert_eq!(promoted.queue.len(), 2);
        assert_eq!(promoted.queue[0].song_id, "song-3");
        assert_eq!(promoted.queue[1].song_id, "song-2");
        assert_ne!(promoted.queue[1].id, "queue-song-2");
        assert_eq!(promoted.queue[1].upvotes, 0);
        assert!(promoted.queue[1].played);
        assert_eq!(promoted.content.items.len(), 2);
        assert_eq!(promoted.musical_state.item_index, 1);

        let requeued_id = promoted.queue[1].id.clone();
        service
            .promote_queue_item(
                &created.room.id,
                "user-1",
                &["team-1".into()],
                &requeued_id,
                promoted.revision,
            )
            .await
            .unwrap();
        let promoted_again = service
            .snapshot_for_participant(&member.room_id, &member.participant_id)
            .await
            .unwrap();
        assert_eq!(promoted_again.queue.len(), 2);
        assert_eq!(promoted_again.queue[0].song_id, "song-3");
        assert_eq!(promoted_again.queue[1].song_id, "song-2");
        assert_ne!(promoted_again.queue[1].id, requeued_id);
        assert!(promoted_again.queue[1].played);
        assert_eq!(promoted_again.content.items.len(), 2);
    }

    #[tokio::test]
    async fn upvoting_a_played_item_returns_it_to_the_upcoming_ranking() {
        let db = crate::test_helpers::test_db().await.unwrap();
        let service = service(db);
        let created = create_room(&service).await;
        service
            .set_queue_access(&created.room.id, "user-1", &["team-1".into()], true, 1)
            .await
            .unwrap();
        service
            .add_queue_item(
                &created.room.id,
                "user-1",
                &["team-1".into()],
                queued_song("song-2"),
                2,
            )
            .await
            .unwrap();
        service
            .add_queue_item(
                &created.room.id,
                "user-1",
                &["team-1".into()],
                queued_song("song-3"),
                3,
            )
            .await
            .unwrap();

        let before_activation = service
            .snapshot_for_participant(&created.room.id, &created.credentials.participant_id)
            .await
            .unwrap();
        service
            .promote_queue_item(
                &created.room.id,
                "user-1",
                &["team-1".into()],
                "queue-song-2",
                before_activation.revision,
            )
            .await
            .unwrap();

        let played_snapshot = service
            .snapshot_for_participant(&created.room.id, &created.credentials.participant_id)
            .await
            .unwrap();
        let played_id = played_snapshot
            .queue
            .iter()
            .find(|item| item.song_id == "song-2")
            .map(|item| item.id.clone())
            .unwrap();
        assert!(played_snapshot.queue[1].played);
        assert_eq!(played_snapshot.queue[1].upvotes, 0);

        service
            .update_queue_vote(
                &created.room.id,
                &created.credentials.participant_id,
                &played_id,
                true,
                played_snapshot.revision,
            )
            .await
            .unwrap();
        let upvoted = service
            .snapshot_for_participant(&created.room.id, &created.credentials.participant_id)
            .await
            .unwrap();
        assert_eq!(upvoted.queue[0].song_id, "song-2");
        assert!(!upvoted.queue[0].played);
        assert_eq!(upvoted.queue[0].upvotes, 1);

        service
            .update_queue_vote(
                &created.room.id,
                &created.credentials.participant_id,
                &played_id,
                false,
                upvoted.revision,
            )
            .await
            .unwrap();
        let unvoted = service
            .snapshot_for_participant(&created.room.id, &created.credentials.participant_id)
            .await
            .unwrap();
        assert_eq!(unvoted.queue[0].song_id, "song-2");
        assert!(!unvoted.queue[0].played);
        assert_eq!(unvoted.queue[0].upvotes, 0);
    }

    #[tokio::test]
    async fn queue_votes_are_toggleable_for_members_and_guests_and_rank_stably() {
        let db = crate::test_helpers::test_db().await.unwrap();
        let service = service(db);
        let created = create_room(&service).await;
        service
            .set_queue_access(&created.room.id, "user-1", &["team-1".into()], true, 1)
            .await
            .unwrap();
        service
            .add_queue_item(
                &created.room.id,
                "user-1",
                &["team-1".into()],
                queued_song("song-2"),
                2,
            )
            .await
            .unwrap();
        service
            .add_queue_item(
                &created.room.id,
                "user-1",
                &["team-1".into()],
                queued_song("song-3"),
                3,
            )
            .await
            .unwrap();
        let member = service
            .join_authenticated(
                &created.room.id,
                "user-2",
                "member@example.com",
                None,
                RoomMode::Sheet,
                false,
                None,
                &["team-1".into()],
            )
            .await
            .unwrap();
        let guest = service
            .join_invite(&JoinRoomInvite {
                invite_secret: created.invite_secret.clone(),
                display_name: "Guest".into(),
                mode: RoomMode::Sheet,
                hide_chords: false,
                resume_credential: None,
            })
            .await
            .unwrap();

        let guest_revision = service
            .snapshot_for_participant(&created.room.id, &guest.participant_id)
            .await
            .unwrap()
            .revision;
        service
            .update_queue_vote(
                &created.room.id,
                &guest.participant_id,
                "queue-song-3",
                true,
                guest_revision,
            )
            .await
            .unwrap();
        let member_revision = service
            .snapshot_for_participant(&created.room.id, &member.participant_id)
            .await
            .unwrap()
            .revision;
        service
            .update_queue_vote(
                &created.room.id,
                &member.participant_id,
                "queue-song-3",
                true,
                member_revision,
            )
            .await
            .unwrap();

        let ranked = service
            .snapshot_for_participant(&created.room.id, &created.credentials.participant_id)
            .await
            .unwrap();
        assert_eq!(ranked.queue[0].song_id, "song-3");
        assert_eq!(ranked.queue[0].upvotes, 2);
        assert!(ranked.voted_queue_ids.is_empty());

        let host_revision = ranked.revision;
        service
            .update_queue_vote(
                &created.room.id,
                &created.credentials.participant_id,
                "queue-song-3",
                true,
                host_revision,
            )
            .await
            .unwrap();
        let ranked = service
            .snapshot_for_participant(&created.room.id, &created.credentials.participant_id)
            .await
            .unwrap();
        assert_eq!(ranked.queue[0].upvotes, 3);
        assert_eq!(ranked.voted_queue_ids, vec!["queue-song-3"]);

        service
            .update_queue_vote(
                &created.room.id,
                &created.credentials.participant_id,
                "queue-song-3",
                false,
                ranked.revision,
            )
            .await
            .unwrap();
        let unvoted = service
            .snapshot_for_participant(&created.room.id, &created.credentials.participant_id)
            .await
            .unwrap();
        assert_eq!(unvoted.queue[0].song_id, "song-3");
        assert!(unvoted.voted_queue_ids.is_empty());
    }

    #[tokio::test]
    async fn queue_access_is_host_controlled_and_publishes_a_delta() {
        let db = crate::test_helpers::test_db().await.unwrap();
        let service = service(db);
        let created = create_room(&service).await;
        let mut events = service.sender(&created.room.id).await.subscribe();

        service
            .set_queue_access(&created.room.id, "user-1", &["team-1".into()], true, 1)
            .await
            .unwrap();

        assert!(matches!(
            events.recv().await.unwrap(),
            ServerEvent::QueueAccessUpdated { open: true, .. }
        ));
        let snapshot = service
            .snapshot_for_participant(&created.room.id, &created.credentials.participant_id)
            .await
            .unwrap();
        assert!(snapshot.summary.open);
        assert!(matches!(
            service
                .set_queue_access(
                    &created.room.id,
                    "user-2",
                    &["team-1".into()],
                    false,
                    snapshot.revision,
                )
                .await,
            Err(AppError::Forbidden)
        ));
    }

    #[tokio::test]
    async fn disabled_queue_access_rejects_new_items() {
        let db = crate::test_helpers::test_db().await.unwrap();
        let service = service(db);
        let created = create_room(&service).await;

        assert!(matches!(
            service
                .add_queue_item(
                    &created.room.id,
                    "user-1",
                    &["team-1".into()],
                    queued_song("song-2"),
                    1,
                )
                .await,
            Err(AppError::Conflict(reason)) if reason == "room_queue_additions_disabled"
        ));
    }

    #[tokio::test]
    async fn queue_likes_return_only_liked_songs_in_queue_order() {
        let db = crate::test_helpers::test_db().await.unwrap();
        let service = service(db.clone());
        let created = create_room(&service).await;
        service
            .set_queue_access(&created.room.id, "user-1", &["team-1".into()], true, 1)
            .await
            .unwrap();
        service
            .add_queue_item(
                &created.room.id,
                "user-1",
                &["team-1".into()],
                queued_song("song-2"),
                2,
            )
            .await
            .unwrap();
        db.db
            .query(
                "CREATE like CONTENT { owner: type::record('user', 'user-1'), song: type::record('song', 'song-2') }",
            )
            .await
            .unwrap()
            .check()
            .unwrap();

        let likes = service
            .queue_likes(&created.room.id, "user-1", &["team-1".into()])
            .await
            .unwrap();
        assert_eq!(likes.song_ids, vec!["song-2"]);
    }

    #[test]
    fn effective_languages_include_lyric_track_fallbacks() {
        let mut song = SongData {
            sections: vec![Section::new(
                "Verse".into(),
                vec![Line::new(vec![Part {
                    languages: vec!["Hello".into(), "Hallo".into()],
                    ..Part::default()
                }])],
            )],
            ..SongData::default()
        };
        assert!(RoomService::effective_language_is_available(&song, "L1"));
        assert!(RoomService::effective_language_is_available(&song, "L2"));
        assert!(!RoomService::effective_language_is_available(&song, "L3"));
        song.languages = vec!["English".into(), String::new()];
        assert!(RoomService::effective_language_is_available(
            &song, "English"
        ));
        assert!(RoomService::effective_language_is_available(&song, "L2"));
    }

    #[test]
    fn unavailable_initial_language_falls_back_to_default() {
        let content = RoomContent {
            items: vec![PlayerItem::Chords(Box::new(PlayerChordsItem {
                song: shared::song::Song {
                    data: SongData {
                        languages: vec!["English".into()],
                        ..SongData::default()
                    },
                    ..shared::song::Song::default()
                },
                language: None,
                flow: None,
            }))],
            toc: vec![],
        };
        let mut state = RoomMusicalState {
            item_index: 0,
            language: Some("German".into()),
            transposition: None,
        };
        RoomService::normalize_initial_language(&content, &mut state);
        assert_eq!(state.language, None);
        assert!(RoomService::validate_state(&content, &state).is_ok());
    }

    #[tokio::test]
    async fn av_claim_is_single_and_invite_closes_with_room() {
        let db = crate::test_helpers::test_db().await.unwrap();
        let service = service(db);
        let created = create_room(&service).await;
        let teams = vec!["team-1".into()];
        service
            .join_authenticated(
                &created.room.id,
                "user-2",
                "two@example.com",
                None,
                RoomMode::Av,
                false,
                None,
                &teams,
            )
            .await
            .unwrap();
        let error = service
            .join_authenticated(
                &created.room.id,
                "user-3",
                "three@example.com",
                None,
                RoomMode::Av,
                false,
                None,
                &teams,
            )
            .await
            .unwrap_err();
        assert!(matches!(error, AppError::Conflict(_)));
        service
            .close(
                &created.room.id,
                "user-1",
                &["team-1".into()],
                &["team-1".into()],
            )
            .await
            .unwrap();
        assert!(
            service
                .inspect_invite(&created.invite_secret)
                .await
                .is_err()
        );
    }

    #[tokio::test]
    async fn ticket_is_one_use() {
        let db = crate::test_helpers::test_db().await.unwrap();
        let service = service(db);
        let created = create_room(&service).await;
        service
            .consume_ticket(&created.credentials.connection_ticket)
            .await
            .unwrap();
        assert!(
            service
                .consume_ticket(&created.credentials.connection_ticket)
                .await
                .is_err()
        );
    }

    #[tokio::test]
    async fn heartbeat_only_extends_leases_and_reconciles_revision() {
        let db = crate::test_helpers::test_db().await.unwrap();
        let service = service(db.clone());
        let created = create_room(&service).await;
        service
            .consume_ticket(&created.credentials.connection_ticket)
            .await
            .unwrap();
        let event = service
            .command(
                &created.room.id,
                &created.credentials.participant_id,
                ClientEvent::Heartbeat { revision: Some(0) },
            )
            .await
            .unwrap()
            .unwrap();
        let revision = match event {
            ServerEvent::Snapshot { snapshot } => snapshot.revision,
            event => panic!("expected snapshot, got {event:?}"),
        };
        let before = persisted_room_state(&db, &created.room.id).await;
        let heartbeat = service
            .command(
                &created.room.id,
                &created.credentials.participant_id,
                ClientEvent::Heartbeat {
                    revision: Some(revision),
                },
            )
            .await
            .unwrap()
            .unwrap();
        assert!(matches!(heartbeat, ServerEvent::Heartbeat { .. }));
        let after = persisted_room_state(&db, &created.room.id).await;
        assert_eq!(after.0, before.0);
        assert_eq!(after.1.musical_state_json, before.1.musical_state_json);
        assert_eq!(after.1.projection_json, before.1.projection_json);
        assert_eq!(after.1.revision, before.1.revision);
    }

    #[tokio::test]
    async fn heartbeat_reconciles_changes_written_by_another_instance() {
        let db = crate::test_helpers::test_db().await.unwrap();
        let first_instance = service(db.clone());
        let second_instance = service(db);
        let created = create_room(&first_instance).await;
        second_instance
            .consume_ticket(&created.credentials.connection_ticket)
            .await
            .unwrap();
        let initial = second_instance
            .command(
                &created.room.id,
                &created.credentials.participant_id,
                ClientEvent::RequestSnapshot,
            )
            .await
            .unwrap()
            .unwrap();
        let initial_revision = match initial {
            ServerEvent::Snapshot { snapshot } => snapshot.revision,
            event => panic!("expected snapshot, got {event:?}"),
        };
        first_instance
            .command(
                &created.room.id,
                &created.credentials.participant_id,
                ClientEvent::UpdateGuestsAllowed {
                    command_id: "remote-update".into(),
                    guests_allowed: false,
                },
            )
            .await
            .unwrap();
        let reconciled = second_instance
            .command(
                &created.room.id,
                &created.credentials.participant_id,
                ClientEvent::Heartbeat {
                    revision: Some(initial_revision),
                },
            )
            .await
            .unwrap()
            .unwrap();
        match reconciled {
            ServerEvent::Snapshot { snapshot } => {
                assert!(snapshot.revision > initial_revision);
                assert!(!snapshot.guests_allowed);
            }
            event => panic!("expected snapshot, got {event:?}"),
        }
    }

    #[tokio::test]
    async fn guests_can_be_disabled_for_new_invite_joins() {
        let db = crate::test_helpers::test_db().await.unwrap();
        let service = service(db);
        let created = create_room(&service).await;
        service
            .command(
                &created.room.id,
                &created.credentials.participant_id,
                ClientEvent::UpdateGuestsAllowed {
                    command_id: "disable-guests".into(),
                    guests_allowed: false,
                },
            )
            .await
            .unwrap()
            .expect("host update accepted");
        let info = service
            .inspect_invite(&created.invite_secret)
            .await
            .unwrap();
        assert!(!info.guests_allowed);
        let error = service
            .join_invite(&JoinRoomInvite {
                invite_secret: created.invite_secret,
                display_name: "Guest".into(),
                mode: RoomMode::Sheet,
                hide_chords: false,
                resume_credential: None,
            })
            .await
            .unwrap_err();
        assert!(matches!(error, AppError::Conflict(_)));
    }

    #[tokio::test]
    async fn room_lifetime_and_host_authority_survive_expired_device_leases() {
        let db = crate::test_helpers::test_db().await.unwrap();
        let service = service(db.clone());
        let created = create_room(&service).await;

        let mut response = db
            .db
            .query(
                "UPDATE type::record('player_room', $room_id) SET host_lease_expires_at = time::now() - 1s; UPDATE player_room_participant SET connected = false, lease_expires_at = time::now() - 1s WHERE room = type::record('player_room', $room_id)",
            )
            .bind(("room_id", created.room.id.clone()))
            .await
            .unwrap();
        surreal_take_errors("room.test.expire_leases", &mut response).unwrap();

        let rooms = service
            .list(&["team-1".into()], None, "user-1", &[])
            .await
            .unwrap();
        assert_eq!(rooms.len(), 1);
        assert_eq!(rooms[0].participant_count, 0);
        assert!(service.inspect_invite(&created.invite_secret).await.is_ok());

        let restored = service
            .join_authenticated(
                &created.room.id,
                "user-1",
                "host@example.com",
                None,
                RoomMode::Sheet,
                false,
                None,
                &["team-1".into()],
            )
            .await
            .unwrap();
        assert_ne!(restored.participant_id, created.credentials.participant_id);
        let (_, _, _, snapshot) = service
            .consume_ticket(&restored.connection_ticket)
            .await
            .unwrap();
        assert!(snapshot.participants.iter().any(|participant| {
            participant.id == restored.participant_id && participant.is_host
        }));

        let accepted = service
            .command(
                &created.room.id,
                &restored.participant_id,
                ClientEvent::UpdateGuestsAllowed {
                    command_id: "restored-host".into(),
                    guests_allowed: false,
                },
            )
            .await
            .unwrap()
            .unwrap();
        assert!(matches!(accepted, ServerEvent::CommandAccepted { .. }));
    }

    #[tokio::test]
    async fn only_host_or_current_team_maintainers_can_close() {
        let db = crate::test_helpers::test_db().await.unwrap();
        let service = service(db);
        let created = create_room(&service).await;

        let error = service
            .close(&created.room.id, "user-2", &["team-1".into()], &[])
            .await
            .unwrap_err();
        assert!(matches!(error, AppError::Forbidden));

        service
            .close(
                &created.room.id,
                "user-2",
                &["team-1".into()],
                &["team-1".into()],
            )
            .await
            .unwrap();
        assert!(
            service
                .inspect_invite(&created.invite_secret)
                .await
                .is_err()
        );
        assert!(
            service
                .close(&created.room.id, "user-2", &["team-1".into()], &[])
                .await
                .is_ok()
        );
    }
}
