use std::{
    collections::{HashMap, HashSet},
    sync::Arc,
};

use chrono::{DateTime, Duration, Utc};
use ring::{
    digest,
    rand::{SecureRandom, SystemRandom},
};
use surrealdb::types::SurrealValue;
use tokio::sync::{RwLock, broadcast};
use uuid::Uuid;

use shared::player::PlayerItem;
use shared::player_room::*;

use crate::{database::Database, error::AppError};

const LEASE_SECONDS: i64 = 30;
const TICKET_SECONDS: i64 = 60;
const MAX_GUEST_NAME: usize = 80;
const MAX_PROJECTION_BYTES: usize = 256 * 1024;

#[derive(Clone)]
pub struct PlayerRoomService {
    inner: Arc<RwLock<Store>>,
    db: Arc<Database>,
}

#[derive(Default)]
struct Store {
    rooms: HashMap<String, Room>,
    tickets: HashMap<String, Ticket>,
}

struct Room {
    summary: PlayerRoomSummary,
    content: PlayerRoomContent,
    musical_state: PlayerRoomMusicalState,
    projection: Option<PlayerRoomProjectionPayload>,
    participants: HashMap<String, Participant>,
    revision: u64,
    invite_hash: String,
    host_participant_id: String,
    av_participant_id: Option<String>,
    host_lease_expires_at: DateTime<Utc>,
    closed: bool,
    guests_allowed: bool,
    media_ids: HashSet<String>,
    events: broadcast::Sender<ServerEvent>,
    command_ids: HashSet<String>,
}

struct Participant {
    public: PlayerRoomParticipant,
    _user_id: Option<String>,
    resume_hash: String,
    lease_expires_at: DateTime<Utc>,
}

struct Ticket {
    room_id: String,
    participant_id: String,
    expires_at: DateTime<Utc>,
}

#[derive(serde::Serialize, serde::Deserialize)]
struct PersistedRoom {
    summary: PlayerRoomSummary,
    content: PlayerRoomContent,
    musical_state: PlayerRoomMusicalState,
    projection: Option<PlayerRoomProjectionPayload>,
    participants: Vec<PersistedParticipant>,
    revision: u64,
    invite_hash: String,
    host_participant_id: String,
    av_participant_id: Option<String>,
    host_lease_expires_at: DateTime<Utc>,
    closed: bool,
    #[serde(default = "default_guests_allowed")]
    guests_allowed: bool,
    media_ids: HashSet<String>,
    command_ids: HashSet<String>,
}

fn default_guests_allowed() -> bool {
    true
}

#[derive(serde::Serialize, serde::Deserialize)]
struct PersistedParticipant {
    public: PlayerRoomParticipant,
    user_id: Option<String>,
    resume_hash: String,
    lease_expires_at: DateTime<Utc>,
}

impl From<&Room> for PersistedRoom {
    fn from(room: &Room) -> Self {
        Self {
            summary: room.summary.clone(),
            content: room.content.clone(),
            musical_state: room.musical_state.clone(),
            projection: room.projection.clone(),
            participants: room
                .participants
                .values()
                .map(|p| PersistedParticipant {
                    public: p.public.clone(),
                    user_id: p._user_id.clone(),
                    resume_hash: p.resume_hash.clone(),
                    lease_expires_at: p.lease_expires_at,
                })
                .collect(),
            revision: room.revision,
            invite_hash: room.invite_hash.clone(),
            host_participant_id: room.host_participant_id.clone(),
            av_participant_id: room.av_participant_id.clone(),
            host_lease_expires_at: room.host_lease_expires_at,
            closed: room.closed,
            guests_allowed: room.guests_allowed,
            media_ids: room.media_ids.clone(),
            command_ids: room.command_ids.clone(),
        }
    }
}

