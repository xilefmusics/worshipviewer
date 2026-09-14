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

use shared::player::TocItem;
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
    #[serde(default = "default_queue_additions_allowed")]
    queue_additions_allowed: bool,
    name: String,
    host_email: String,
    musical_state_json: String,
    #[serde(default = "default_queue_json")]
    queue_json: String,
    #[serde(default = "default_queue_votes_json")]
    queue_votes_json: String,
    projection_json: Option<String>,
    revision: i64,
    invite_hash: String,
    host_session_id: RecordId,
    av_session_id: Option<RecordId>,
    created_at: Datetime,
    closed_at: Option<Datetime>,
    #[serde(default = "default_guest_access_allowed")]
    guest_access_allowed: bool,
    #[serde(default)]
    new_joins_locked: bool,
}

#[derive(Debug, Clone, Deserialize, SurrealValue)]
struct RoomSummaryRecord {
    id: RecordId,
    owner: RecordId,
    #[serde(default = "default_queue_additions_allowed")]
    queue_additions_allowed: bool,
    name: String,
    host_email: String,
    host_session_id: RecordId,
    av_session_id: Option<RecordId>,
    created_at: Datetime,
}

#[derive(Debug, Clone, Deserialize, SurrealValue)]
struct SessionRecord {
    id: RecordId,
    session_id: String,
    user_id: Option<RecordId>,
    guest_display_name: Option<String>,
    mode: String,
    #[serde(default)]
    hide_chords: bool,
    resume_hash: String,
    ticket_hash: String,
    expires_at: Datetime,
    consumed_at: Option<Datetime>,
    connected: bool,
    lease_expires_at: Datetime,
    joined_at: Datetime,
    connection_generation: String,
    user_email: Option<String>,
    user_avatar_url: Option<String>,
}

#[derive(Debug, Clone, Deserialize, SurrealValue)]
struct SnapshotRecord {
    content_json: String,
}

#[derive(Debug, Clone, Deserialize, SurrealValue)]
struct TicketRecord {
    room: RecordId,
    session_id: String,
    connection_generation: String,
}

#[derive(Debug, Clone, Deserialize, SurrealValue)]
struct RevisionRecord {
    revision: i64,
}

#[derive(Debug, Clone, Deserialize, SurrealValue)]
struct HeartbeatSessionRecord {
    session_id: String,
}

#[derive(Debug, Clone, Deserialize, SurrealValue)]
struct RoomListSessionRecord {
    id: RecordId,
    room: RecordId,
    user_id: Option<RecordId>,
    connected: bool,
    lease_expires_at: Datetime,
}

struct RoomAggregate {
    room: RoomRecord,
    content: RoomContent,
    queue: Vec<RoomQueueItem>,
    queue_votes: HashMap<String, Vec<String>>,
    musical_state: RoomMusicalState,
    projection: Option<RoomProjectionPayload>,
    sessions: Vec<SessionRecord>,
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
        guest_access_allowed: bool,
    },
    UpdateRoomLocked {
        command_id: String,
        new_joins_locked: bool,
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
        guest_access_allowed: bool,
        revision: u64,
    },
    RoomLockedUpdated {
        new_joins_locked: bool,
        revision: u64,
    },
    QueueAccessUpdated {
        queue_additions_allowed: bool,
        revision: u64,
    },
    SessionsChanged {
        sessions: Vec<RoomSession>,
        session_count: usize,
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
    pub content: RoomContent,
    pub initial_queue: Vec<RoomQueueItem>,
    pub host_mode: RoomMode,
    pub musical_state: RoomMusicalState,
    pub projection: Option<RoomProjectionPayload>,
}

fn default_guest_access_allowed() -> bool {
    true
}

fn default_queue_json() -> String {
    "[]".into()
}

fn default_queue_votes_json() -> String {
    "{}".into()
}

