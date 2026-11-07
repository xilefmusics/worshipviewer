use std::{collections::VecDeque, time::Duration as StdDuration};

use actix_web::{
    HttpRequest, HttpResponse, Scope, delete, get, post,
    web::{self, Data, Json, Path, Query, ReqData},
};
use futures_util::StreamExt;
use serde::Deserialize;
use shared::{
    api::{ListQuery, PAGE_SIZE_DEFAULT},
    room::{CreateRoom, RoomContent, RoomSourceType},
    room_message::{
        MessageRoomClientEvent, MessageRoomJoin, MessageRoomServerEvent, RoomMessage,
        RoomMessageOrder,
    },
};
use surrealdb::types::RecordId;
use tokio::sync::broadcast;
use tokio::time::Instant;
use utoipa::IntoParams;

use crate::{
    auth::{AuthorizationContext, middleware::RequireUser},
    docs::Problem,
    error::{AppError, map_list_query_error},
    resources::{
        collection::service::CollectionServiceHandle, setlist::service::SetlistServiceHandle,
        song::service::SongServiceHandle, team::parse_owner_record_id,
    },
};

use super::{
    message_live::AcceptError, message_service::MessageRoomService, message_store::CapturedRoom,
};

const HANDOFF_BUFFER_LIMIT: usize = 256;
const SOCKET_PING_INTERVAL: StdDuration = StdDuration::from_secs(20);
const SOCKET_PONG_TIMEOUT: StdDuration = StdDuration::from_secs(60);

struct ReplayHandoff {
    boundary: RoomMessageOrder,
    buffered: VecDeque<RoomMessage>,
    complete: bool,
}

impl ReplayHandoff {
    fn new(boundary: RoomMessageOrder) -> Self {
        Self {
            boundary,
            buffered: VecDeque::new(),
            complete: false,
        }
    }

    fn push(&mut self, message: RoomMessage) -> Result<Option<RoomMessage>, ()> {
        if self.complete {
            return Ok(Some(message));
        }
        if self.buffered.len() >= HANDOFF_BUFFER_LIMIT {
            return Err(());
        }
        self.buffered.push_back(message);
        Ok(None)
    }

    fn finish(&mut self) -> VecDeque<RoomMessage> {
        self.complete = true;
        self.buffered
            .drain(..)
            .filter(|message| message.order > self.boundary)
            .collect()
    }
}

pub fn scope() -> Scope {
    web::scope("/rooms").service(room_websocket).service(
        web::scope("")
            .wrap(RequireUser)
            .service(list_rooms)
            .service(create_room)
            .service(join_room)
            .service(get_room_history)
            .service(delete_room),
    )
}

#[utoipa::path(
    get,
    path = "/api/v1/rooms",
    params(("page" = Option<u32>, Query), ("page_size" = Option<u32>, Query), ("q" = Option<String>, Query), ("team" = Option<String>, Query)),
    responses(
        (status = 200, body = [shared::room_message::MessageRoomSummary]),
        (status = 401, description = "Authentication required", body = Problem, content_type = "application/problem+json"),
        (status = 404, description = "Team not found", body = Problem, content_type = "application/problem+json"),
    ),
    tag = "Rooms",
    security(("SessionCookie" = []), ("SessionToken" = []))
)]
#[get("")]
pub async fn list_rooms(
    svc: Data<MessageRoomService>,
    ctx: ReqData<AuthorizationContext>,
    query: Query<ListQuery>,
) -> Result<HttpResponse, AppError> {
    let query = query
        .into_inner()
        .validate()
        .map_err(map_list_query_error)?;
    let mut owners = ctx.read_teams();
    if let Some(team) = query.team.as_deref() {
        let Some(owner) = owners
            .iter()
            .find(|owner| crate::database::record_id_string(owner) == team)
        else {
            return Err(AppError::NotFound("team not found".into()));
        };
        owners = vec![owner.clone()];
    }
    let writable = ctx
        .write_teams()
        .iter()
        .map(crate::database::record_id_string)
        .collect::<std::collections::HashSet<_>>();
    let mut rows = svc.list(&owners, query.q.as_deref()).await?;
    for room in &mut rows {
        room.can_delete = writable.contains(&room.team_id);
    }
    let total = rows.len();
    let page_size = query.page_size.unwrap_or(PAGE_SIZE_DEFAULT) as usize;
    let start = query.page.unwrap_or(0) as usize * page_size;
    let page = rows
        .into_iter()
        .skip(start)
        .take(page_size)
        .collect::<Vec<_>>();
    Ok(HttpResponse::Ok()
        .insert_header(("X-Total-Count", total.to_string()))
        .json(page))
}