impl PersistedRoom {
    fn into_room(self) -> Room {
        let (events, _) = broadcast::channel(128);
        Room {
            summary: self.summary,
            content: self.content,
            musical_state: self.musical_state,
            projection: self.projection,
            participants: self
                .participants
                .into_iter()
                .map(|p| {
                    (
                        p.public.id.clone(),
                        Participant {
                            public: p.public,
                            _user_id: p.user_id,
                            resume_hash: p.resume_hash,
                            lease_expires_at: p.lease_expires_at,
                        },
                    )
                })
                .collect(),
            revision: self.revision,
            invite_hash: self.invite_hash,
            host_participant_id: self.host_participant_id,
            av_participant_id: self.av_participant_id,
            host_lease_expires_at: self.host_lease_expires_at,
            closed: self.closed,
            guests_allowed: self.guests_allowed,
            media_ids: self.media_ids,
            events,
            command_ids: self.command_ids,
        }
    }
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ClientEvent {
    Authenticate {
        ticket: String,
    },
    Heartbeat,
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
        snapshot: PlayerRoomSnapshot,
    },
    StateUpdated {
        snapshot: PlayerRoomSnapshot,
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

impl PlayerRoomService {
    pub async fn new(db: Arc<Database>) -> Result<Self, AppError> {
        #[derive(serde::Deserialize, surrealdb::types::SurrealValue)]
        struct PersistedRow {
            state_json: String,
        }
        let mut response = db
            .db
            .query("SELECT state_json FROM player_room WHERE closed_at = NONE")
            .await?;
        let rows: Vec<PersistedRow> = response.take(0)?;
        let mut store = Store::default();
        for row in rows {
            if let Ok(persisted) = serde_json::from_str::<PersistedRoom>(&row.state_json) {
                let room = persisted.into_room();
                store.rooms.insert(room.summary.id.clone(), room);
            }
        }
        Ok(Self {
            inner: Arc::new(RwLock::new(store)),
            db,
        })
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
            return Err(AppError::invalid_request("projection payload is too large"));
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
                    ids.extend(chords.song.blobs.iter().map(|blob| blob.id.clone()))
                }
            }
        }
        ids
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
        let name = format!("{} — {}", input.source_title, input.host_email);
        let summary = PlayerRoomSummary {
            id: room_id.clone(),
            name,
            team_id: input.team_id,
            source_type: input.request.source_type,
            source_id: input.request.source_id,
            source_title: input.source_title,
            host_email: input.host_email.clone(),
            participant_count: 1,
            av_occupied: input.request.host_mode == PlayerRoomMode::Av,
            created_at: now,
        };
        let public = PlayerRoomParticipant {
            id: participant_id.clone(),
            mode: input.request.host_mode,
            hide_chords: false,
            display_name: input.host_email,
            avatar_url: input.host_avatar_url,
            anonymous: false,
            connected: false,
            is_host: true,
            is_av_host: input.request.host_mode == PlayerRoomMode::Av,
        };
        let participant = Participant {
            public,
            _user_id: Some(input.host_user_id),
            resume_hash: Self::hash(&resume_credential),
            lease_expires_at: now + Duration::seconds(LEASE_SECONDS),
        };
        let (events, _) = broadcast::channel(128);
        let mut participants = HashMap::new();
        participants.insert(participant_id.clone(), participant);
        let room = Room {
            summary: summary.clone(),
            content: input.content.clone(),
            musical_state: input.request.musical_state.clone(),
            projection: input.request.projection.clone(),
            participants,
            revision: 1,
            invite_hash: Self::hash(&invite_secret),
            host_participant_id: participant_id.clone(),
            av_participant_id: (input.request.host_mode == PlayerRoomMode::Av)
                .then(|| participant_id.clone()),
            host_lease_expires_at: now + Duration::seconds(LEASE_SECONDS),
            closed: false,
            guests_allowed: true,
            media_ids: Self::collect_media(&input.content),
            events,
            command_ids: HashSet::new(),
        };
        let ticket_hash = Self::hash(&connection_ticket);
        let mut store = self.inner.write().await;
        store.tickets.insert(
            ticket_hash,
            Ticket {
                room_id: room_id.clone(),
                participant_id: participant_id.clone(),
                expires_at: now + Duration::seconds(TICKET_SECONDS),
            },
        );
        store.rooms.insert(room_id.clone(), room);
        drop(store);
        self.persist_room(&room_id).await?;
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

    fn expire_locked(room: &mut Room, now: DateTime<Utc>) -> bool {
        if !room.closed && room.host_lease_expires_at <= now {
            room.closed = true;
            let _ = room.events.send(ServerEvent::RoomEnded);
            true
        } else {
            false
        }
    }

