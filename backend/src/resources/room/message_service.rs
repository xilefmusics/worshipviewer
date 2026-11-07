use std::{
    collections::HashMap,
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
    },
    time::Duration,
};

use chrono::{Duration as ChronoDuration, Utc};
use ring::digest::{SHA256, digest};
use ring::rand::{SecureRandom, SystemRandom};
use shared::{
    room::RoomContent,
    room_message::{
        MessageRoomCredentials, MessageRoomMember, MessageRoomReplay, MessageRoomSummary,
        RoomChange, RoomMessage, RoomMessageOrder,
    },
};
use surrealdb::types::RecordId;
use tokio::sync::{Mutex, broadcast, watch};

use crate::{database::Database, error::AppError};

use super::{
    message_live::{AcceptError, MessageRoomLive, OnlineVisit, RoomPresence},
    message_store::{CapturedRoom, MessageRoomStore},
};

const PERSISTENCE_QUEUE_LIMIT: usize = 256;
const CLIENT_EVENT_BUFFER: usize = 128;
const PRESENCE_GRACE: Duration = Duration::from_secs(30);
const TICKET_LIFETIME: ChronoDuration = ChronoDuration::minutes(2);
const HISTORY_JOIN_TIMEOUT: Duration = Duration::from_secs(8);

struct ActiveRoom {
    live: MessageRoomLive,
    presence: RoomPresence,
    deleted: AtomicBool,
    shutdown: watch::Sender<bool>,
}

pub struct MessageRoomConnection {
    pub room_id: String,
    pub visit_id: String,
    pub display_name: String,
    pub boundary: RoomMessageOrder,
    pub members: Vec<MessageRoomMember>,
    pub changes: broadcast::Receiver<RoomMessage>,
    pub presence: broadcast::Receiver<Vec<OnlineVisit>>,
    pub shutdown: watch::Receiver<bool>,
    active: Arc<ActiveRoom>,
    connection_id: String,
}

#[derive(Clone)]
pub struct MessageRoomService {
    store: Arc<MessageRoomStore>,
    active: Arc<Mutex<HashMap<String, Arc<ActiveRoom>>>>,
}