#[utoipa::path(
    post,
    path = "/api/v1/rooms",
    request_body = CreateRoom,
    responses(
        (status = 201, body = shared::room_message::MessageRoomSummary),
        (status = 400, description = "Invalid room request", body = Problem, content_type = "application/problem+json"),
        (status = 401, description = "Authentication required", body = Problem, content_type = "application/problem+json"),
        (status = 403, description = "Insufficient team role", body = Problem, content_type = "application/problem+json"),
        (status = 404, description = "Source or team not found", body = Problem, content_type = "application/problem+json"),
        (status = 500, description = "Room creation failed", body = Problem, content_type = "application/problem+json"),
    ),
    tag = "Rooms",
    security(("SessionCookie" = []), ("SessionToken" = []))
)]
#[post("")]
pub async fn create_room(
    svc: Data<MessageRoomService>,
    song_svc: Data<SongServiceHandle>,
    collection_svc: Data<CollectionServiceHandle>,
    setlist_svc: Data<SetlistServiceHandle>,
    ctx: ReqData<AuthorizationContext>,
    body: Json<CreateRoom>,
) -> Result<HttpResponse, AppError> {
    let request = body.into_inner();
    let owner = parse_owner_record_id(&request.team_id)?;
    ctx.require_write_access_to_owner(&owner)?;
    let content = match (request.source_type, request.source_id) {
        (None, None) => RoomContent {
            items: vec![],
            toc: vec![],
        },
        (Some(source_type), Some(source_id)) => match source_type {
            RoomSourceType::Song => {
                song_svc.get_song_for_user(&ctx, &source_id).await?;
                RoomContent::from(&song_svc.song_player_for_user(&ctx, &source_id).await?)
            }
            RoomSourceType::Collection => {
                collection_svc
                    .get_collection_for_user(&ctx, &source_id)
                    .await?;
                RoomContent::from(
                    &collection_svc
                        .collection_player_for_user(&ctx, &source_id)
                        .await?,
                )
            }
            RoomSourceType::Setlist => {
                setlist_svc.get_setlist_for_user(&ctx, &source_id).await?;
                RoomContent::from(
                    &setlist_svc
                        .setlist_player_for_user(&ctx, &source_id)
                        .await?,
                )
            }
        },
        _ => {
            return Err(AppError::invalid_request(
                "source_type and source_id must be provided together",
            ));
        }
    };
    let mut created = svc
        .create(CapturedRoom {
            owner,
            name: request.name.unwrap_or_default(),
            content,
        })
        .await?;
    created.can_delete = true;
    Ok(HttpResponse::Created().json(created))
}

#[utoipa::path(
    post,
    path = "/api/v1/rooms/{id}/join",
    params(("id" = String, Path)),
    request_body = MessageRoomJoin,
    responses(
        (status = 200, body = shared::room_message::MessageRoomCredentials),
        (status = 401, description = "Authentication or resume credential rejected", body = Problem, content_type = "application/problem+json"),
        (status = 404, description = "Room not found", body = Problem, content_type = "application/problem+json"),
        (status = 429, description = "Room is full", body = Problem, content_type = "application/problem+json"),
        (status = 500, description = "Room join failed", body = Problem, content_type = "application/problem+json"),
    ),
    tag = "Rooms",
    security(("SessionCookie" = []), ("SessionToken" = []))
)]
#[post("/{id}/join")]
pub async fn join_room(
    svc: Data<MessageRoomService>,
    ctx: ReqData<AuthorizationContext>,
    id: Path<String>,
    body: Json<MessageRoomJoin>,
) -> Result<HttpResponse, AppError> {
    let body = body.into_inner();
    let credentials = svc
        .join(
            &id,
            &ctx.user.id,
            &ctx.user.email,
            body.resume_credential.as_deref(),
        )
        .await?;
    Ok(HttpResponse::Ok().json(credentials))
}

#[derive(Debug, Deserialize, IntoParams)]
#[into_params(parameter_in = Query)]
pub struct HistoryBoundary {
    pub epoch: u64,
    pub sequence: u64,
}

