use std::{
    collections::{HashMap, HashSet},
    sync::Arc,
};

use chrono::{DateTime, Duration, Utc};
use ring::{
    digest,
    rand::{SecureRandom, SystemRandom},
};
use serde::Deserialize;
use surrealdb::types::{Datetime, RecordId, SurrealValue};
use tokio::sync::{RwLock, broadcast};
use uuid::Uuid;

use shared::player::PlayerItem;
use shared::player_room::*;

use crate::{
    database::{Database, record_id_string, surreal_take_errors},
    error::AppError,
};

const LEASE_SECONDS: i64 = 30;
const TICKET_SECONDS: i64 = 60;
const MAX_GUEST_NAME: usize = 80;
const MAX_PROJECTION_BYTES: usize = 256 * 1024;

#[derive(Clone)]
pub struct PlayerRoomService {
    db: Arc<Database>,
    /// Process-local delivery only. Durable room state always comes from the database;
    /// clients on other instances reconcile by revision on their next heartbeat.
    senders: Arc<RwLock<HashMap<String, broadcast::Sender<ServerEvent>>>>,
}

#[derive(Debug, Clone, Deserialize, SurrealValue)]
struct RoomRecord {
    id: RecordId,
    owner: RecordId,
    source_type: String,
    source_id: String,
    source_title: String,
    name: String,
    host_email: String,
    musical_state_json: String,
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
    source_type: String,
    source_id: String,
    source_title: String,
    name: String,
    host_email: String,
    av_participant_id: Option<String>,
    created_at: Datetime,
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
    content: PlayerRoomContent,
    musical_state: PlayerRoomMusicalState,
    projection: Option<PlayerRoomProjectionPayload>,
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
        musical_state: PlayerRoomMusicalState,
    },
    UpdateProjection {
        command_id: String,
        projection: PlayerRoomProjectionPayload,
    },
    UpdateGuestsAllowed {
        command_id: String,
        guests_allowed: bool,
    },
    RequestSnapshot,
    Leave,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ServerEvent {
    Snapshot {
        snapshot: Box<PlayerRoomSnapshot>,
    },
    Heartbeat {
        revision: u64,
        host_lease_expires_at: DateTime<Utc>,
    },
    MusicalStateUpdated {
        musical_state: PlayerRoomMusicalState,
        revision: u64,
    },
    ProjectionUpdated {
        projection: PlayerRoomProjectionPayload,
        revision: u64,
    },
    GuestsAllowedUpdated {
        guests_allowed: bool,
        revision: u64,
    },
    ParticipantsChanged {
        participants: Vec<PlayerRoomParticipant>,
        participant_count: usize,
        av_occupied: bool,
        revision: u64,
    },
    CommandAccepted {
        command_id: String,
        revision: u64,
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
    pub source_title: String,
    pub content: PlayerRoomContent,
    pub host_user_id: String,
    pub host_email: String,
    pub host_avatar_url: Option<String>,
    pub request: CreatePlayerRoom,
}

fn default_guests_allowed() -> bool {
    true
}

impl PlayerRoomService {
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

    fn hash(secret: &str) -> String {
        hex::encode(digest::digest(&digest::SHA256, secret.as_bytes()))
    }

    fn source_type_to_db(source_type: PlayerRoomSourceType) -> &'static str {
        match source_type {
            PlayerRoomSourceType::Song => "song",
            PlayerRoomSourceType::Collection => "collection",
            PlayerRoomSourceType::Setlist => "setlist",
        }
    }

    fn source_type_from_db(value: &str) -> Result<PlayerRoomSourceType, AppError> {
        match value {
            "song" => Ok(PlayerRoomSourceType::Song),
            "collection" => Ok(PlayerRoomSourceType::Collection),
            "setlist" => Ok(PlayerRoomSourceType::Setlist),
            _ => Err(AppError::database("invalid player-room source type")),
        }
    }

    fn mode_to_db(mode: PlayerRoomMode) -> &'static str {
        match mode {
            PlayerRoomMode::Sheet => "sheet",
            PlayerRoomMode::Av => "av",
            PlayerRoomMode::Slide => "slide",
        }
    }

    fn mode_from_db(value: &str) -> Result<PlayerRoomMode, AppError> {
        match value {
            "sheet" => Ok(PlayerRoomMode::Sheet),
            "av" => Ok(PlayerRoomMode::Av),
            "slide" => Ok(PlayerRoomMode::Slide),
            _ => Err(AppError::database("invalid player-room participant mode")),
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

    fn validate_state(
        content: &PlayerRoomContent,
        state: &PlayerRoomMusicalState,
    ) -> Result<(), AppError> {
        let Some(item) = content.items.get(state.item_index) else {
            return Err(AppError::invalid_request(
                "player room item index is out of range",
            ));
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

    fn normalize_initial_language(content: &PlayerRoomContent, state: &mut PlayerRoomMusicalState) {
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

    fn validate_projection(projection: &PlayerRoomProjectionPayload) -> Result<(), AppError> {
        let size = serde_json::to_vec(projection)
            .map_err(|e| AppError::internal_from_err("player_room.projection", e))?
            .len();
        if size > MAX_PROJECTION_BYTES {
            return Err(AppError::invalid_request(
                "player room projection payload is too large",
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

    fn collect_media(content: &PlayerRoomContent) -> HashSet<String> {
        let mut ids = HashSet::new();
        for item in &content.items {
            match item {
                PlayerItem::Blob(blob) => {
                    ids.insert(blob.blob_id.clone());
                }
                PlayerItem::Chords(chords) => {
                    ids.extend(chords.song.blobs.iter().map(|blob| blob.id.clone()));
                }
            }
        }
        ids
    }

    fn is_active(room: &RoomRecord) -> bool {
        let lease: DateTime<Utc> = room.host_lease_expires_at.into();
        room.closed_at.is_none() && lease > Utc::now()
    }

    fn participant_is_active(participant: &ParticipantRecord) -> bool {
        let lease: DateTime<Utc> = participant.lease_expires_at.into();
        lease > Utc::now()
    }

    fn public_participant(
        room: &RoomRecord,
        participant: &ParticipantRecord,
    ) -> Result<PlayerRoomParticipant, AppError> {
        let mode = Self::mode_from_db(&participant.mode)?;
        Ok(PlayerRoomParticipant {
            id: participant.participant_id.clone(),
            mode,
            hide_chords: participant.hide_chords,
            display_name: participant.display_name.clone(),
            avatar_url: participant.avatar_url.clone(),
            anonymous: participant.anonymous,
            connected: participant.connected && Self::participant_is_active(participant),
            is_host: participant.participant_id == room.host_participant_id,
            is_av_host: room.av_participant_id.as_deref()
                == Some(participant.participant_id.as_str())
                && Self::participant_is_active(participant),
        })
    }

    fn summary_from_room(
        room: &RoomRecord,
        participants: &[ParticipantRecord],
    ) -> Result<PlayerRoomSummary, AppError> {
        let active = participants
            .iter()
            .filter(|participant| Self::participant_is_active(participant))
            .collect::<Vec<_>>();
        let av_occupied = room.av_participant_id.as_ref().is_some_and(|id| {
            active
                .iter()
                .any(|participant| participant.participant_id == *id)
        });
        Ok(PlayerRoomSummary {
            id: record_id_string(&room.id),
            name: room.name.clone(),
            team_id: record_id_string(&room.owner),
            source_type: Self::source_type_from_db(&room.source_type)?,
            source_id: room.source_id.clone(),
            source_title: room.source_title.clone(),
            host_email: room.host_email.clone(),
            participant_count: active.len(),
            av_occupied,
            created_at: room.created_at.into(),
        })
    }

    fn snapshot(aggregate: &RoomAggregate) -> Result<PlayerRoomSnapshot, AppError> {
        let participants = aggregate
            .participants
            .iter()
            .filter(|participant| Self::participant_is_active(participant))
            .map(|participant| Self::public_participant(&aggregate.room, participant))
            .collect::<Result<Vec<_>, _>>()?;
        Ok(PlayerRoomSnapshot {
            summary: Self::summary_from_room(&aggregate.room, &aggregate.participants)?,
            content: aggregate.content.clone(),
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
SELECT id, owner, source_type, source_id, source_title, name, host_email,
       musical_state_json, projection_json, revision,
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
            .map_err(|e| crate::log_and_convert!(AppError::database, "player_room.load", e))?;
        surreal_take_errors("player_room.load", &mut response)?;
        let Some(room) = response.take::<Option<RoomRecord>>(0)? else {
            return Ok(None);
        };
        let snapshot = response
            .take::<Option<SnapshotRecord>>(1)?
            .ok_or_else(|| AppError::Internal("player room snapshot is missing".into()))?;
        let participants = response.take::<Vec<ParticipantRecord>>(2)?;
        let content = serde_json::from_str(&snapshot.content_json)
            .map_err(|e| AppError::internal_from_err("player_room.snapshot.decode", e))?;
        let musical_state = serde_json::from_str(&room.musical_state_json)
            .map_err(|e| AppError::internal_from_err("player_room.musical.decode", e))?;
        let projection = room
            .projection_json
            .as_deref()
            .map(serde_json::from_str)
            .transpose()
            .map_err(|e| AppError::internal_from_err("player_room.projection.decode", e))?;
        Ok(Some(RoomAggregate {
            room,
            content,
            musical_state,
            projection,
            participants,
        }))
    }

    async fn load_active_aggregate(&self, room_id: &str) -> Result<RoomAggregate, AppError> {
        let aggregate = self
            .load_aggregate(room_id)
            .await?
            .ok_or_else(|| AppError::NotFound("player room not found".into()))?;
        if !Self::is_active(&aggregate.room) {
            return Err(AppError::NotFound("player room has ended".into()));
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
        surreal_take_errors("player_room.ticket.create", &mut response)?;
        Ok(ticket)
    }

    pub async fn create(&self, mut input: CreateRoomInput) -> Result<CreatedPlayerRoom, AppError> {
        Self::normalize_initial_language(&input.content, &mut input.request.musical_state);
        Self::validate_state(&input.content, &input.request.musical_state)?;
        if let Some(projection) = &input.request.projection {
            Self::validate_projection(projection)?;
        }
        if input.request.host_mode == PlayerRoomMode::Slide {
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
            .map_err(|e| AppError::internal_from_err("player_room.snapshot.encode", e))?;
        let musical_json = serde_json::to_string(&input.request.musical_state)
            .map_err(|e| AppError::internal_from_err("player_room.musical.encode", e))?;
        let projection_json = input
            .request
            .projection
            .as_ref()
            .map(serde_json::to_string)
            .transpose()
            .map_err(|e| AppError::internal_from_err("player_room.projection.encode", e))?;
        let media_ids = Self::collect_media(&input.content)
            .into_iter()
            .collect::<Vec<_>>();
        let name = format!("{} — {}", input.source_title, input.host_email);

        let mut response = self
            .db
            .db
            .query(
                r#"
BEGIN TRANSACTION;
CREATE type::record('player_room', $room_id) CONTENT {
    owner: type::record('team', $team_id), source_type: $source_type,
    source_id: $source_id, source_title: $source_title, name: $name,
    host_email: $host_email, snapshot_json: NONE, state_json: NONE,
    musical_state_json: $musical_json, projection_json: $projection_json,
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
                Self::source_type_to_db(input.request.source_type).to_string(),
            ))
            .bind(("source_id", input.request.source_id.clone()))
            .bind(("source_title", input.source_title.clone()))
            .bind(("name", name.clone()))
            .bind(("host_email", input.host_email.clone()))
            .bind(("snapshot_json", snapshot_json))
            .bind(("musical_json", musical_json))
            .bind(("projection_json", projection_json))
            .bind(("invite_hash", Self::hash(&invite_secret)))
            .bind(("participant_id", participant_id.clone()))
            .bind((
                "av_participant_id",
                (input.request.host_mode == PlayerRoomMode::Av).then(|| participant_id.clone()),
            ))
            .bind(("media_ids", media_ids))
            .bind(("now", now))
            .bind(("lease", lease))
            .bind(("participant_row_id", format!("{room_id}:{participant_id}")))
            .bind(("user_id", Some(input.host_user_id)))
            .bind(("display_name", input.host_email.clone()))
            .bind(("avatar_url", input.host_avatar_url))
            .bind((
                "mode",
                Self::mode_to_db(input.request.host_mode).to_string(),
            ))
            .bind(("resume_hash", Self::hash(&resume_credential)))
            .bind(("ticket_id", Uuid::new_v4().to_string()))
            .bind(("ticket_hash", Self::hash(&connection_ticket)))
            .bind(("ticket_expires_at", now + Duration::seconds(TICKET_SECONDS)))
            .await?;
        surreal_take_errors("player_room.create", &mut response)?;

        let summary = PlayerRoomSummary {
            id: room_id.clone(),
            name,
            team_id: input.team_id,
            source_type: input.request.source_type,
            source_id: input.request.source_id,
            source_title: input.source_title,
            host_email: input.host_email,
            participant_count: 1,
            av_occupied: input.request.host_mode == PlayerRoomMode::Av,
            created_at: now,
        };
        Ok(CreatedPlayerRoom {
            room: summary,
            credentials: PlayerRoomCredentials {
                room_id,
                participant_id,
                mode: input.request.host_mode,
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
    ) -> Result<Vec<PlayerRoomSummary>, AppError> {
        let owners = teams
            .iter()
            .map(|team| RecordId::new("team", team.clone()))
            .collect::<Vec<_>>();
        let mut response = self
            .db
            .db
            .query(
                r#"
SELECT id, owner, source_type, source_id, source_title, name, host_email,
       av_participant_id, created_at
FROM player_room
WHERE owner IN $owners AND closed_at = NONE AND host_lease_expires_at > time::now()
ORDER BY created_at DESC;
"#,
            )
            .bind(("owners", owners))
            .await?;
        surreal_take_errors("player_room.list", &mut response)?;
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
            let haystack =
                format!("{} {} {}", room.name, room.source_title, room.host_email).to_lowercase();
            if !needle.is_empty() && !haystack.contains(&needle) {
                continue;
            }
            let av_occupied = room.av_participant_id.as_ref().is_some_and(|id| {
                participants
                    .iter()
                    .any(|participant| participant.participant_id == *id)
            });
            summaries.push(PlayerRoomSummary {
                id: room_id,
                name: room.name,
                team_id: record_id_string(&room.owner),
                source_type: Self::source_type_from_db(&room.source_type)?,
                source_id: room.source_id,
                source_title: room.source_title,
                host_email: room.host_email,
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
    ) -> Result<PlayerRoomSnapshot, AppError> {
        let aggregate = self.load_active_aggregate(room_id).await?;
        if !teams.contains(&record_id_string(&aggregate.room.owner)) {
            return Err(AppError::NotFound("player room not found".into()));
        }
        Self::snapshot(&aggregate)
    }

    #[allow(clippy::too_many_arguments)]
    pub async fn join_authenticated(
        &self,
        room_id: &str,
        user_id: &str,
        email: &str,
        avatar_url: Option<String>,
        mode: PlayerRoomMode,
        hide_chords: bool,
        resume: Option<&str>,
        teams: &[String],
    ) -> Result<PlayerRoomCredentials, AppError> {
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
        mode: PlayerRoomMode,
        hide_chords: bool,
        resume: Option<&str>,
        teams: Option<&[String]>,
    ) -> Result<PlayerRoomCredentials, AppError> {
        if display_name.trim().is_empty() || display_name.chars().count() > MAX_GUEST_NAME {
            return Err(AppError::invalid_request(
                "display name must be 1-80 characters",
            ));
        }
        let aggregate = self.load_active_aggregate(room_id).await?;
        if teams.is_some_and(|allowed| !allowed.contains(&record_id_string(&aggregate.room.owner)))
        {
            return Err(AppError::NotFound("player room has ended".into()));
        }
        if anonymous && !aggregate.room.guests_allowed {
            return Err(AppError::conflict("guests_not_allowed"));
        }

        let resume_hash = resume.map(Self::hash);
        let resumed = resume_hash.as_ref().and_then(|hash| {
            aggregate.participants.iter().find(|participant| {
                participant.resume_hash == *hash && Self::participant_is_active(participant)
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

        if mode == PlayerRoomMode::Av
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
SET revision += 1, av_participant_id = IF $claim_av THEN $participant_id ELSE av_participant_id END;
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
            .bind(("hide_chords", mode == PlayerRoomMode::Sheet && hide_chords))
            .bind(("resume_hash", Self::hash(&resume_credential)))
            .bind(("lease", lease))
            .bind(("joined_at", now))
            .bind(("claim_av", mode == PlayerRoomMode::Av))
            .bind(("ticket_id", Uuid::new_v4().to_string()))
            .bind(("ticket_hash", Self::hash(&ticket)))
            .bind(("ticket_expires_at", now + Duration::seconds(TICKET_SECONDS)))
            .await?;
        surreal_take_errors("player_room.join", &mut response)?;

        if is_new {
            let aggregate = self.load_active_aggregate(room_id).await?;
            self.publish_participants(room_id, &aggregate).await?;
        }
        Ok(PlayerRoomCredentials {
            room_id: room_id.to_string(),
            participant_id,
            mode,
            resume_credential,
            connection_ticket: ticket,
        })
    }

    pub async fn inspect_invite(&self, secret: &str) -> Result<PlayerRoomInviteInfo, AppError> {
        let mut response = self
            .db
            .db
            .query(
                "SELECT id FROM ONLY player_room WHERE invite_hash = $hash AND closed_at = NONE AND host_lease_expires_at > time::now()",
            )
            .bind(("hash", Self::hash(secret)))
            .await?;
        #[derive(Deserialize, SurrealValue)]
        struct IdRecord {
            id: RecordId,
        }
        let room = response
            .take::<Option<IdRecord>>(0)?
            .ok_or_else(|| AppError::NotFound("player room has ended".into()))?;
        let aggregate = self
            .load_active_aggregate(&record_id_string(&room.id))
            .await?;
        let summary = Self::summary_from_room(&aggregate.room, &aggregate.participants)?;
        Ok(PlayerRoomInviteInfo {
            room_id: summary.id,
            name: summary.source_title,
            host_email: summary.host_email,
            av_occupied: summary.av_occupied,
            guests_allowed: aggregate.room.guests_allowed,
        })
    }

    pub async fn join_invite(
        &self,
        request: &JoinPlayerRoomInvite,
    ) -> Result<PlayerRoomCredentials, AppError> {
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
    ) -> Result<PlayerRoomCredentials, AppError> {
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
            .query(
                "UPDATE type::record('player_room_participant', $row_id) SET lease_expires_at = $lease",
            )
            .bind((
                "row_id",
                format!("{room_id}:{}", participant.participant_id),
            ))
            .bind(("lease", lease))
            .await?;
        surreal_take_errors("player_room.reconnect", &mut response)?;
        let connection_ticket = self
            .issue_ticket(room_id, &participant.participant_id)
            .await?;
        Ok(PlayerRoomCredentials {
            room_id: room_id.to_string(),
            participant_id: participant.participant_id.clone(),
            mode,
            resume_credential: resume.to_string(),
            connection_ticket,
        })
    }

    pub async fn close(&self, room_id: &str, resume: &str) -> Result<(), AppError> {
        let aggregate = self.load_active_aggregate(room_id).await?;
        let host = aggregate
            .participants
            .iter()
            .find(|participant| participant.participant_id == aggregate.room.host_participant_id)
            .ok_or_else(AppError::forbidden)?;
        if host.resume_hash != Self::hash(resume) {
            return Err(AppError::forbidden());
        }
        let mut response = self
            .db
            .db
            .query(
                "UPDATE type::record('player_room', $room_id) SET closed_at = time::now(), revision += 1",
            )
            .bind(("room_id", room_id.to_string()))
            .await?;
        surreal_take_errors("player_room.close", &mut response)?;
        self.publish(room_id, ServerEvent::RoomEnded).await;
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
            PlayerRoomSnapshot,
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
        let is_host = participant_id == aggregate.room.host_participant_id;
        let mut response = self
            .db
            .db
            .query(
                r#"
UPDATE type::record('player_room_participant', $row_id)
SET connected = true, lease_expires_at = $lease;
UPDATE type::record('player_room', $room_id)
SET revision += 1, host_lease_expires_at = IF $is_host THEN $lease ELSE host_lease_expires_at END;
"#,
            )
            .bind(("row_id", format!("{room_id}:{participant_id}")))
            .bind(("room_id", room_id.clone()))
            .bind(("lease", lease))
            .bind(("is_host", is_host))
            .await?;
        surreal_take_errors("player_room.ticket.consume", &mut response)?;
        aggregate.room.revision += 1;
        if is_host {
            aggregate.room.host_lease_expires_at = lease.into();
        }
        aggregate.participants[participant_index].connected = true;
        aggregate.participants[participant_index].lease_expires_at = lease.into();
        let snapshot = Self::snapshot(&aggregate)?;
        self.publish_participants(&room_id, &aggregate).await?;
        Ok((room_id, participant_id, receiver, snapshot))
    }

    pub async fn snapshot_for_participant(
        &self,
        room_id: &str,
        participant_id: &str,
    ) -> Result<PlayerRoomSnapshot, AppError> {
        let aggregate = self
            .load_active_aggregate(room_id)
            .await
            .map_err(|_| AppError::unauthorized())?;
        if !aggregate.participants.iter().any(|participant| {
            participant.participant_id == participant_id && Self::participant_is_active(participant)
        }) {
            return Err(AppError::unauthorized());
        }
        Self::snapshot(&aggregate)
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
            "UPDATE player_room SET {assignment}, revision += 1 WHERE id = type::record('player_room', $room_id) AND revision = $revision AND closed_at = NONE AND host_lease_expires_at > time::now() RETURN AFTER"
        );
        let mut response = self
            .db
            .db
            .query(query)
            .bind(("room_id", room_id.to_string()))
            .bind(("revision", revision))
            .bind((binding_name, binding_value))
            .await?;
        surreal_take_errors("player_room.state.update", &mut response)?;
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
UPDATE type::record('player_room', $room_id)
SET host_lease_expires_at = IF host_participant_id = $participant_id THEN $lease ELSE host_lease_expires_at END
WHERE closed_at = NONE AND host_lease_expires_at > time::now()
RETURN revision, host_lease_expires_at;
"#,
            )
            .bind(("row_id", format!("{room_id}:{participant_id}")))
            .bind(("room_id", room_id.to_string()))
            .bind(("participant_id", participant_id.to_string()))
            .bind(("lease", lease))
            .await?;
        surreal_take_errors("player_room.heartbeat", &mut response)?;
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
                snapshot: Box::new(Self::snapshot(&refreshed)?),
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
                snapshot: Box::new(Self::snapshot(&aggregate)?),
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
                surreal_take_errors("player_room.leave", &mut response)?;
                let refreshed = self.load_active_aggregate(room_id).await?;
                let event = self.participants_event(&refreshed)?;
                self.publish(room_id, event.clone()).await;
                Ok(Some(event))
            }
            ClientEvent::UpdateMusicalState {
                command_id,
                musical_state,
            } => {
                if participant_id != aggregate.room.host_participant_id {
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
                    }));
                }
                let encoded = serde_json::to_string(&musical_state)
                    .map_err(|e| AppError::internal_from_err("player_room.musical.encode", e))?;
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
                    }));
                }
                let encoded = serde_json::to_string(&projection)
                    .map_err(|e| AppError::internal_from_err("player_room.projection.encode", e))?;
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
                }))
            }
            ClientEvent::UpdateGuestsAllowed {
                command_id,
                guests_allowed,
            } => {
                if participant_id != aggregate.room.host_participant_id {
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
                }))
            }
            ClientEvent::Authenticate { .. } => {
                Err(AppError::invalid_request("already authenticated"))
            }
        }
    }

    fn participants_event(&self, aggregate: &RoomAggregate) -> Result<ServerEvent, AppError> {
        let snapshot = Self::snapshot(aggregate)?;
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
        if surreal_take_errors("player_room.disconnect", &mut response).is_err() {
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
            return Err(AppError::NotFound("player room media not found".into()));
        }
        Ok(record_id_string(&aggregate.room.owner))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use chordlib::types::{Line, Part, Section, Song as SongData};
    use shared::player::{PlayerBlobItem, PlayerChordsItem, PlayerItem};

    #[derive(Debug, Deserialize, SurrealValue)]
    struct PersistedRoomState {
        musical_state_json: String,
        projection_json: Option<String>,
        revision: i64,
    }

    fn request() -> CreatePlayerRoom {
        CreatePlayerRoom {
            source_type: PlayerRoomSourceType::Song,
            source_id: "song-1".into(),
            host_mode: PlayerRoomMode::Sheet,
            musical_state: PlayerRoomMusicalState::default(),
            projection: None,
        }
    }

    fn service(db: Arc<Database>) -> PlayerRoomService {
        PlayerRoomService::new(db)
    }

    async fn create_room(service: &PlayerRoomService) -> CreatedPlayerRoom {
        service
            .create(CreateRoomInput {
                team_id: "team-1".into(),
                source_title: "Song".into(),
                content: PlayerRoomContent {
                    items: vec![PlayerItem::Blob(PlayerBlobItem {
                        blob_id: "blob-1".into(),
                    })],
                    toc: vec![],
                },
                host_user_id: "user-1".into(),
                host_email: "host@example.com".into(),
                host_avatar_url: None,
                request: request(),
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
        surreal_take_errors("player_room.test.persisted_state", &mut response).unwrap();
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
        assert!(PlayerRoomService::effective_language_is_available(
            &song, "L1"
        ));
        assert!(PlayerRoomService::effective_language_is_available(
            &song, "L2"
        ));
        assert!(!PlayerRoomService::effective_language_is_available(
            &song, "L3"
        ));
        song.languages = vec!["English".into(), String::new()];
        assert!(PlayerRoomService::effective_language_is_available(
            &song, "English"
        ));
        assert!(PlayerRoomService::effective_language_is_available(
            &song, "L2"
        ));
    }

    #[test]
    fn unavailable_initial_language_falls_back_to_default() {
        let content = PlayerRoomContent {
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
        let mut state = PlayerRoomMusicalState {
            item_index: 0,
            language: Some("German".into()),
            transposition: None,
        };
        PlayerRoomService::normalize_initial_language(&content, &mut state);
        assert_eq!(state.language, None);
        assert!(PlayerRoomService::validate_state(&content, &state).is_ok());
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
                PlayerRoomMode::Av,
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
                PlayerRoomMode::Av,
                false,
                None,
                &teams,
            )
            .await
            .unwrap_err();
        assert!(matches!(error, AppError::Conflict(_)));
        service
            .close(&created.room.id, &created.credentials.resume_credential)
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
            .join_invite(&JoinPlayerRoomInvite {
                invite_secret: created.invite_secret,
                display_name: "Guest".into(),
                mode: PlayerRoomMode::Sheet,
                hide_chords: false,
                resume_credential: None,
            })
            .await
            .unwrap_err();
        assert!(matches!(error, AppError::Conflict(_)));
    }
}