    fn snapshot(room: &Room) -> PlayerRoomSnapshot {
        let mut summary = room.summary.clone();
        summary.participant_count = room
            .participants
            .values()
            .filter(|p| p.lease_expires_at > Utc::now())
            .count();
        summary.av_occupied = room.av_participant_id.as_ref().is_some_and(|id| {
            room.participants
                .get(id)
                .is_some_and(|p| p.lease_expires_at > Utc::now())
        });
        PlayerRoomSnapshot {
            summary,
            content: room.content.clone(),
            musical_state: room.musical_state.clone(),
            projection: room.projection.clone(),
            participants: room
                .participants
                .values()
                .filter(|p| p.lease_expires_at > Utc::now())
                .map(|p| p.public.clone())
                .collect(),
            revision: room.revision,
            host_lease_expires_at: room.host_lease_expires_at,
            guests_allowed: room.guests_allowed,
        }
    }

    pub async fn list(&self, teams: &[String], q: Option<&str>) -> Vec<PlayerRoomSummary> {
        let mut store = self.inner.write().await;
        let now = Utc::now();
        let needle = q.unwrap_or("").trim().to_lowercase();
        let mut rows = Vec::new();
        for room in store.rooms.values_mut() {
            Self::expire_locked(room, now);
            if room.closed || !teams.contains(&room.summary.team_id) {
                continue;
            }
            let haystack = format!(
                "{} {} {}",
                room.summary.name, room.summary.source_title, room.summary.host_email
            )
            .to_lowercase();
            if !needle.is_empty() && !haystack.contains(&needle) {
                continue;
            }
            rows.push(Self::snapshot(room).summary);
        }
        rows.sort_by_key(|room| std::cmp::Reverse(room.created_at));
        rows
    }

    pub async fn get_for_teams(
        &self,
        room_id: &str,
        teams: &[String],
    ) -> Result<PlayerRoomSnapshot, AppError> {
        let mut store = self.inner.write().await;
        let room = store
            .rooms
            .get_mut(room_id)
            .ok_or_else(|| AppError::NotFound("player room not found".into()))?;
        Self::expire_locked(room, Utc::now());
        if room.closed || !teams.contains(&room.summary.team_id) {
            return Err(AppError::NotFound("player room not found".into()));
        }
        Ok(Self::snapshot(room))
    }

    fn issue_ticket(
        store: &mut Store,
        room_id: String,
        participant_id: String,
    ) -> Result<String, AppError> {
        let secret = Self::secret()?;
        store.tickets.insert(
            Self::hash(&secret),
            Ticket {
                room_id,
                participant_id,
                expires_at: Utc::now() + Duration::seconds(TICKET_SECONDS),
            },
        );
        Ok(secret)
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
        let now = Utc::now();
        let mut store = self.inner.write().await;
        let (participant_id, resume_credential, revision, event, sender) = {
            let room = store
                .rooms
                .get_mut(room_id)
                .ok_or_else(|| AppError::NotFound("player room has ended".into()))?;
            Self::expire_locked(room, now);
            if room.closed || teams.is_some_and(|allowed| !allowed.contains(&room.summary.team_id))
            {
                return Err(AppError::NotFound("player room has ended".into()));
            }
            if display_name.trim().is_empty() || display_name.chars().count() > MAX_GUEST_NAME {
                return Err(AppError::invalid_request(
                    "display name must be 1-80 characters",
                ));
            }
            let resumed = resume.and_then(|secret| {
                room.participants
                    .iter_mut()
                    .find(|(_, p)| p.resume_hash == Self::hash(secret))
            });
            let (participant_id, resume_credential) = if let Some((id, participant)) = resumed {
                if participant.public.mode != mode {
                    return Err(AppError::conflict(
                        "participant mode is fixed; leave and join again",
                    ));
                }
                participant.lease_expires_at = now + Duration::seconds(LEASE_SECONDS);
                participant.public.connected = false;
                (id.clone(), resume.unwrap().to_string())
            } else {
                if anonymous && !room.guests_allowed {
                    return Err(AppError::conflict("guests_not_allowed"));
                }
                if mode == PlayerRoomMode::Av
                    && room.av_participant_id.as_ref().is_some_and(|id| {
                        room.participants
                            .get(id)
                            .is_some_and(|p| p.lease_expires_at > now)
                    })
                {
                    return Err(AppError::conflict("AV mode is already occupied"));
                }
                let id = Uuid::new_v4().to_string();
                let credential = Self::secret()?;
                let public = PlayerRoomParticipant {
                    id: id.clone(),
                    mode,
                    hide_chords: mode == PlayerRoomMode::Sheet && hide_chords,
                    display_name: display_name.trim().to_string(),
                    avatar_url,
                    anonymous,
                    connected: false,
                    is_host: false,
                    is_av_host: mode == PlayerRoomMode::Av,
                };
                room.participants.insert(
                    id.clone(),
                    Participant {
                        public,
                        _user_id: user_id.map(str::to_string),
                        resume_hash: Self::hash(&credential),
                        lease_expires_at: now + Duration::seconds(LEASE_SECONDS),
                    },
                );
                if mode == PlayerRoomMode::Av {
                    room.av_participant_id = Some(id.clone());
                }
                (id, credential)
            };
            room.revision += 1;
            let snapshot = Self::snapshot(room);
            let event = ServerEvent::StateUpdated { snapshot };
            let sender = room.events.clone();
            (
                participant_id,
                resume_credential,
                room.revision,
                event,
                sender,
            )
        };
        let ticket = Self::issue_ticket(&mut store, room_id.to_string(), participant_id.clone())?;
        let _ = sender.send(event);
        let _ = revision;
        let credentials = PlayerRoomCredentials {
            room_id: room_id.to_string(),
            participant_id,
            mode,
            resume_credential,
            connection_ticket: ticket,
        };
        drop(store);
        self.persist_room(room_id).await?;
        Ok(credentials)
    }