#[utoipa::path(
    get,
    path = "/api/v1/rooms/{id}/history",
    params(("id" = String, Path), HistoryBoundary, ("x-room-resume" = String, Header, description = "Account-bound room resume credential")),
    responses(
        (status = 200, body = shared::room_message::MessageRoomReplay),
        (status = 400, description = "Invalid history boundary", body = Problem, content_type = "application/problem+json"),
        (status = 401, description = "Authentication or resume credential rejected", body = Problem, content_type = "application/problem+json"),
        (status = 404, description = "Room not found", body = Problem, content_type = "application/problem+json"),
        (status = 500, description = "History read failed", body = Problem, content_type = "application/problem+json"),
    ),
    tag = "Rooms",
    security(("SessionCookie" = []), ("SessionToken" = []))
)]
#[get("/{id}/history")]
pub async fn get_room_history(
    svc: Data<MessageRoomService>,
    ctx: ReqData<AuthorizationContext>,
    req: HttpRequest,
    id: Path<String>,
    query: Query<HistoryBoundary>,
) -> Result<HttpResponse, AppError> {
    let resume = req
        .headers()
        .get("x-room-resume")
        .and_then(|value| value.to_str().ok())
        .filter(|value| !value.is_empty())
        .ok_or_else(AppError::unauthorized)?;
    let replay = svc
        .replay(
            &id,
            &ctx.user.id,
            resume,
            RoomMessageOrder {
                epoch: query.epoch,
                sequence: query.sequence,
            },
        )
        .await?;
    Ok(HttpResponse::Ok().json(replay))
}

#[utoipa::path(
    delete,
    path = "/api/v1/rooms/{id}",
    params(("id" = String, Path)),
    responses(
        (status = 204, description = "Room deleted"),
        (status = 403, description = "Insufficient team role", body = Problem, content_type = "application/problem+json"),
        (status = 404, description = "Room not found", body = Problem, content_type = "application/problem+json"),
        (status = 500, description = "Room deletion failed", body = Problem, content_type = "application/problem+json"),
    ),
    tag = "Rooms",
    security(("SessionCookie" = []), ("SessionToken" = []))
)]
#[delete("/{id}")]
pub async fn delete_room(
    svc: Data<MessageRoomService>,
    ctx: ReqData<AuthorizationContext>,
    id: Path<String>,
) -> Result<HttpResponse, AppError> {
    let room = svc.summary(&id).await?;
    let owner = RecordId::new("team", room.team_id);
    ctx.require_write_access_to_owner(&owner)?;
    svc.delete(&id).await?;
    Ok(HttpResponse::NoContent().finish())
}

#[get("/ws")]
pub async fn room_websocket(
    req: HttpRequest,
    body: web::Payload,
    svc: Data<MessageRoomService>,
) -> Result<HttpResponse, actix_web::Error> {
    let (response, mut session, stream) = actix_ws::handle(&req, body)?;
    let mut stream = Box::pin(stream);
    let svc = svc.get_ref().clone();
    actix_web::rt::spawn(async move {
        let Some(Ok(actix_ws::Message::Text(raw))) =
            tokio::time::timeout(StdDuration::from_secs(5), stream.next())
                .await
                .ok()
                .flatten()
        else {
            let _ = session.close(None).await;
            return;
        };
        let Ok(MessageRoomClientEvent::Authenticate { ticket }) =
            serde_json::from_str::<MessageRoomClientEvent>(&raw)
        else {
            let _ = session.close(None).await;
            return;
        };
        let Ok(mut connection) = svc.connect(&ticket).await else {
            let _ = session
                .text(
                    serde_json::to_string(&MessageRoomServerEvent::Error {
                        code: "room_unavailable".into(),
                    })
                    .unwrap_or_default(),
                )
                .await;
            let _ = session.close(None).await;
            return;
        };
        let authorized = MessageRoomServerEvent::Authorized {
            room_id: connection.room_id.clone(),
            boundary: connection.boundary,
            members: connection.members.clone(),
        };
        if session
            .text(serde_json::to_string(&authorized).unwrap_or_default())
            .await
            .is_err()
        {
            svc.disconnect(&connection);
            return;
        }

        let mut handoff = ReplayHandoff::new(connection.boundary);
        let mut ping = tokio::time::interval(SOCKET_PING_INTERVAL);
        let mut last_pong = Instant::now();
        loop {
            tokio::select! {
                incoming = stream.next() => match incoming {
                    Some(Ok(actix_ws::Message::Text(raw))) => {
                        if raw.len() > 32_768 { break; }
                        let Ok(event) = serde_json::from_str::<MessageRoomClientEvent>(&raw) else { continue };
                        match event {
                            MessageRoomClientEvent::HistoryReady => {
                                if handoff.complete { continue; }
                                for message in handoff.finish() {
                                    let event = MessageRoomServerEvent::Change { message };
                                    if session.text(serde_json::to_string(&event).unwrap_or_default()).await.is_err() { break; }
                                }
                            }
                            MessageRoomClientEvent::Change { id, change } => {
                                if let Err(error) = svc.accept(&connection, id, change) {
                                    let code = match error { AcceptError::Invalid => "invalid_message", AcceptError::Conflict => "message_conflict", AcceptError::Exhausted => "room_order_exhausted" };
                                    let event = MessageRoomServerEvent::Error { code: code.into() };
                                    if session.text(serde_json::to_string(&event).unwrap_or_default()).await.is_err() { break; }
                                }
                            }
                            MessageRoomClientEvent::Authenticate { .. } => break,
                        }
                    }
                    Some(Ok(actix_ws::Message::Ping(bytes))) => { if session.pong(&bytes).await.is_err() { break; } }
                    Some(Ok(actix_ws::Message::Pong(_))) => last_pong = Instant::now(),
                    Some(Ok(actix_ws::Message::Close(_))) | None => break,
                    Some(Err(_)) => break,
                    _ => {}
                },
                message = connection.changes.recv() => match message {
                    Ok(message) => match handoff.push(message) {
                        Ok(Some(message)) => {
                            let event = MessageRoomServerEvent::Change { message };
                            if session.text(serde_json::to_string(&event).unwrap_or_default()).await.is_err() { break; }
                        }
                        Ok(None) => {}
                        Err(()) => break,
                    }
                    Err(broadcast::error::RecvError::Lagged(_)) => break,
                    Err(broadcast::error::RecvError::Closed) => break,
                },
                members = connection.presence.recv() => match members {
                    Ok(members) => {
                        let event = MessageRoomServerEvent::Presence { members: members.into_iter().map(Into::into).collect() };
                        if session.text(serde_json::to_string(&event).unwrap_or_default()).await.is_err() { break; }
                    }
                    Err(broadcast::error::RecvError::Lagged(_)) => break,
                    Err(broadcast::error::RecvError::Closed) => break,
                },
                changed = connection.shutdown.changed() => {
                    if changed.is_err() || *connection.shutdown.borrow() {
                        let event = MessageRoomServerEvent::Error { code: "room_deleted".into() };
                        let _ = session.text(serde_json::to_string(&event).unwrap_or_default()).await;
                        break;
                    }
                }
                _ = ping.tick() => {
                    if last_pong.elapsed() > SOCKET_PONG_TIMEOUT || session.ping(b"room").await.is_err() { break; }
                }
            }
        }
        svc.disconnect(&connection);
        let _ = session.close(None).await;
    });
    Ok(response)
}