fn default_queue_additions_allowed() -> bool {
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

    fn user_record_id(user_id: &str) -> RecordId {
        RecordId::new("user", user_id.to_string())
    }

    fn session_record_id(room_id: &str, session_id: &str) -> RecordId {
        RecordId::new("player_room_session", format!("{room_id}:{session_id}"))
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
            _ => Err(AppError::database("invalid room session mode")),
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
        if let Some(language) = state.language.as_deref()
            && !Self::effective_language_is_available(&item.song.data, language)
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

    fn normalize_initial_language(content: &RoomContent, state: &mut RoomMusicalState) {
        let Some(language) = state.language.as_deref() else {
            return;
        };
        let Some(chords) = content.items.get(state.item_index) else {
            return;
        };
        if !Self::effective_language_is_available(&chords.song.data, language) {
            state.language = None;
        }
    }

    fn normalize_queue_item(item: &mut RoomQueueItem) {
        *item.song = RoomContent::normalize_song((*item.song).clone());
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

    fn is_active(room: &RoomRecord) -> bool {
        room.closed_at.is_none()
    }

    fn session_is_active(session: &SessionRecord) -> bool {
        let lease: DateTime<Utc> = session.lease_expires_at.into();
        lease > Utc::now()
    }

    fn public_session(room: &RoomRecord, session: &SessionRecord) -> Result<RoomSession, AppError> {
        let mode = Self::mode_from_db(&session.mode)?;
        let anonymous = session.user_id.is_none();
        Ok(RoomSession {
            id: session.session_id.clone(),
            mode,
            hide_chords: session.hide_chords,
            display_name: session
                .user_email
                .clone()
                .or_else(|| session.guest_display_name.clone())
                .unwrap_or_else(|| "Guest".into()),
            avatar_url: session.user_avatar_url.clone(),
            anonymous,
            connected: session.connected && Self::session_is_active(session),
            is_host: room.host_session_id == session.id,
            is_av_host: room.av_session_id.as_ref() == Some(&session.id)
                && Self::session_is_active(session),
        })
    }

    fn host_user_id(room: &RoomRecord, sessions: &[SessionRecord]) -> Option<String> {
        sessions
            .iter()
            .find(|session| session.id == room.host_session_id)
            .and_then(|session| session.user_id.as_ref())
            .map(record_id_string)
    }

    fn host_lease_expires_at(room: &RoomRecord, sessions: &[SessionRecord]) -> DateTime<Utc> {
        sessions
            .iter()
            .find(|session| session.id == room.host_session_id)
            .map(|session| session.lease_expires_at.into())
            .unwrap_or_else(Utc::now)
    }

    fn summary_from_room(
        room: &RoomRecord,
        sessions: &[SessionRecord],
    ) -> Result<RoomSummary, AppError> {
        let active = sessions
            .iter()
            .filter(|session| Self::session_is_active(session))
            .collect::<Vec<_>>();
        let av_occupied = room
            .av_session_id
            .as_ref()
            .is_some_and(|id| active.iter().any(|session| session.id == *id));
        Ok(RoomSummary {
            id: record_id_string(&room.id),
            name: room.name.clone(),
            team_id: record_id_string(&room.owner),
            queue_additions_allowed: room.queue_additions_allowed,
            host_email: room.host_email.clone(),
            can_close: false,
            session_count: active.len(),
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
        session_id: Option<&str>,
    ) -> Result<RoomSnapshot, AppError> {
        let sessions = aggregate
            .sessions
            .iter()
            .filter(|session| Self::session_is_active(session))
            .map(|session| Self::public_session(&aggregate.room, session))
            .collect::<Result<Vec<_>, _>>()?;
        Ok(RoomSnapshot {
            summary: Self::summary_from_room(&aggregate.room, &aggregate.sessions)?,
            new_joins_locked: aggregate.room.new_joins_locked,
            content: aggregate.content.clone(),
            queue: Self::ranked_queue(&aggregate.queue, &aggregate.queue_votes),
            voted_queue_ids: session_id
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
            sessions,
            revision: aggregate.room.revision.max(0) as u64,
            host_lease_expires_at: Self::host_lease_expires_at(
                &aggregate.room,
                &aggregate.sessions,
            ),
            guest_access_allowed: aggregate.room.guest_access_allowed,
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
SELECT id, owner, name, host_email,
       musical_state_json, queue_json, queue_votes_json, projection_json, revision, queue_additions_allowed,
       invite_hash, host_session_id, av_session_id,
       created_at, closed_at, guest_access_allowed, new_joins_locked
FROM ONLY type::record('player_room', $room_id);
SELECT content_json FROM ONLY type::record('player_room_snapshot', $room_id);
SELECT id, session_id, user_id, guest_display_name, mode, hide_chords, resume_hash,
       ticket_hash, expires_at, consumed_at, connected, lease_expires_at,
       joined_at, connection_generation,
       user_id.email AS user_email, user_id.oauth_picture_url AS user_avatar_url
FROM player_room_session
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
        let sessions = response.take::<Vec<SessionRecord>>(2)?;
        let mut content: RoomContent = serde_json::from_str(&snapshot.content_json)
            .map_err(|e| AppError::internal_from_err("room.snapshot.decode", e))?;
        for item in &mut content.items {
            *item = RoomContent::normalize_song(item.clone());
        }
        let musical_state = serde_json::from_str(&room.musical_state_json)
            .map_err(|e| AppError::internal_from_err("room.musical.decode", e))?;
        let mut queue: Vec<RoomQueueItem> = serde_json::from_str(&room.queue_json)
            .map_err(|e| AppError::internal_from_err("room.queue.decode", e))?;
        for item in &mut queue {
            Self::normalize_queue_item(item);
        }
        let queue_votes = serde_json::from_str(&room.queue_votes_json)
            .map_err(|e| AppError::internal_from_err("room.queue_votes.decode", e))?;
        let projection = room
            .projection_json
            .as_deref()
            .map(serde_json::from_str)
            .transpose()
            .map_err(|e| AppError::internal_from_err("room.projection.decode", e))?;
        Ok(Some(RoomAggregate {
            room,
            content,
            queue,
            queue_votes,
            musical_state,
            projection,
            sessions,
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

    async fn issue_ticket(&self, room_id: &str, session_id: &str) -> Result<String, AppError> {
        let ticket = Self::secret()?;
        let connection_generation = Uuid::new_v4().to_string();
        let expires_at = Utc::now() + Duration::seconds(TICKET_SECONDS);
        let mut response = self
            .db
            .db
            .query(
                "UPDATE type::record('player_room_session', $id) SET ticket_hash = $ticket_hash, expires_at = $expires_at, consumed_at = NONE, connection_generation = $connection_generation RETURN AFTER",
            )
            .bind(("id", Self::session_record_id(room_id, session_id)))
            .bind(("ticket_hash", Self::hash(&ticket)))
            .bind(("expires_at", expires_at))
            .bind(("connection_generation", connection_generation))
            .await?;
        surreal_take_errors("room.ticket.create", &mut response)?;
        if response.take::<Vec<SessionRecord>>(0)?.is_empty() {
            return Err(AppError::unauthorized());
        }
        Ok(ticket)
    }

    pub async fn create(&self, mut input: CreateRoomInput) -> Result<CreatedRoom, AppError> {
        for item in &mut input.content.items {
            *item = RoomContent::normalize_song(item.clone());
        }
        for item in &mut input.initial_queue {
            Self::normalize_queue_item(item);
        }
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
        let session_id = Uuid::new_v4().to_string();
        let session_row_id = format!("{room_id}:{session_id}");
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
    owner: type::record('team', $team_id), name: $name,
    host_email: $host_email,
    musical_state_json: $musical_json, queue_json: $queue_json, queue_votes_json: "{}", projection_json: $projection_json,
    queue_additions_allowed: false,
    revision: 1, invite_hash: $invite_hash, host_session_id: $host_session_id,
    av_session_id: $av_session_id,
    created_at: $now, closed_at: NONE,
    guest_access_allowed: false, new_joins_locked: false
};
CREATE type::record('player_room_snapshot', $room_id) CONTENT {
    room: type::record('player_room', $room_id), content_json: $snapshot_json
};
CREATE type::record('player_room_session', $session_row_id) CONTENT {
    room: type::record('player_room', $room_id), session_id: $session_id, user_id: $user_id,
    guest_display_name: NONE, mode: $mode, hide_chords: false,
    resume_hash: $resume_hash, ticket_hash: $ticket_hash,
    expires_at: $ticket_expires_at, consumed_at: NONE,
    connected: false, lease_expires_at: $lease, joined_at: $now,
    connection_generation: $connection_generation
};
COMMIT TRANSACTION;
"#,
            )
            .bind(("room_id", room_id.clone()))
            .bind(("team_id", input.team_id.clone()))
            .bind(("name", name.clone()))
            .bind(("host_email", input.host_email.clone()))
            .bind(("snapshot_json", snapshot_json))
            .bind(("queue_json", queue_json))
            .bind(("musical_json", musical_json))
            .bind(("projection_json", projection_json))
            .bind(("invite_hash", Self::hash(&invite_secret)))
            .bind(("session_id", session_id.clone()))
            .bind((
                "host_session_id",
                Self::session_record_id(&room_id, &session_id),
            ))
            .bind((
                "av_session_id",
                (input.host_mode == RoomMode::Av)
                    .then(|| Self::session_record_id(&room_id, &session_id)),
            ))
            .bind(("now", now))
            .bind(("lease", lease))
            .bind(("session_row_id", session_row_id))
            .bind(("user_id", Some(Self::user_record_id(&input.host_user_id))))
            .bind(("mode", Self::mode_to_db(input.host_mode).to_string()))
            .bind(("resume_hash", Self::hash(&resume_credential)))
            .bind(("ticket_hash", Self::hash(&connection_ticket)))
            .bind(("ticket_expires_at", now + Duration::seconds(TICKET_SECONDS)))
            .bind(("connection_generation", Uuid::new_v4().to_string()))
            .await?;
        surreal_take_errors("room.create", &mut response)?;

        let summary = RoomSummary {
            id: room_id.clone(),
            name,
            team_id: input.team_id,
            queue_additions_allowed: false,
            host_email: input.host_email,
            can_close: true,
            session_count: 1,
            av_occupied: input.host_mode == RoomMode::Av,
            created_at: now,
        };
        Ok(CreatedRoom {
            room: summary,
            credentials: RoomCredentials {
                room_id,
                session_id,
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
SELECT id, owner, queue_additions_allowed, name, host_email,
       host_session_id, av_session_id, created_at
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
                "SELECT id, room, user_id, connected, lease_expires_at FROM player_room_session WHERE room IN $rooms",
            )
            .bind(("rooms", room_ids))
            .await?;
        let room_sessions = response.take::<Vec<RoomListSessionRecord>>(0)?;
        let now = Utc::now();
        let needle = q.unwrap_or("").trim().to_lowercase();
        let mut summaries = Vec::new();
        for room in rooms {
            let room_id = record_id_string(&room.id);
            let sessions = room_sessions
                .iter()
                .filter(|session| session.room == room.id)
                .collect::<Vec<_>>();
            let active_sessions = sessions
                .iter()
                .filter(|session| {
                    session.connected && DateTime::<Utc>::from(session.lease_expires_at) > now
                })
                .collect::<Vec<_>>();
            let haystack = format!("{} {}", room.name, room.host_email).to_lowercase();
            if !needle.is_empty() && !haystack.contains(&needle) {
                continue;
            }
            let av_occupied = room
                .av_session_id
                .as_ref()
                .is_some_and(|id| active_sessions.iter().any(|session| session.id == *id));
            let host_user_id = sessions
                .iter()
                .find(|session| session.id == room.host_session_id)
                .and_then(|session| session.user_id.as_ref())
                .map(record_id_string);
            summaries.push(RoomSummary {
                id: room_id,
                name: room.name,
                team_id: record_id_string(&room.owner),
                queue_additions_allowed: room.queue_additions_allowed,
                host_email: room.host_email,
                can_close: host_user_id.as_deref() == Some(user_id)
                    || closable_teams.contains(&record_id_string(&room.owner)),
                session_count: active_sessions.len(),
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
        _email: &str,
        _avatar_url: Option<String>,
        mode: RoomMode,
        hide_chords: bool,
        resume: Option<&str>,
        teams: &[String],
    ) -> Result<RoomCredentials, AppError> {
        self.join(
            room_id,
            Some(user_id),
            None,
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
        guest_display_name: Option<&str>,
        mode: RoomMode,
        hide_chords: bool,
        resume: Option<&str>,
        teams: Option<&[String]>,
    ) -> Result<RoomCredentials, AppError> {
        if guest_display_name
            .is_some_and(|name| name.trim().is_empty() || name.chars().count() > MAX_GUEST_NAME)
        {
            return Err(AppError::invalid_request(
                "display name must be 1-80 characters",
            ));
        }
        let aggregate = self.load_active_aggregate(room_id).await?;
        if teams.is_some_and(|allowed| !allowed.contains(&record_id_string(&aggregate.room.owner)))
        {
            return Err(AppError::NotFound("room has ended".into()));
        }
        if user_id.is_none() && !aggregate.room.guest_access_allowed {
            return Err(AppError::conflict("guests_not_allowed"));
        }

        let resume_hash = resume.map(Self::hash);
        let resumed = resume_hash.as_ref().and_then(|hash| {
            aggregate.sessions.iter().find(|session| {
                session.resume_hash == *hash
                    && user_id.is_none_or(|user_id| {
                        session.user_id.as_ref().map(record_id_string).as_deref() == Some(user_id)
                    })
                    && (user_id.is_some() || session.user_id.is_none())
            })
        });
        if aggregate.room.new_joins_locked && resumed.is_none() {
            return Err(AppError::conflict("room_locked"));
        }
        let (session_id, resume_credential, is_new) = if let Some(session) = resumed {
            if Self::mode_from_db(&session.mode)? != mode {
                return Err(AppError::conflict(
                    "session mode is fixed; join again without resuming",
                ));
            }
            (
                session.session_id.clone(),
                resume.unwrap().to_string(),
                false,
            )
        } else {
            (Uuid::new_v4().to_string(), Self::secret()?, true)
        };

        if mode == RoomMode::Av
            && aggregate.room.av_session_id.as_ref().is_some_and(|id| {
                id != &Self::session_record_id(room_id, &session_id)
                    && aggregate
                        .sessions
                        .iter()
                        .any(|session| session.id == *id && Self::session_is_active(session))
            })
        {
            return Err(AppError::conflict("AV mode is already occupied"));
        }

        let now = Utc::now();
        let lease = now + Duration::seconds(LEASE_SECONDS);
        let ticket = Self::secret()?;
        let connection_generation = Uuid::new_v4().to_string();
        let session_record_id = Self::session_record_id(room_id, &session_id);
        let user_record_id = user_id.map(Self::user_record_id);
        let guest_name = guest_display_name.map(|name| name.trim().to_string());
        let query = if is_new {
            r#"
BEGIN TRANSACTION;
CREATE type::record('player_room_session', $session_record_id) CONTENT {
    room: type::record('player_room', $room_id), session_id: $session_id, user_id: $user_id,
    guest_display_name: $guest_display_name, mode: $mode, hide_chords: $hide_chords,
    resume_hash: $resume_hash, ticket_hash: $ticket_hash,
    expires_at: $ticket_expires_at, consumed_at: NONE,
    connected: false, lease_expires_at: $lease, joined_at: $joined_at,
    connection_generation: $connection_generation
};
UPDATE type::record('player_room', $room_id)
SET revision += 1,
    av_session_id = IF $claim_av THEN $session_record_id ELSE av_session_id END;
COMMIT TRANSACTION;
"#
        } else {
            r#"
BEGIN TRANSACTION;
UPDATE type::record('player_room_session', $session_record_id)
SET hide_chords = $hide_chords, ticket_hash = $ticket_hash,
    expires_at = $ticket_expires_at, consumed_at = NONE,
    connected = false, lease_expires_at = $lease,
    connection_generation = $connection_generation;
UPDATE type::record('player_room', $room_id)
SET revision += 1,
    av_session_id = IF $claim_av THEN $session_record_id ELSE av_session_id END;
COMMIT TRANSACTION;
"#
        };
        let mut response = self
            .db
            .db
            .query(query)
            .bind(("session_record_id", session_record_id))
            .bind(("room_id", room_id.to_string()))
            .bind(("session_id", session_id.clone()))
            .bind(("user_id", user_record_id))
            .bind(("guest_display_name", guest_name))
            .bind(("mode", Self::mode_to_db(mode).to_string()))
            .bind(("hide_chords", mode == RoomMode::Sheet && hide_chords))
            .bind(("resume_hash", Self::hash(&resume_credential)))
            .bind(("lease", lease))
            .bind(("joined_at", now))
            .bind(("claim_av", mode == RoomMode::Av))
            .bind(("ticket_hash", Self::hash(&ticket)))
            .bind(("ticket_expires_at", now + Duration::seconds(TICKET_SECONDS)))
            .bind(("connection_generation", connection_generation))
            .await?;
        surreal_take_errors("room.join", &mut response)?;

        if is_new {
            let aggregate = self.load_active_aggregate(room_id).await?;
            self.publish_sessions(room_id, &aggregate).await?;
        }
        Ok(RoomCredentials {
            room_id: room_id.to_string(),
            session_id,
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
        let summary = Self::summary_from_room(&aggregate.room, &aggregate.sessions)?;
        Ok(RoomInviteInfo {
            room_id: summary.id,
            name: summary.name,
            host_email: summary.host_email,
            av_occupied: summary.av_occupied,
            guest_access_allowed: aggregate.room.guest_access_allowed,
            new_joins_locked: aggregate.room.new_joins_locked,
        })
    }

    pub async fn join_invite(&self, request: &JoinRoomInvite) -> Result<RoomCredentials, AppError> {
        let info = self.inspect_invite(&request.invite_secret).await?;
        self.join(
            &info.room_id,
            None,
            Some(&request.display_name),
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
        let session = aggregate
            .sessions
            .iter()
            .find(|session| session.resume_hash == hash)
            .ok_or_else(AppError::unauthorized)?;
        let mode = Self::mode_from_db(&session.mode)?;
        let lease = Utc::now() + Duration::seconds(LEASE_SECONDS);
        let mut response = self
            .db
            .db
            .query("UPDATE type::record('player_room_session', $row_id) SET connected = false, lease_expires_at = $lease")
            .bind((
                "row_id",
                session.id.clone(),
            ))
            .bind(("lease", lease))
            .await?;
        surreal_take_errors("room.reconnect", &mut response)?;
        let connection_ticket = self.issue_ticket(room_id, &session.session_id).await?;
        Ok(RoomCredentials {
            room_id: room_id.to_string(),
            session_id: session.session_id.clone(),
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
        if Self::host_user_id(&aggregate.room, &aggregate.sessions).as_deref() != Some(user_id)
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
                "UPDATE player_room_session SET consumed_at = time::now() WHERE ticket_hash = $hash AND consumed_at = NONE AND expires_at > time::now() RETURN BEFORE",
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
        let session_index = aggregate
            .sessions
            .iter()
            .position(|session| session.session_id == ticket.session_id)
            .ok_or_else(AppError::unauthorized)?;
        let session_id = aggregate.sessions[session_index].session_id.clone();
        let sender = self.sender(&room_id).await;
        let receiver = sender.subscribe();
        let lease = Utc::now() + Duration::seconds(LEASE_SECONDS);
        let mut response = self
            .db
            .db
            .query(
                r#"
UPDATE type::record('player_room_session', $row_id)
SET connected = true, lease_expires_at = $lease
WHERE connection_generation = $connection_generation;
UPDATE type::record('player_room', $room_id)
SET revision += 1;
"#,
            )
            .bind(("row_id", Self::session_record_id(&room_id, &session_id)))
            .bind(("room_id", room_id.clone()))
            .bind(("lease", lease))
            .bind((
                "connection_generation",
                ticket.connection_generation.clone(),
            ))
            .await?;
        surreal_take_errors("room.ticket.consume", &mut response)?;
        aggregate.room.revision += 1;
        aggregate.sessions[session_index].connected = true;
        aggregate.sessions[session_index].lease_expires_at = lease.into();
        let snapshot = Self::snapshot(&aggregate, Some(&session_id))?;
        self.publish_sessions(&room_id, &aggregate).await?;
        Ok((
            room_id,
            session_id,
            ticket.connection_generation,
            receiver,
            snapshot,
        ))
    }

    pub async fn snapshot_for_session(
        &self,
        room_id: &str,
        session_id: &str,
    ) -> Result<RoomSnapshot, AppError> {
        let aggregate = self
            .load_active_aggregate(room_id)
            .await
            .map_err(|_| AppError::unauthorized())?;
        if !aggregate
            .sessions
            .iter()
            .any(|session| session.session_id == session_id && Self::session_is_active(session))
        {
            return Err(AppError::unauthorized());
        }
        Self::snapshot(&aggregate, Some(session_id))
    }

    fn session_is_active_member(aggregate: &RoomAggregate, user_id: &str) -> bool {
        aggregate.sessions.iter().any(|session| {
            session.user_id.as_ref().map(record_id_string).as_deref() == Some(user_id)
                && Self::session_is_active(session)
        })
    }

    fn queue_contains_song(aggregate: &RoomAggregate, song_id: &str) -> bool {
        aggregate.queue.iter().any(|item| item.song_id == song_id)
    }

    pub async fn ensure_queue_additions_allowed(
        &self,
        room_id: &str,
        user_id: &str,
        teams: &[String],
    ) -> Result<(), AppError> {
        let aggregate = self.load_active_aggregate(room_id).await?;
        let owner = record_id_string(&aggregate.room.owner);
        if !teams.contains(&owner) || !Self::session_is_active_member(&aggregate, user_id) {
            return Err(AppError::unauthorized());
        }
        if !aggregate.room.queue_additions_allowed {
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
        if !teams.contains(&owner) || !Self::session_is_active_member(&aggregate, user_id) {
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
        queue_additions_allowed: bool,
        revision: u64,
    ) -> Result<(), AppError> {
        let aggregate = self.load_active_aggregate(room_id).await?;
        let owner = record_id_string(&aggregate.room.owner);
        if !teams.contains(&owner)
            || Self::host_user_id(&aggregate.room, &aggregate.sessions).as_deref() != Some(user_id)
        {
            return Err(AppError::forbidden());
        }
        if aggregate.room.revision.max(0) as u64 != revision {
            return Err(AppError::conflict("revision_conflict"));
        }
        if aggregate.room.queue_additions_allowed == queue_additions_allowed {
            return Ok(());
        }
        let mut response = self
            .db
            .db
            .query(
                "UPDATE player_room SET queue_additions_allowed = type::bool($queue_additions_allowed), revision += 1 WHERE id = type::record('player_room', $room_id) AND revision = $revision AND closed_at = NONE RETURN AFTER",
            )
            .bind(("room_id", room_id.to_string()))
            .bind(("revision", revision))
            .bind((
                "queue_additions_allowed",
                queue_additions_allowed.to_string(),
            ))
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
                queue_additions_allowed,
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
        if !teams.contains(&owner) || !Self::session_is_active_member(&aggregate, user_id) {
            return Err(AppError::unauthorized());
        }
        if !aggregate.room.queue_additions_allowed {
            return Err(AppError::conflict("room_queue_additions_disabled"));
        }
        let mut item = item;
        Self::normalize_queue_item(&mut item);
        if item.song_id.trim().is_empty() || item.song.song.id != item.song_id {
            return Err(AppError::invalid_request("invalid room queue song"));
        }
        if Self::queue_contains_song(&aggregate, &item.song_id) {
            return Err(AppError::conflict("song_already_in_queue"));
        }

        let participant_name = aggregate
            .sessions
            .iter()
            .find(|session| {
                session.user_id.as_ref().map(record_id_string).as_deref() == Some(user_id)
            })
            .and_then(|session| session.user_email.clone())
            .unwrap_or_else(|| item.added_by.clone());
        item.added_by = participant_name;
        item.played = false;
        item.upvotes = 0;
        let mut queue = Self::ranked_queue(&aggregate.queue, &aggregate.queue_votes);
        queue.push(item.clone());
        Self::rank_queue(&mut queue);
        let queue_json = serde_json::to_string(&queue)
            .map_err(|e| AppError::internal_from_err("room.queue.encode", e))?;
        let mut response = self
            .db
            .db
            .query(
                "UPDATE type::record('player_room', $room_id) SET queue_json = $queue_json, revision += 1 WHERE revision = $revision AND closed_at = NONE RETURN AFTER",
            )
            .bind(("room_id", room_id.to_string()))
            .bind(("queue_json", queue_json))
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
            || Self::host_user_id(&aggregate.room, &aggregate.sessions).as_deref() != Some(user_id)
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
        session_id: &str,
        queue_id: &str,
        upvoted: bool,
        revision: u64,
    ) -> Result<u64, AppError> {
        let aggregate = self.load_active_aggregate(room_id).await?;
        if !aggregate
            .sessions
            .iter()
            .any(|session| session.session_id == session_id && Self::session_is_active(session))
        {
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
            if !voters.iter().any(|voter| voter == session_id) {
                voters.push(session_id.to_string());
            }
        } else {
            voters.retain(|voter| voter != session_id);
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
            content.items.push((*queue_item.song).clone());
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
            started: true,
            language: None,
            transposition: None,
        };
        Self::validate_state(&content, &musical_state)?;
        let current_song_id = aggregate
            .musical_state
            .started
            .then(|| {
                aggregate
                    .content
                    .items
                    .get(aggregate.musical_state.item_index)
                    .map(|item| item.song.id.clone())
            })
            .flatten();
        let mut requeued_item = queue_item.clone();
        requeued_item.id = Uuid::new_v4().to_string();
        requeued_item.upvotes = 0;
        requeued_item.played = false;
        let mut queue = aggregate
            .queue
            .into_iter()
            .filter(|item| Some(item.id.as_str()) != queue_id)
            .map(|mut item| {
                if current_song_id.as_deref() == Some(item.song_id.as_str()) {
                    item.played = true;
                }
                item
            })
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
        let mut response = self
            .db
            .db
            .query(
                r#"
BEGIN TRANSACTION;
UPDATE type::record('player_room', $room_id)
SET queue_json = $queue_json, queue_votes_json = $queue_votes_json, musical_state_json = $musical_json,
    revision += 1
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
            || Self::host_user_id(&aggregate.room, &aggregate.sessions).as_deref() != Some(user_id)
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
        session_id: &str,
        connection_generation: &str,
        client_revision: Option<u64>,
    ) -> Result<Option<ServerEvent>, AppError> {
        let lease = Utc::now() + Duration::seconds(LEASE_SECONDS);
        let mut response = self
            .db
            .db
            .query(
                r#"
UPDATE type::record('player_room_session', $row_id)
SET connected = true, lease_expires_at = $lease
WHERE connection_generation = $connection_generation
RETURN session_id;
SELECT revision
FROM ONLY type::record('player_room', $room_id)
WHERE closed_at = NONE;
"#,
            )
            .bind(("row_id", Self::session_record_id(room_id, session_id)))
            .bind(("room_id", room_id.to_string()))
            .bind(("lease", lease))
            .bind(("connection_generation", connection_generation.to_string()))
            .await?;
        surreal_take_errors("room.heartbeat", &mut response)?;
        let session = response
            .take::<Vec<HeartbeatSessionRecord>>(0)?
            .into_iter()
            .next();
        if session.as_ref().map(|record| record.session_id.as_str()) != Some(session_id) {
            return Err(AppError::unauthorized());
        }
        let Some(room) = response.take::<Vec<RevisionRecord>>(1)?.into_iter().next() else {
            return Ok(Some(ServerEvent::RoomEnded));
        };
        let revision = room.revision.max(0) as u64;
        if client_revision != Some(revision) {
            let refreshed = self.load_active_aggregate(room_id).await?;
            return Ok(Some(ServerEvent::Snapshot {
                snapshot: Box::new(Self::snapshot(&refreshed, Some(session_id))?),
            }));
        }
        let aggregate = self.load_active_aggregate(room_id).await?;
        Ok(Some(ServerEvent::Heartbeat {
            revision,
            host_lease_expires_at: Self::host_lease_expires_at(
                &aggregate.room,
                &aggregate.sessions,
            ),
        }))
    }

    pub async fn command(
        &self,
        room_id: &str,
        session_id: &str,
        command: ClientEvent,
    ) -> Result<Option<ServerEvent>, AppError> {
        let aggregate = self
            .load_active_aggregate(room_id)
            .await
            .map_err(|_| AppError::unauthorized())?;
        let session = aggregate
            .sessions
            .iter()
            .find(|session| session.session_id == session_id)
            .ok_or_else(AppError::unauthorized)?;
        self.command_with_generation(room_id, session_id, &session.connection_generation, command)
            .await
    }

    pub async fn command_with_generation(
        &self,
        room_id: &str,
        session_id: &str,
        connection_generation: &str,
        command: ClientEvent,
    ) -> Result<Option<ServerEvent>, AppError> {
        if let ClientEvent::Heartbeat { revision } = command {
            return self
                .heartbeat(room_id, session_id, connection_generation, revision)
                .await;
        }
        let aggregate = match self.load_active_aggregate(room_id).await {
            Ok(aggregate) => aggregate,
            Err(AppError::NotFound(_)) => return Ok(Some(ServerEvent::RoomEnded)),
            Err(error) => return Err(error),
        };
        let session_record_id = Self::session_record_id(room_id, session_id);
        if !aggregate.sessions.iter().any(|session| {
            session.id == session_record_id
                && Self::session_is_active(session)
                && session.connection_generation == connection_generation
        }) {
            return Err(AppError::unauthorized());
        }
        let revision = aggregate.room.revision.max(0) as u64;

        match command {
            ClientEvent::Heartbeat { .. } => {
                unreachable!("heartbeat handled before aggregate load")
            }
            ClientEvent::RequestSnapshot => Ok(Some(ServerEvent::Snapshot {
                snapshot: Box::new(Self::snapshot(&aggregate, Some(session_id))?),
            })),
            ClientEvent::Leave => {
                let mut response = self
                    .db
                    .db
                    .query(
                        r#"
UPDATE type::record('player_room_session', $row_id)
SET connected = false, lease_expires_at = time::now()
WHERE connection_generation = $connection_generation;
UPDATE type::record('player_room', $room_id)
SET revision += 1;
"#,
                    )
                    .bind(("row_id", session_record_id.clone()))
                    .bind(("room_id", room_id.to_string()))
                    .bind(("connection_generation", connection_generation.to_string()))
                    .await?;
                surreal_take_errors("room.leave", &mut response)?;
                let refreshed = self.load_active_aggregate(room_id).await?;
                let event = self.sessions_event(&refreshed)?;
                self.publish(room_id, event.clone()).await;
                Ok(Some(event))
            }
            ClientEvent::UpdateMusicalState {
                command_id,
                musical_state,
            } => {
                if aggregate.room.host_session_id != session_record_id {
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
                if aggregate.room.av_session_id.as_ref() != Some(&session_record_id) {
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
                guest_access_allowed,
            } => {
                if aggregate.room.host_session_id != session_record_id {
                    return Ok(Some(ServerEvent::CommandRejected {
                        command_id,
                        reason: "room_host_required".into(),
                        revision,
                    }));
                }
                if aggregate.room.guest_access_allowed == guest_access_allowed {
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
                        "guest_access_allowed = type::bool($value)",
                        "value",
                        guest_access_allowed.to_string(),
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
                        guest_access_allowed,
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
            ClientEvent::UpdateRoomLocked {
                command_id,
                new_joins_locked,
            } => {
                if aggregate.room.host_session_id != session_record_id {
                    return Ok(Some(ServerEvent::CommandRejected {
                        command_id,
                        reason: "room_host_required".into(),
                        revision,
                    }));
                }
                if aggregate.room.new_joins_locked == new_joins_locked {
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
                        "new_joins_locked = type::bool($value)",
                        "value",
                        new_joins_locked.to_string(),
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
                    ServerEvent::RoomLockedUpdated {
                        new_joins_locked,
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
                    .update_queue_vote(room_id, session_id, &queue_id, upvoted, vote_revision)
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

    fn sessions_event(&self, aggregate: &RoomAggregate) -> Result<ServerEvent, AppError> {
        let snapshot = Self::snapshot(aggregate, None)?;
        Ok(ServerEvent::SessionsChanged {
            session_count: snapshot.summary.session_count,
            av_occupied: snapshot.summary.av_occupied,
            sessions: snapshot.sessions,
            revision: snapshot.revision,
        })
    }

    async fn publish_sessions(
        &self,
        room_id: &str,
        aggregate: &RoomAggregate,
    ) -> Result<(), AppError> {
        let event = self.sessions_event(aggregate)?;
        self.publish(room_id, event).await;
        Ok(())
    }

    pub async fn disconnect(&self, room_id: &str, session_id: &str, connection_generation: &str) {
        let Ok(Some(aggregate)) = self.load_aggregate(room_id).await else {
            return;
        };
        let Some(session) = aggregate
            .sessions
            .iter()
            .find(|session| session.session_id == session_id)
        else {
            return;
        };
        if !session.connected || session.connection_generation != connection_generation {
            return;
        }
        let mut response = match self
            .db
            .db
            .query(
                r#"
UPDATE type::record('player_room_session', $row_id)
SET connected = false, lease_expires_at = time::now()
WHERE connection_generation = $connection_generation;
UPDATE type::record('player_room', $room_id)
SET revision += 1;
"#,
            )
            .bind(("row_id", Self::session_record_id(room_id, session_id)))
            .bind(("room_id", room_id.to_string()))
            .bind(("connection_generation", connection_generation.to_string()))
            .await
        {
            Ok(response) => response,
            Err(_) => return,
        };
        if surreal_take_errors("room.disconnect", &mut response).is_err() {
            return;
        }
        if let Ok(aggregate) = self.load_active_aggregate(room_id).await {
            let _ = self.publish_sessions(room_id, &aggregate).await;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use chordlib::types::{Line, Part, Section, Song as SongData};
    use shared::blob::BlobLink;
    use shared::player::PlayerChordsItem;

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
        let song = shared::song::Song {
            id: "song-1".into(),
            data: SongData {
                titles: vec!["Song".into()],
                ..SongData::default()
            },
            blobs: vec![BlobLink {
                id: "blob-1".into(),
            }],
            ..shared::song::Song::default()
        };
        service
            .create(CreateRoomInput {
                team_id: "team-1".into(),
                name: None,
                host_user_id: "user-1".into(),
                host_email: "host@example.com".into(),
                content: RoomContent {
                    items: vec![PlayerChordsItem {
                        song,
                        language: None,
                        flow: None,
                    }],
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
    async fn rooms_strip_blob_references_from_content_and_queue() {
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

        let snapshot = service
            .snapshot_for_session(&created.room.id, &created.credentials.session_id)
            .await
            .unwrap();
        assert!(snapshot.content.items[0].song.blobs.is_empty());
        assert!(snapshot.queue[0].song.song.blobs.is_empty());

        let mut response = db
            .db
            .query("SELECT * FROM ONLY type::record('player_room', $room_id)")
            .bind(("room_id", created.room.id))
            .await
            .unwrap();
        let row: Option<serde_json::Value> = response.take(0).unwrap();
        let row = row.unwrap();
        assert!(row.get("media_ids").is_none());
        assert!(row.get("snapshot_json").is_none());
        assert!(row.get("state_json").is_none());
    }

    #[tokio::test]
    async fn new_rooms_start_without_an_active_song_or_guest_access() {
        let db = crate::test_helpers::test_db().await.unwrap();
        let service = service(db);
        let created = create_room(&service).await;

        let snapshot = service
            .snapshot_for_session(&created.room.id, &created.credentials.session_id)
            .await
            .unwrap();

        assert!(!snapshot.musical_state.started);
        assert!(!snapshot.guest_access_allowed);
    }

    #[tokio::test]
    async fn one_user_can_have_independent_room_sessions_and_resume_each_mode() {
        let db = crate::test_helpers::test_db().await.unwrap();
        let service = service(db);
        let created = create_room(&service).await;

        let sheet = service
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
        let av = service
            .join_authenticated(
                &created.room.id,
                "user-2",
                "member@example.com",
                None,
                RoomMode::Av,
                false,
                None,
                &["team-1".into()],
            )
            .await
            .unwrap();

        assert_ne!(sheet.session_id, av.session_id);
        assert_eq!(sheet.mode, RoomMode::Sheet);
        assert_eq!(av.mode, RoomMode::Av);
        let resumed = service
            .join_authenticated(
                &created.room.id,
                "user-2",
                "member@example.com",
                None,
                RoomMode::Av,
                true,
                Some(&av.resume_credential),
                &["team-1".into()],
            )
            .await
            .unwrap();
        assert_eq!(resumed.session_id, av.session_id);
        assert_eq!(resumed.mode, RoomMode::Av);

        assert!(matches!(
            service
                .join_authenticated(
                    &created.room.id,
                    "user-2",
                    "member@example.com",
                    None,
                    RoomMode::Sheet,
                    false,
                    Some(&av.resume_credential),
                    &["team-1".into()],
                )
                .await,
            Err(AppError::Conflict(reason)) if reason == "session mode is fixed; join again without resuming"
        ));
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
            .snapshot_for_session(&created.room.id, &created.credentials.session_id)
            .await
            .unwrap();
        assert_eq!(queued.queue.len(), 2);
        assert_eq!(queued.queue[0].song_id, "song-2");
        assert!(queued.queue.iter().all(|item| !item.played));
        assert!(queued.queue[0].song.song.blobs.is_empty());
        service
            .update_queue_vote(
                &created.room.id,
                &created.credentials.session_id,
                "queue-song-2",
                true,
                queued.revision,
            )
            .await
            .unwrap();
        let voted = service
            .snapshot_for_session(&created.room.id, &created.credentials.session_id)
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
            .snapshot_for_session(&created.room.id, &member.session_id)
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
            .snapshot_for_session(&member.room_id, &member.session_id)
            .await
            .unwrap();
        assert_eq!(promoted.queue.len(), 2);
        assert_eq!(promoted.queue[0].song_id, "song-3");
        assert_eq!(promoted.queue[1].song_id, "song-2");
        assert_ne!(promoted.queue[1].id, "queue-song-2");
        assert_eq!(promoted.queue[1].upvotes, 0);
        assert!(!promoted.queue[1].played);
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
            .snapshot_for_session(&member.room_id, &member.session_id)
            .await
            .unwrap();
        assert_eq!(promoted_again.queue.len(), 2);
        assert_eq!(promoted_again.queue[0].song_id, "song-3");
        assert_eq!(promoted_again.queue[1].song_id, "song-2");
        assert_ne!(promoted_again.queue[1].id, requeued_id);
        assert!(!promoted_again.queue[1].played);
        assert_eq!(promoted_again.content.items.len(), 2);
    }

    #[tokio::test]
    async fn activating_the_next_queue_item_marks_the_previous_item_played() {
        let db = crate::test_helpers::test_db().await.unwrap();
        let service = service(db);
        let current = queued_song("song-1");
        let next = queued_song("song-2");
        let created = service
            .create(CreateRoomInput {
                team_id: "team-1".into(),
                name: Some("Room".into()),
                host_user_id: "user-1".into(),
                host_email: "host@example.com".into(),
                content: RoomContent {
                    items: vec![(*current.song).clone()],
                    toc: vec![TocItem {
                        idx: 0,
                        title: current.title.clone(),
                        id: Some(current.song_id.clone()),
                        nr: "1".into(),
                        liked: false,
                    }],
                },
                initial_queue: vec![current.clone(), next.clone()],
                host_mode: RoomMode::Sheet,
                musical_state: RoomMusicalState::default(),
                projection: None,
            })
            .await
            .unwrap();
        let before = service
            .snapshot_for_session(&created.room.id, &created.credentials.session_id)
            .await
            .unwrap();
        assert!(!before.musical_state.started);

        service
            .promote_queue_item(
                &created.room.id,
                "user-1",
                &["team-1".into()],
                &current.id,
                before.revision,
            )
            .await
            .unwrap();
        let same_song = service
            .snapshot_for_session(&created.room.id, &created.credentials.session_id)
            .await
            .unwrap();
        assert!(same_song.musical_state.started);
        assert!(
            !same_song
                .queue
                .iter()
                .find(|item| item.song_id == current.song_id)
                .unwrap()
                .played
        );

        service
            .promote_queue_item(
                &created.room.id,
                "user-1",
                &["team-1".into()],
                &next.id,
                same_song.revision,
            )
            .await
            .unwrap();

        let after = service
            .snapshot_for_session(&created.room.id, &created.credentials.session_id)
            .await
            .unwrap();
        let previous = after
            .queue
            .iter()
            .find(|item| item.song_id == current.song_id)
            .unwrap();
        let selected = after
            .queue
            .iter()
            .find(|item| item.song_id == next.song_id)
            .unwrap();
        assert!(previous.played);
        assert!(!selected.played);
        assert_eq!(after.musical_state.item_index, 1);
    }

    #[tokio::test]
    async fn first_queue_activation_does_not_mark_the_default_song_played() {
        let db = crate::test_helpers::test_db().await.unwrap();
        let service = service(db);
        let first = queued_song("song-1");
        let third = queued_song("song-3");
        let created = service
            .create(CreateRoomInput {
                team_id: "team-1".into(),
                name: Some("Room".into()),
                host_user_id: "user-1".into(),
                host_email: "host@example.com".into(),
                content: RoomContent {
                    items: vec![(*first.song).clone()],
                    toc: vec![TocItem {
                        idx: 0,
                        title: first.title.clone(),
                        id: Some(first.song_id.clone()),
                        nr: "1".into(),
                        liked: false,
                    }],
                },
                initial_queue: vec![first.clone(), third.clone()],
                host_mode: RoomMode::Sheet,
                musical_state: RoomMusicalState::default(),
                projection: None,
            })
            .await
            .unwrap();
        let before = service
            .snapshot_for_session(&created.room.id, &created.credentials.session_id)
            .await
            .unwrap();

        service
            .promote_queue_item(
                &created.room.id,
                "user-1",
                &["team-1".into()],
                &third.id,
                before.revision,
            )
            .await
            .unwrap();

        let after = service
            .snapshot_for_session(&created.room.id, &created.credentials.session_id)
            .await
            .unwrap();
        assert!(after.musical_state.started);
        assert_eq!(after.musical_state.item_index, 1);
        assert!(
            !after
                .queue
                .iter()
                .find(|item| item.song_id == first.song_id)
                .unwrap()
                .played
        );
    }

    #[tokio::test]
    async fn upvoting_a_played_item_returns_it_to_the_upcoming_ranking() {
        let db = crate::test_helpers::test_db().await.unwrap();
        let service = service(db);
        let current = queued_song("song-1");
        let created = service
            .create(CreateRoomInput {
                team_id: "team-1".into(),
                name: Some("Room".into()),
                host_user_id: "user-1".into(),
                host_email: "host@example.com".into(),
                content: RoomContent {
                    items: vec![(*current.song).clone()],
                    toc: vec![TocItem {
                        idx: 0,
                        title: current.title.clone(),
                        id: Some(current.song_id.clone()),
                        nr: "1".into(),
                        liked: false,
                    }],
                },
                initial_queue: vec![current],
                host_mode: RoomMode::Sheet,
                musical_state: RoomMusicalState {
                    started: true,
                    ..RoomMusicalState::default()
                },
                projection: None,
            })
            .await
            .unwrap();
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
            .snapshot_for_session(&created.room.id, &created.credentials.session_id)
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
            .snapshot_for_session(&created.room.id, &created.credentials.session_id)
            .await
            .unwrap();
        let played_id = played_snapshot
            .queue
            .iter()
            .find(|item| item.song_id == "song-1")
            .map(|item| item.id.clone())
            .unwrap();
        assert!(
            played_snapshot
                .queue
                .iter()
                .find(|item| item.song_id == "song-1")
                .unwrap()
                .played
        );

        service
            .update_queue_vote(
                &created.room.id,
                &created.credentials.session_id,
                &played_id,
                true,
                played_snapshot.revision,
            )
            .await
            .unwrap();
        let upvoted = service
            .snapshot_for_session(&created.room.id, &created.credentials.session_id)
            .await
            .unwrap();
        assert_eq!(upvoted.queue[0].song_id, "song-1");
        assert!(!upvoted.queue[0].played);
        assert_eq!(upvoted.queue[0].upvotes, 1);

        service
            .update_queue_vote(
                &created.room.id,
                &created.credentials.session_id,
                &played_id,
                false,
                upvoted.revision,
            )
            .await
            .unwrap();
        let unvoted = service
            .snapshot_for_session(&created.room.id, &created.credentials.session_id)
            .await
            .unwrap();
        assert_eq!(unvoted.queue[0].song_id, "song-1");
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
        service
            .command(
                &created.room.id,
                &created.credentials.session_id,
                ClientEvent::UpdateGuestsAllowed {
                    command_id: "enable-guests".into(),
                    guest_access_allowed: true,
                },
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
            .snapshot_for_session(&created.room.id, &guest.session_id)
            .await
            .unwrap()
            .revision;
        service
            .update_queue_vote(
                &created.room.id,
                &guest.session_id,
                "queue-song-3",
                true,
                guest_revision,
            )
            .await
            .unwrap();
        let member_revision = service
            .snapshot_for_session(&created.room.id, &member.session_id)
            .await
            .unwrap()
            .revision;
        service
            .update_queue_vote(
                &created.room.id,
                &member.session_id,
                "queue-song-3",
                true,
                member_revision,
            )
            .await
            .unwrap();

        let ranked = service
            .snapshot_for_session(&created.room.id, &created.credentials.session_id)
            .await
            .unwrap();
        assert_eq!(ranked.queue[0].song_id, "song-3");
        assert_eq!(ranked.queue[0].upvotes, 2);
        assert!(ranked.voted_queue_ids.is_empty());

        let host_revision = ranked.revision;
        service
            .update_queue_vote(
                &created.room.id,
                &created.credentials.session_id,
                "queue-song-3",
                true,
                host_revision,
            )
            .await
            .unwrap();
        let ranked = service
            .snapshot_for_session(&created.room.id, &created.credentials.session_id)
            .await
            .unwrap();
        assert_eq!(ranked.queue[0].upvotes, 3);
        assert_eq!(ranked.voted_queue_ids, vec!["queue-song-3"]);

        service
            .update_queue_vote(
                &created.room.id,
                &created.credentials.session_id,
                "queue-song-3",
                false,
                ranked.revision,
            )
            .await
            .unwrap();
        let unvoted = service
            .snapshot_for_session(&created.room.id, &created.credentials.session_id)
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
            ServerEvent::QueueAccessUpdated {
                queue_additions_allowed: true,
                ..
            }
        ));
        let snapshot = service
            .snapshot_for_session(&created.room.id, &created.credentials.session_id)
            .await
            .unwrap();
        assert!(snapshot.summary.queue_additions_allowed);
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
    async fn room_lock_blocks_new_joins_and_publishes_a_delta() {
        let db = crate::test_helpers::test_db().await.unwrap();
        let service = service(db);
        let created = create_room(&service).await;
        let mut events = service.sender(&created.room.id).await.subscribe();

        let accepted = service
            .command(
                &created.room.id,
                &created.credentials.session_id,
                ClientEvent::UpdateRoomLocked {
                    command_id: "lock-room".into(),
                    new_joins_locked: true,
                },
            )
            .await
            .unwrap();
        assert!(matches!(
            accepted,
            Some(ServerEvent::CommandAccepted { .. })
        ));
        assert!(matches!(
            events.recv().await.unwrap(),
            ServerEvent::RoomLockedUpdated {
                new_joins_locked: true,
                ..
            }
        ));

        let snapshot = service
            .snapshot_for_session(&created.room.id, &created.credentials.session_id)
            .await
            .unwrap();
        assert!(snapshot.new_joins_locked);
        assert!(matches!(
            service
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
                .await,
            Err(AppError::Conflict(reason)) if reason == "room_locked"
        ));
        assert!(
            service
                .inspect_invite(&created.invite_secret)
                .await
                .unwrap()
                .new_joins_locked
        );

        service
            .reconnect(&created.room.id, &created.credentials.resume_credential)
            .await
            .unwrap();

        let accepted = service
            .command(
                &created.room.id,
                &created.credentials.session_id,
                ClientEvent::UpdateRoomLocked {
                    command_id: "unlock-room".into(),
                    new_joins_locked: false,
                },
            )
            .await
            .unwrap();
        assert!(matches!(
            accepted,
            Some(ServerEvent::CommandAccepted { .. })
        ));
        assert!(matches!(
            events.recv().await.unwrap(),
            ServerEvent::RoomLockedUpdated {
                new_joins_locked: false,
                ..
            }
        ));
        service
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
            items: vec![PlayerChordsItem {
                song: shared::song::Song {
                    data: SongData {
                        languages: vec!["English".into()],
                        ..SongData::default()
                    },
                    ..shared::song::Song::default()
                },
                language: None,
                flow: None,
            }],
            toc: vec![],
        };
        let mut state = RoomMusicalState {
            item_index: 0,
            started: false,
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
                &created.credentials.session_id,
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
                &created.credentials.session_id,
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
                &created.credentials.session_id,
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
                &created.credentials.session_id,
                ClientEvent::UpdateGuestsAllowed {
                    command_id: "remote-update".into(),
                    guest_access_allowed: true,
                },
            )
            .await
            .unwrap();
        let reconciled = second_instance
            .command(
                &created.room.id,
                &created.credentials.session_id,
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
                assert!(snapshot.guest_access_allowed);
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
                &created.credentials.session_id,
                ClientEvent::UpdateGuestsAllowed {
                    command_id: "disable-guests".into(),
                    guest_access_allowed: false,
                },
            )
            .await
            .unwrap()
            .expect("host update accepted");
        let info = service
            .inspect_invite(&created.invite_secret)
            .await
            .unwrap();
        assert!(!info.guest_access_allowed);
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
                "UPDATE player_room_session SET connected = false, lease_expires_at = time::now() - 1s WHERE room = type::record('player_room', $room_id)",
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
        assert_eq!(rooms[0].session_count, 0);
        assert!(service.inspect_invite(&created.invite_secret).await.is_ok());

        let restored = service
            .join_authenticated(
                &created.room.id,
                "user-1",
                "host@example.com",
                None,
                RoomMode::Sheet,
                false,
                Some(&created.credentials.resume_credential),
                &["team-1".into()],
            )
            .await
            .unwrap();
        assert_eq!(restored.session_id, created.credentials.session_id);
        let (_, _, _, _, snapshot) = service
            .consume_ticket(&restored.connection_ticket)
            .await
            .unwrap();
        assert!(
            snapshot.sessions.iter().any(|participant| {
                participant.id == restored.session_id && participant.is_host
            })
        );

        let accepted = service
            .command(
                &created.room.id,
                &restored.session_id,
                ClientEvent::UpdateGuestsAllowed {
                    command_id: "restored-host".into(),
                    guest_access_allowed: false,
                },
            )
            .await
            .unwrap()
            .unwrap();
        assert!(matches!(accepted, ServerEvent::CommandAccepted { .. }));

        let second_session = service
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
        let (_, _, _, _, snapshot) = service
            .consume_ticket(&second_session.connection_ticket)
            .await
            .unwrap();
        assert!(
            snapshot
                .sessions
                .iter()
                .any(|session| { session.id == second_session.session_id && !session.is_host })
        );
        assert!(matches!(
            service
                .command(
                    &created.room.id,
                    &second_session.session_id,
                    ClientEvent::UpdateGuestsAllowed {
                        command_id: "other-session-host".into(),
                        guest_access_allowed: true,
                    },
                )
                .await,
            Ok(Some(ServerEvent::CommandRejected { reason, .. }))
                if reason == "room_host_required"
        ));
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