impl MessageRoomService {
    pub fn new(db: Arc<Database>) -> Self {
        Self {
            store: Arc::new(MessageRoomStore::new(db)),
            active: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub async fn create(&self, mut room: CapturedRoom) -> Result<MessageRoomSummary, AppError> {
        let id = uuid::Uuid::new_v4().to_string();
        if room.name.trim().is_empty() {
            room.name = format!("Room {}", &id[..8]);
        }
        self.store
            .create(&id, &room)
            .await
            .map_err(AppError::database)?;
        self.store
            .summary(&id)
            .await
            .map_err(AppError::database)?
            .ok_or_else(|| AppError::database("created room could not be read"))
    }

    pub async fn list(
        &self,
        owners: &[RecordId],
        query: Option<&str>,
    ) -> Result<Vec<MessageRoomSummary>, AppError> {
        self.store
            .list(owners, query)
            .await
            .map_err(AppError::database)
    }

    pub async fn summary(&self, room_id: &str) -> Result<MessageRoomSummary, AppError> {
        self.store
            .summary(room_id)
            .await
            .map_err(AppError::database)?
            .ok_or_else(|| AppError::NotFound("room not found".into()))
    }

    pub async fn delete(&self, room_id: &str) -> Result<(), AppError> {
        self.store
            .delete(room_id)
            .await
            .map_err(AppError::database)?;
        if let Some(active) = self.active.lock().await.remove(room_id) {
            active.deleted.store(true, Ordering::Release);
            let _ = active.shutdown.send(true);
        }
        Ok(())
    }

    /// No anonymous visit is issued. A missing resume credential always starts a
    /// new visit; presenting one resumes that exact visit for the same account.
    pub async fn join(
        &self,
        room_id: &str,
        user_id: &str,
        display_name: &str,
        resume_credential: Option<&str>,
    ) -> Result<MessageRoomCredentials, AppError> {
        if self
            .store
            .get(room_id)
            .await
            .map_err(AppError::database)?
            .is_none()
        {
            return Err(AppError::NotFound("room not found".into()));
        }
        let (visit_id, resume_credential) = if let Some(credential) = resume_credential {
            if credential.is_empty() || credential.len() > 256 {
                return Err(AppError::unauthorized());
            }
            let visit_id = self
                .store
                .resume_visit(room_id, user_id, &Self::hash(credential))
                .await
                .map_err(AppError::database)?
                .ok_or_else(AppError::unauthorized)?;
            (visit_id, credential.to_owned())
        } else {
            let resume = Self::secret()?;
            let ticket = Self::secret()?;
            let expires = Utc::now() + TICKET_LIFETIME;
            let visit_id = self
                .store
                .create_visit(
                    room_id,
                    user_id,
                    display_name,
                    &Self::hash(&resume),
                    &Self::hash(&ticket),
                    expires,
                )
                .await
                .map_err(AppError::database)?;
            return Ok(MessageRoomCredentials {
                room_id: room_id.to_owned(),
                visit_id,
                resume_credential: resume,
                connection_ticket: ticket,
            });
        };

        let ticket = Self::secret()?;
        self.store
            .refresh_ticket(
                &visit_id,
                room_id,
                user_id,
                &Self::hash(&ticket),
                Utc::now() + TICKET_LIFETIME,
            )
            .await
            .map_err(AppError::database)?;
        Ok(MessageRoomCredentials {
            room_id: room_id.to_owned(),
            visit_id,
            resume_credential,
            connection_ticket: ticket,
        })
    }

    pub async fn replay(
        &self,
        room_id: &str,
        user_id: &str,
        resume_credential: &str,
        boundary: RoomMessageOrder,
    ) -> Result<MessageRoomReplay, AppError> {
        if !self
            .store
            .visitor_matches(room_id, user_id, &Self::hash(resume_credential))
            .await
            .map_err(AppError::database)?
        {
            return Err(AppError::unauthorized());
        }
        let (room, created_at) = self
            .store
            .get_with_created_at(room_id)
            .await
            .map_err(AppError::database)?
            .ok_or_else(|| AppError::NotFound("room not found".into()))?;
        let room_name = room.name.clone();
        let active = self.active.lock().await.get(room_id).cloned();
        if let Some(active) = active {
            tokio::time::timeout(
                HISTORY_JOIN_TIMEOUT,
                active.live.wait_for_persistence(boundary),
            )
            .await
            .map_err(|_| AppError::Internal("room history join timed out".into()))?;
        }
        let history = self
            .store
            .history(room_id, boundary)
            .await
            .map_err(AppError::database)?;
        Ok(MessageRoomReplay {
            room: room.content,
            room_name,
            created_at,
            history,
            boundary,
        })
    }

    pub async fn connect(&self, ticket: &str) -> Result<MessageRoomConnection, AppError> {
        if ticket.is_empty() || ticket.len() > 256 {
            return Err(AppError::unauthorized());
        }
        let (room_id, visit_id, display_name) = self
            .store
            .consume_ticket(&Self::hash(ticket))
            .await
            .map_err(AppError::database)?
            .ok_or_else(AppError::unauthorized)?;
        let room = self
            .store
            .get(&room_id)
            .await
            .map_err(AppError::database)?
            .ok_or_else(|| AppError::NotFound("room not found".into()))?;
        let active = self.active_room(&room_id, room.content).await?;
        let connection_id = uuid::Uuid::new_v4().to_string();
        if !active.presence.connect(
            visit_id.clone(),
            connection_id.clone(),
            display_name.clone(),
        ) {
            return Err(AppError::too_many_requests("room is full"));
        }
        let (members, presence) = active.presence.subscribe();
        let (boundary, changes) = active.live.subscribe();
        let shutdown = active.shutdown.subscribe();
        Ok(MessageRoomConnection {
            room_id,
            visit_id,
            display_name,
            boundary,
            members: members.into_iter().map(Into::into).collect(),
            changes,
            presence,
            shutdown,
            active,
            connection_id,
        })
    }

    pub fn accept(
        &self,
        connection: &MessageRoomConnection,
        id: String,
        change: RoomChange,
    ) -> Result<RoomMessage, AcceptError> {
        if connection.active.deleted.load(Ordering::Acquire) {
            return Err(AcceptError::Invalid);
        }
        connection
            .active
            .live
            .accept(id, connection.visit_id.clone(), change)
    }

    pub fn disconnect(&self, connection: &MessageRoomConnection) {
        connection
            .active
            .presence
            .disconnect(&connection.visit_id, &connection.connection_id());
        let room_id = connection.room_id.clone();
        let active_rooms = self.active.clone();
        let expected = connection.active.clone();
        tokio::spawn(async move {
            tokio::time::sleep(PRESENCE_GRACE + Duration::from_secs(1)).await;
            if !expected.presence.subscribe().0.is_empty() {
                return;
            }
            let mut rooms = active_rooms.lock().await;
            if rooms
                .get(&room_id)
                .is_some_and(|active| Arc::ptr_eq(active, &expected))
            {
                rooms.remove(&room_id);
            }
        });
    }

    async fn active_room(
        &self,
        room_id: &str,
        content: RoomContent,
    ) -> Result<Arc<ActiveRoom>, AppError> {
        let mut active = self.active.lock().await;
        if let Some(room) = active.get(room_id) {
            return Ok(room.clone());
        }
        let epoch = self
            .store
            .reserve_epoch()
            .await
            .map_err(AppError::database)?;
        let section_counts = content
            .items
            .iter()
            .map(|item| item.song.data.sections.len().max(1))
            .collect();
        let (shutdown, _) = watch::channel(false);
        let room = Arc::new(ActiveRoom {
            live: MessageRoomLive::new(
                room_id.to_owned(),
                epoch,
                section_counts,
                self.store.clone(),
                PERSISTENCE_QUEUE_LIMIT,
                CLIENT_EVENT_BUFFER,
            ),
            presence: RoomPresence::new(PRESENCE_GRACE, CLIENT_EVENT_BUFFER),
            deleted: AtomicBool::new(false),
            shutdown,
        });
        active.insert(room_id.to_owned(), room.clone());
        Ok(room)
    }

    fn secret() -> Result<String, AppError> {
        let mut bytes = [0_u8; 32];
        SystemRandom::new()
            .fill(&mut bytes)
            .map_err(|_| AppError::Internal("secure random generation failed".into()))?;
        Ok(hex::encode(bytes))
    }

    fn hash(secret: &str) -> String {
        hex::encode(digest(&SHA256, secret.as_bytes()).as_ref())
    }
}

impl MessageRoomConnection {
    pub fn connection_id(&self) -> String {
        // Each established ticket authenticates one socket. The ID is kept
        // separately from visit identity so concurrent sockets don't split presence.
        self.connection_id.clone()
    }
}

impl From<OnlineVisit> for MessageRoomMember {
    fn from(visit: OnlineVisit) -> Self {
        Self {
            visit_id: visit.visit_id,
            display_name: visit.display_name,
            joined_at: visit.joined_at,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn signed_in_visits_resume_or_start_new_and_replay_saved_history() {
        let db = crate::test_helpers::test_db().await.unwrap();
        let user = crate::test_helpers::seed_user(&db).await.unwrap();
        let song = crate::test_helpers::create_song_with_title(&db, &user, "Test hymn")
            .await
            .unwrap();
        let service = MessageRoomService::new(db);
        let room = service
            .create(CapturedRoom {
                owner: RecordId::new("team", "team"),
                name: "Room".into(),
                content: RoomContent {
                    items: vec![shared::player::PlayerChordsItem {
                        song: song.clone(),
                        capo_shape: None,
                        language: None,
                        flow: None,
                    }],
                    toc: vec![shared::player::TocItem {
                        idx: 0,
                        title: "Test hymn".into(),
                        id: Some(song.id),
                        nr: "1".into(),
                        liked: false,
                    }],
                },
            })
            .await
            .unwrap();

        let first = service
            .join(&room.id, &user.id, &user.email, None)
            .await
            .unwrap();
        let resumed = service
            .join(
                &room.id,
                &user.id,
                &user.email,
                Some(&first.resume_credential),
            )
            .await
            .unwrap();
        assert_eq!(resumed.visit_id, first.visit_id);
        assert_ne!(resumed.connection_ticket, first.connection_ticket);

        let connection = service.connect(&resumed.connection_ticket).await.unwrap();
        assert_eq!(connection.visit_id, first.visit_id);
        let message = service
            .accept(
                &connection,
                "vote-one".into(),
                RoomChange::Vote {
                    song: 0,
                    voted: true,
                },
            )
            .unwrap();
        assert_eq!(message.order.epoch, connection.boundary.epoch);
        let replay = service
            .replay(&room.id, &user.id, &first.resume_credential, message.order)
            .await
            .unwrap();
        assert_eq!(replay.history, vec![message]);
        service.disconnect(&connection);
        assert!(service.connect(&resumed.connection_ticket).await.is_err());

        let second_visit = service
            .join(&room.id, &user.id, &user.email, None)
            .await
            .unwrap();
        assert_ne!(second_visit.visit_id, first.visit_id);
        assert!(
            service
                .replay(
                    &room.id,
                    &user.id,
                    &first.resume_credential,
                    RoomMessageOrder {
                        epoch: 1,
                        sequence: 0,
                    },
                )
                .await
                .is_ok()
        );
    }

    #[tokio::test]
    async fn participants_receive_the_same_ordered_message_and_complete_presence() {
        let db = crate::test_helpers::test_db().await.unwrap();
        let first_user = crate::test_helpers::create_user(
            &db,
            &format!("room-first-{}@test.local", uuid::Uuid::new_v4()),
        )
        .await
        .unwrap();
        let second_user = crate::test_helpers::create_user(
            &db,
            &format!("room-second-{}@test.local", uuid::Uuid::new_v4()),
        )
        .await
        .unwrap();
        let song = crate::test_helpers::create_song_with_title(&db, &first_user, "Fixed song")
            .await
            .unwrap();
        let team_id = crate::test_helpers::personal_team_id(&db, &first_user)
            .await
            .unwrap();
        let service = MessageRoomService::new(db);
        let room = service
            .create(CapturedRoom {
                owner: RecordId::new("team", team_id),
                name: "Room".into(),
                content: RoomContent {
                    items: vec![shared::player::PlayerChordsItem {
                        song: song.clone(),
                        capo_shape: None,
                        language: None,
                        flow: None,
                    }],
                    toc: vec![shared::player::TocItem {
                        idx: 0,
                        title: "Fixed song".into(),
                        id: Some(song.id),
                        nr: "1".into(),
                        liked: false,
                    }],
                },
            })
            .await
            .unwrap();
        let first = service
            .join(&room.id, &first_user.id, &first_user.email, None)
            .await
            .unwrap();
        let second = service
            .join(&room.id, &second_user.id, &second_user.email, None)
            .await
            .unwrap();
        let mut first_connection = service.connect(&first.connection_ticket).await.unwrap();
        let mut second_connection = service.connect(&second.connection_ticket).await.unwrap();

        assert_eq!(first_connection.members.len(), 1);
        assert_eq!(second_connection.members.len(), 2);
        let message = service
            .accept(
                &first_connection,
                "shared-vote".into(),
                RoomChange::Vote {
                    song: 0,
                    voted: true,
                },
            )
            .unwrap();
        assert_eq!(message.visit_id, first.visit_id);
        assert_eq!(first_connection.changes.recv().await.unwrap(), message);
        assert_eq!(second_connection.changes.recv().await.unwrap(), message);

        let changed_members = first_connection.presence.recv().await.unwrap();
        assert_eq!(changed_members.len(), 2);
        let replay = service
            .replay(
                &room.id,
                &first_user.id,
                &first.resume_credential,
                message.order,
            )
            .await
            .unwrap();
        assert_eq!(replay.history, vec![message]);

        service.disconnect(&first_connection);
        service.disconnect(&second_connection);
    }
}