#[cfg(test)]
mod handoff_tests {
    use super::*;
    use async_trait::async_trait;
    use shared::room_message::RoomChange;
    use std::{
        sync::{Arc, Mutex},
        time::Duration,
    };
    use tokio::sync::{Semaphore, mpsc};

    use crate::resources::room::{
        message_live::{MessageRoomLive, MessageWriter},
        message_store::{CapturedRoom, MessageRoomStore},
    };

    struct DelayedWriter {
        store: Arc<MessageRoomStore>,
        started: mpsc::UnboundedSender<RoomMessage>,
        release_sequence_two: Semaphore,
        saved: Mutex<Vec<RoomMessage>>,
    }

    #[async_trait]
    impl MessageWriter for DelayedWriter {
        async fn append(&self, message: &RoomMessage) -> anyhow::Result<()> {
            self.started.send(message.clone())?;
            if message.order.sequence == 2 {
                self.release_sequence_two.acquire().await?.forget();
            }
            self.store.append(message).await?;
            self.saved
                .lock()
                .expect("saved messages lock")
                .push(message.clone());
            Ok(())
        }
    }

    fn message(sequence: u64) -> RoomMessage {
        RoomMessage {
            id: sequence.to_string(),
            room_id: "room".into(),
            visit_id: "visit".into(),
            order: RoomMessageOrder { epoch: 2, sequence },
            change: RoomChange::Vote {
                song: 0,
                voted: sequence % 2 == 0,
            },
        }
    }

    #[test]
    fn replay_handoff_excludes_boundary_and_preserves_buffered_order() {
        let mut handoff = ReplayHandoff::new(RoomMessageOrder {
            epoch: 2,
            sequence: 2,
        });
        assert!(handoff.push(message(2)).unwrap().is_none());
        assert!(handoff.push(message(3)).unwrap().is_none());
        assert!(handoff.push(message(4)).unwrap().is_none());
        assert_eq!(
            handoff
                .finish()
                .into_iter()
                .map(|m| m.order.sequence)
                .collect::<Vec<_>>(),
            vec![3, 4]
        );
        assert_eq!(handoff.push(message(5)).unwrap().unwrap().order.sequence, 5);
    }