    pub async fn inspect_invite(&self, secret: &str) -> Result<PlayerRoomInviteInfo, AppError> {
        let hash = Self::hash(secret);
        let mut store = self.inner.write().await;
        let room = store
            .rooms
            .values_mut()
            .find(|r| r.invite_hash == hash)
            .ok_or_else(|| AppError::NotFound("player room has ended".into()))?;
        Self::expire_locked(room, Utc::now());
        if room.closed {
            return Err(AppError::NotFound("player room has ended".into()));
        }
        Ok(PlayerRoomInviteInfo {
            room_id: room.summary.id.clone(),
            name: room.summary.source_title.clone(),
            host_email: room.summary.host_email.clone(),
            av_occupied: Self::snapshot(room).summary.av_occupied,
            guests_allowed: room.guests_allowed,
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
        let mut store = self.inner.write().await;
        let (participant_id, mode) = {
            let room = store
                .rooms
                .get_mut(room_id)
                .ok_or_else(AppError::unauthorized)?;
            Self::expire_locked(room, Utc::now());
            if room.closed {
                return Err(AppError::unauthorized());
            }
            let (id, participant) = room
                .participants
                .iter_mut()
                .find(|(_, participant)| participant.resume_hash == Self::hash(resume))
                .ok_or_else(AppError::unauthorized)?;
            participant.lease_expires_at = Utc::now() + Duration::seconds(LEASE_SECONDS);
            (id.clone(), participant.public.mode)
        };
        let ticket = Self::issue_ticket(&mut store, room_id.to_string(), participant_id.clone())?;
        let credentials = PlayerRoomCredentials {
            room_id: room_id.to_string(),
            participant_id,
            mode,
            resume_credential: resume.to_string(),
            connection_ticket: ticket,
        };
        drop(store);
        self.persist_room(room_id).await?;
        Ok(credentials)
    }

    pub async fn close(&self, room_id: &str, resume: &str) -> Result<(), AppError> {
        let mut store = self.inner.write().await;
        let room = store
            .rooms
            .get_mut(room_id)
            .ok_or_else(|| AppError::NotFound("player room not found".into()))?;
        let host = room
            .participants
            .get(&room.host_participant_id)
            .ok_or_else(AppError::forbidden)?;
        if host.resume_hash != Self::hash(resume) {
            return Err(AppError::forbidden());
        }
        room.closed = true;
        room.revision += 1;
        let _ = room.events.send(ServerEvent::RoomEnded);
        drop(store);
        self.persist_room(room_id).await
    }

    pub async fn consume_ticket(
        &self,
        secret: &str,
    ) -> Result<(String, String, broadcast::Receiver<ServerEvent>), AppError> {
        let mut store = self.inner.write().await;
        let ticket = store
            .tickets
            .remove(&Self::hash(secret))
            .ok_or_else(AppError::unauthorized)?;
        if ticket.expires_at <= Utc::now() {
            return Err(AppError::unauthorized());
        }
        let room = store
            .rooms
            .get_mut(&ticket.room_id)
            .ok_or_else(AppError::unauthorized)?;
        Self::expire_locked(room, Utc::now());
        if room.closed {
            return Err(AppError::unauthorized());
        }
        let participant = room
            .participants
            .get_mut(&ticket.participant_id)
            .ok_or_else(AppError::unauthorized)?;
        participant.public.connected = true;
        participant.lease_expires_at = Utc::now() + Duration::seconds(LEASE_SECONDS);
        room.revision += 1;
        let receiver = room.events.subscribe();
        let _ = room.events.send(ServerEvent::StateUpdated {
            snapshot: Self::snapshot(room),
        });
        Ok((ticket.room_id, ticket.participant_id, receiver))
    }

    pub async fn snapshot_for_participant(
        &self,
        room_id: &str,
        participant_id: &str,
    ) -> Result<PlayerRoomSnapshot, AppError> {
        let store = self.inner.read().await;
        let room = store
            .rooms
            .get(room_id)
            .ok_or_else(AppError::unauthorized)?;
        if room.closed || !room.participants.contains_key(participant_id) {
            return Err(AppError::unauthorized());
        }
        Ok(Self::snapshot(room))
    }

    pub async fn command(
        &self,
        room_id: &str,
        participant_id: &str,
        command: ClientEvent,
    ) -> Result<Option<ServerEvent>, AppError> {
        let mut store = self.inner.write().await;
        let room = store
            .rooms
            .get_mut(room_id)
            .ok_or_else(AppError::unauthorized)?;
        if room.closed {
            return Ok(Some(ServerEvent::RoomEnded));
        }
        let participant = room
            .participants
            .get_mut(participant_id)
            .ok_or_else(AppError::unauthorized)?;
        match command {
            ClientEvent::Heartbeat => {
                let expiry = Utc::now() + Duration::seconds(LEASE_SECONDS);
                participant.lease_expires_at = expiry;
                if participant_id == room.host_participant_id {
                    room.host_lease_expires_at = expiry;
                }
                Ok(None)
            }
            ClientEvent::RequestSnapshot => Ok(Some(ServerEvent::Snapshot {
                snapshot: Self::snapshot(room),
            })),
            ClientEvent::Leave => {
                participant.public.connected = false;
                participant.lease_expires_at = Utc::now();
                if room.av_participant_id.as_deref() == Some(participant_id) {
                    room.av_participant_id = None;
                }
                room.revision += 1;
                let event = ServerEvent::StateUpdated {
                    snapshot: Self::snapshot(room),
                };
                let _ = room.events.send(event.clone());
                Ok(Some(event))
            }
            ClientEvent::UpdateMusicalState {
                command_id,
                musical_state,
            } => {
                if participant_id != room.host_participant_id {
                    return Ok(Some(ServerEvent::CommandRejected {
                        command_id,
                        reason: "room_host_required".into(),
                        revision: room.revision,
                    }));
                }
                if room.command_ids.contains(&command_id) {
                    return Ok(Some(ServerEvent::CommandAccepted {
                        command_id,
                        revision: room.revision,
                    }));
                }
                if Self::validate_state(&room.content, &musical_state).is_err() {
                    return Ok(Some(ServerEvent::CommandRejected {
                        command_id,
                        reason: "invalid_musical_state".into(),
                        revision: room.revision,
                    }));
                }
                room.musical_state = musical_state;
                room.command_ids.insert(command_id.clone());
                room.revision += 1;
                let update = ServerEvent::StateUpdated {
                    snapshot: Self::snapshot(room),
                };
                let _ = room.events.send(update);
                Ok(Some(ServerEvent::CommandAccepted {
                    command_id,
                    revision: room.revision,
                }))
            }
            ClientEvent::UpdateProjection {
                command_id,
                projection,
            } => {
                if room.av_participant_id.as_deref() != Some(participant_id) {
                    return Ok(Some(ServerEvent::CommandRejected {
                        command_id,
                        reason: "av_host_required".into(),
                        revision: room.revision,
                    }));
                }
                if room.command_ids.contains(&command_id) {
                    return Ok(Some(ServerEvent::CommandAccepted {
                        command_id,
                        revision: room.revision,
                    }));
                }
                if Self::validate_projection(&projection).is_err() {
                    return Ok(Some(ServerEvent::CommandRejected {
                        command_id,
                        reason: "invalid_projection".into(),
                        revision: room.revision,
                    }));
                }
                room.projection = Some(projection);
                room.command_ids.insert(command_id.clone());
                room.revision += 1;
                let update = ServerEvent::StateUpdated {
                    snapshot: Self::snapshot(room),
                };
                let _ = room.events.send(update);
                Ok(Some(ServerEvent::CommandAccepted {
                    command_id,
                    revision: room.revision,
                }))
            }
            ClientEvent::UpdateGuestsAllowed {
                command_id,
                guests_allowed,
            } => {
                if participant_id != room.host_participant_id {
                    return Ok(Some(ServerEvent::CommandRejected {
                        command_id,
                        reason: "room_host_required".into(),
                        revision: room.revision,
                    }));
                }
                if room.command_ids.contains(&command_id) {
                    return Ok(Some(ServerEvent::CommandAccepted {
                        command_id,
                        revision: room.revision,
                    }));
                }
                room.guests_allowed = guests_allowed;
                room.command_ids.insert(command_id.clone());
                room.revision += 1;
                let update = ServerEvent::StateUpdated {
                    snapshot: Self::snapshot(room),
                };
                let _ = room.events.send(update.clone());
                Ok(Some(ServerEvent::CommandAccepted {
                    command_id,
                    revision: room.revision,
                }))
            }
            ClientEvent::Authenticate { .. } => {
                Err(AppError::invalid_request("already authenticated"))
            }
        }
    }

    pub async fn disconnect(&self, room_id: &str, participant_id: &str) {
        if let Some(room) = self.inner.write().await.rooms.get_mut(room_id) {
            let changed = room
                .participants
                .get_mut(participant_id)
                .is_some_and(|participant| {
                    let changed = participant.public.connected;
                    participant.public.connected = false;
                    changed
                });
            if changed {
                room.revision += 1;
                let _ = room.events.send(ServerEvent::StateUpdated {
                    snapshot: Self::snapshot(room),
                });
            }
        }
        let _ = self.persist_room(room_id).await;
    }

    pub async fn persist_current(&self, room_id: &str) {
        let _ = self.persist_room(room_id).await;
    }

    pub async fn authorize_media(
        &self,
        room_id: &str,
        resume: &str,
        blob_id: &str,
    ) -> Result<String, AppError> {
        let store = self.inner.read().await;
        let room = store
            .rooms
            .get(room_id)
            .ok_or_else(|| AppError::NotFound("player room has ended".into()))?;
        if room.closed
            || !room.media_ids.contains(blob_id)
            || !room
                .participants
                .values()
                .any(|p| p.resume_hash == Self::hash(resume) && p.lease_expires_at > Utc::now())
        {
            return Err(AppError::NotFound("player room media not found".into()));
        }
        Ok(room.summary.team_id.clone())
    }

    pub async fn cleanup(&self) {
        let mut store = self.inner.write().await;
        let now = Utc::now();
        for room in store.rooms.values_mut() {
            Self::expire_locked(room, now);
            if room.av_participant_id.as_ref().is_some_and(|id| {
                room.participants
                    .get(id)
                    .is_none_or(|p| p.lease_expires_at <= now)
            }) {
                room.av_participant_id = None;
                room.revision += 1;
                let _ = room.events.send(ServerEvent::StateUpdated {
                    snapshot: Self::snapshot(room),
                });
            }
        }
        store.tickets.retain(|_, ticket| ticket.expires_at > now);
        let ids = store.rooms.keys().cloned().collect::<Vec<_>>();
        drop(store);
        for id in ids {
            let _ = self.persist_room(&id).await;
        }
    }

    async fn persist_room(&self, room_id: &str) -> Result<(), AppError> {
        let store = self.inner.read().await;
        let Some(room) = store.rooms.get(room_id) else {
            return Ok(());
        };
        let snapshot_json = serde_json::to_string(&room.content)
            .map_err(|e| AppError::internal_from_err("player_room.persist", e))?;
        let musical_json = serde_json::to_string(&room.musical_state)
            .map_err(|e| AppError::internal_from_err("player_room.persist", e))?;
        let projection_json = room
            .projection
            .as_ref()
            .map(serde_json::to_string)
            .transpose()
            .map_err(|e| AppError::internal_from_err("player_room.persist", e))?;
        let state_json = serde_json::to_string(&PersistedRoom::from(room))
            .map_err(|e| AppError::internal_from_err("player_room.persist", e))?;
        self.db.db.query("UPSERT type::record('player_room', $id) CONTENT { owner: type::record('team', $owner), source_type: $source_type, source_id: $source_id, source_title: $source_title, name: $name, host_email: $host_email, snapshot_json: $snapshot, state_json: $state, musical_state_json: $musical, projection_json: $projection, revision: $revision, invite_hash: $invite_hash, host_participant_id: $host_id, av_participant_id: $av_id, media_ids: $media_ids, created_at: $created_at, host_lease_expires_at: $lease, closed_at: $closed_at }")
            .bind(("id", room_id.to_string())).bind(("owner", room.summary.team_id.clone())).bind(("source_type", serde_json::to_value(room.summary.source_type).unwrap().as_str().unwrap().to_string())).bind(("source_id", room.summary.source_id.clone())).bind(("source_title", room.summary.source_title.clone())).bind(("name", room.summary.name.clone())).bind(("host_email", room.summary.host_email.clone())).bind(("snapshot", snapshot_json)).bind(("state", state_json)).bind(("musical", musical_json)).bind(("projection", projection_json)).bind(("revision", room.revision)).bind(("invite_hash", room.invite_hash.clone())).bind(("host_id", room.host_participant_id.clone())).bind(("av_id", room.av_participant_id.clone())).bind(("media_ids", room.media_ids.iter().cloned().collect::<Vec<_>>())).bind(("created_at", room.summary.created_at)).bind(("lease", room.host_lease_expires_at)).bind(("closed_at", room.closed.then(Utc::now))).await?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use chordlib::types::{Line, Part, Section, Song as SongData};
    use shared::player::{PlayerBlobItem, PlayerChordsItem, PlayerItem};

    fn request() -> CreatePlayerRoom {
        CreatePlayerRoom {
            source_type: PlayerRoomSourceType::Song,
            source_id: "song-1".into(),
            host_mode: PlayerRoomMode::Sheet,
            musical_state: PlayerRoomMusicalState::default(),
            projection: None,
        }
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
        let service = PlayerRoomService::new(db).await.unwrap();
        let created = service
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
            .unwrap();
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
        let service = PlayerRoomService::new(db).await.unwrap();
        let created = service
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
            .unwrap();
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
    async fn host_musical_state_commands_reach_other_participants() {
        let db = crate::test_helpers::test_db().await.unwrap();
        let service = PlayerRoomService::new(db).await.unwrap();
        let mut create_request = request();
        create_request.musical_state = PlayerRoomMusicalState {
            item_index: 0,
            language: None,
            transposition: None,
        };
        let created = service
            .create(CreateRoomInput {
                team_id: "team-1".into(),
                source_title: "Collection".into(),
                content: PlayerRoomContent {
                    items: vec![
                        PlayerItem::Blob(PlayerBlobItem {
                            blob_id: "blob-1".into(),
                        }),
                        PlayerItem::Blob(PlayerBlobItem {
                            blob_id: "blob-2".into(),
                        }),
                    ],
                    toc: vec![],
                },
                host_user_id: "user-1".into(),
                host_email: "host@example.com".into(),
                host_avatar_url: None,
                request: create_request,
            })
            .await
            .unwrap();
        let follower = service
            .join_authenticated(
                &created.room.id,
                "user-2",
                "follower@example.com",
                None,
                PlayerRoomMode::Sheet,
                false,
                None,
                &["team-1".into()],
            )
            .await
            .unwrap();
        let (_, _, mut follower_events) = service
            .consume_ticket(&follower.connection_ticket)
            .await
            .unwrap();
        service
            .consume_ticket(&created.credentials.connection_ticket)
            .await
            .unwrap();

        service
            .command(
                &created.room.id,
                &created.credentials.participant_id,
                ClientEvent::UpdateMusicalState {
                    command_id: "change-song".into(),
                    musical_state: PlayerRoomMusicalState {
                        item_index: 1,
                        language: None,
                        transposition: None,
                    },
                },
            )
            .await
            .unwrap();

        let update = tokio::time::timeout(std::time::Duration::from_secs(1), async {
            loop {
                if let ServerEvent::StateUpdated { snapshot } =
                    follower_events.recv().await.unwrap()
                    && snapshot.musical_state.item_index == 1
                {
                    break snapshot;
                }
            }
        })
        .await
        .unwrap();
        assert_eq!(update.musical_state.item_index, 1);
    }

    #[tokio::test]
    async fn guests_can_be_disabled_for_new_invite_joins() {
        let db = crate::test_helpers::test_db().await.unwrap();
        let service = PlayerRoomService::new(db).await.unwrap();
        let created = service
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
            .unwrap();

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
                invite_secret: created.invite_secret.clone(),
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