    #[test]
    fn replay_handoff_disconnects_when_its_bounded_buffer_fills() {
        let mut handoff = ReplayHandoff::new(RoomMessageOrder {
            epoch: 2,
            sequence: 0,
        });
        for sequence in 1..=HANDOFF_BUFFER_LIMIT as u64 {
            assert!(handoff.push(message(sequence)).unwrap().is_none());
        }
        assert!(
            handoff
                .push(message(HANDOFF_BUFFER_LIMIT as u64 + 1))
                .is_err()
        );
    }

    #[tokio::test]
    async fn delayed_history_join_hands_off_live_changes_across_a_persistence_gap() {
        let db = crate::test_helpers::test_db().await.unwrap();
        let store = Arc::new(MessageRoomStore::new(db));
        store
            .create(
                "room",
                &CapturedRoom {
                    owner: surrealdb::types::RecordId::new("team", "team"),
                    name: "Room".into(),
                    content: shared::room::RoomContent {
                        items: vec![],
                        toc: vec![],
                    },
                },
            )
            .await
            .unwrap();
        let epoch = store.reserve_epoch().await.unwrap();
        let (started, mut writes) = mpsc::unbounded_channel();
        let writer = Arc::new(DelayedWriter {
            store: store.clone(),
            started,
            release_sequence_two: Semaphore::new(0),
            saved: Mutex::new(vec![]),
        });
        let live = Arc::new(MessageRoomLive::new(
            "room".into(),
            epoch,
            vec![1],
            writer.clone(),
            1,
            16,
        ));
        let vote = |voted| RoomChange::Vote { song: 0, voted };

        let first = live
            .accept("first".into(), "visit-a".into(), vote(true))
            .unwrap();
        assert_eq!(writes.recv().await.unwrap(), first);
        live.wait_for_persistence(first.order).await;

        let second = live
            .accept("second".into(), "visit-b".into(), vote(true))
            .unwrap();
        assert_eq!(writes.recv().await.unwrap(), second);

        // A join captures the same serialized order as acceptance, then fetches
        // saved history while later live changes are held in its bounded buffer.
        let (boundary, mut changes) = live.subscribe();
        assert_eq!(boundary, second.order);
        let mut handoff = ReplayHandoff::new(boundary);
        let history_live = live.clone();
        let history_store = store.clone();
        let mut history_read = tokio::spawn(async move {
            tokio::time::timeout(
                Duration::from_secs(8),
                history_live.wait_for_persistence(boundary),
            )
            .await?;
            history_store.history("room", boundary).await
        });

        let third = live
            .accept("third".into(), "visit-a".into(), vote(false))
            .unwrap();
        let dropped_one = live
            .accept("dropped-one".into(), "visit-b".into(), vote(false))
            .unwrap();
        let dropped_two = live
            .accept("dropped-two".into(), "visit-a".into(), vote(true))
            .unwrap();
        for expected in [&third, &dropped_one, &dropped_two] {
            let buffered = tokio::time::timeout(Duration::from_secs(1), changes.recv())
                .await
                .unwrap()
                .unwrap();
            assert_eq!(&buffered, expected);
            assert!(handoff.push(buffered).unwrap().is_none());
        }
        assert!(
            tokio::time::timeout(Duration::from_millis(30), &mut history_read)
                .await
                .is_err(),
            "history should wait for the delayed write inside its boundary"
        );

        writer.release_sequence_two.add_permits(1);
        let replay = tokio::time::timeout(Duration::from_secs(2), &mut history_read)
            .await
            .unwrap()
            .unwrap()
            .unwrap();
        assert_eq!(replay, vec![first.clone(), second.clone()]);
        assert_eq!(
            handoff.finish().into_iter().collect::<Vec<_>>(),
            vec![third.clone(), dropped_one.clone(), dropped_two.clone()]
        );

        // The queue drains after the stalled write, so later absolute messages
        // persist even though overflowed messages remain absent from history.
        live.wait_for_persistence(third.order).await;
        let resumed = live
            .accept("resumed".into(), "visit-b".into(), vote(false))
            .unwrap();
        assert_eq!(writes.recv().await.unwrap(), third);
        // `resumed` may be accepted while `third` is still being appended; wait
        // for the worker to announce it before checking the complete history.
        assert_eq!(writes.recv().await.unwrap(), resumed);
        live.wait_for_persistence(resumed.order).await;
        let full_history = store.history("room", resumed.order).await.unwrap();
        assert_eq!(full_history, vec![first, second, third, resumed]);
        assert_eq!(writer.saved.lock().expect("saved messages lock").len(), 4);
    }
}
