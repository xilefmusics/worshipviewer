use std::collections::HashSet;
use std::time::Duration as StdDuration;

use actix_web::{
    HttpRequest, HttpResponse, Scope, delete, get, post, put,
    web::{self, Data, Json, Path, Query, ReqData},
};
use futures_util::StreamExt;
use shared::{
    api::{ListQuery, PAGE_SIZE_DEFAULT},
    player::PlayerItem,
    room::*,
};
use tokio::sync::broadcast;

use crate::{
    auth::{AuthorizationContext, context::AuthorizedTeamRole, middleware::RequireUser},
    docs::Problem,
    error::AppError,
    resources::{
        blob::service::BlobServiceHandle, collection::service::CollectionServiceHandle,
        setlist::service::SetlistServiceHandle, song::service::SongServiceHandle,
        team::parse_owner_record_id,
    },
};

use super::service::{ClientEvent, CreateRoomInput, RoomService, ServerEvent};

pub fn scope() -> Scope {
    web::scope("/rooms")
        .service(inspect_invite)
        .service(join_invite)
        .service(reconnect_room)
        .service(room_media)
        .service(room_websocket)
        .service(
            web::scope("")
                .wrap(RequireUser)
                .service(list_rooms)
                .service(create_room)
                .service(get_room)
                .service(join_room)
                .service(update_song_pool)
                .service(get_pool_songs)
                .service(add_queue_item)
                .service(promote_queue_item)
                .service(remove_queue_item)
                .service(reorder_queue)
                .service(close_room),
        )
}

#[utoipa::path(
    put,
    path = "/api/v1/rooms/{id}/song-pool",
    params(("id" = String, Path)),
    request_body = UpdateRoomSongPool,
    responses((status = 204), (status = 403, body = Problem, content_type = "application/problem+json"), (status = 404, body = Problem, content_type = "application/problem+json"), (status = 409, body = Problem, content_type = "application/problem+json")),
    tag = "Rooms",
    security(("SessionCookie" = []), ("SessionToken" = []))
)]
#[put("/{id}/song-pool")]
pub async fn update_song_pool(
    room_svc: Data<RoomService>,
    collection_svc: Data<CollectionServiceHandle>,
    setlist_svc: Data<SetlistServiceHandle>,
    ctx: ReqData<AuthorizationContext>,
    id: Path<String>,
    body: Json<UpdateRoomSongPool>,
) -> Result<HttpResponse, AppError> {
    let request = body.into_inner();
    let pool = match request.pool {
        None => None,
        Some(RoomSongPoolSelection::Collection { id }) => {
            let source = collection_svc.get_collection_for_user(&ctx, &id).await?;
            Some(RoomSongPool::Collection {
                id: source.id,
                title: source.title,
            })
        }
        Some(RoomSongPoolSelection::Setlist { id }) => {
            let source = setlist_svc.get_setlist_for_user(&ctx, &id).await?;
            Some(RoomSongPool::Setlist {
                id: source.id,
                title: source.title,
            })
        }
    };
    room_svc
        .set_song_pool(
            &id,
            &ctx.user.id,
            &team_ids(&ctx),
            pool,
            request.open,
            request.revision,
        )
        .await?;
    Ok(HttpResponse::NoContent().finish())
}

#[utoipa::path(
    get,
    path = "/api/v1/rooms/{id}/song-pool/songs",
    params(("id" = String, Path), ("page" = Option<u32>, Query), ("page_size" = Option<u32>, Query), ("q" = Option<String>, Query)),
    responses((status = 200, body = [crate::resources::song::Song]), (status = 400, body = Problem, content_type = "application/problem+json"), (status = 401, body = Problem, content_type = "application/problem+json"), (status = 404, body = Problem, content_type = "application/problem+json"), (status = 409, body = Problem, content_type = "application/problem+json")),
    tag = "Rooms",
    security(("SessionCookie" = []), ("SessionToken" = []))
)]
#[get("/{id}/song-pool/songs")]
pub async fn get_pool_songs(
    room_svc: Data<RoomService>,
    ctx: ReqData<AuthorizationContext>,
    id: Path<String>,
    query: Query<ListQuery>,
) -> Result<HttpResponse, AppError> {
    let query = query
        .into_inner()
        .validate()
        .map_err(crate::error::map_list_query_error)?;
    let (songs, total) = room_svc
        .pool_songs(&id, &ctx.user.id, &team_ids(&ctx), &query)
        .await?;
    Ok(HttpResponse::Ok()
        .insert_header(("X-Total-Count", total.to_string()))
        .json(songs))
}

fn team_ids(ctx: &AuthorizationContext) -> Vec<String> {
    ctx.teams
        .iter()
        .map(|team| crate::database::record_id_string(&team.id))
        .collect()
}

fn closable_team_ids(ctx: &AuthorizationContext) -> Vec<String> {
    ctx.teams
        .iter()
        .filter(|team| {
            matches!(
                team.role,
                AuthorizedTeamRole::Admin | AuthorizedTeamRole::ContentMaintainer
            )
        })
        .map(|team| crate::database::record_id_string(&team.id))
        .collect()
}

fn queue_from_player(player: &shared::player::Player, added_by: &str) -> Vec<RoomQueueItem> {
    let mut seen = HashSet::new();
    player
        .items()
        .iter()
        .enumerate()
        .filter_map(|(index, item)| {
            let PlayerItem::Chords(song) = item else {
                return None;
            };
            let song_id = song.song.id.clone();
            if song_id.trim().is_empty() || !seen.insert(song_id.clone()) {
                return None;
            }
            let title = player
                .toc()
                .iter()
                .find(|toc| toc.idx == index)
                .map(|toc| toc.title.clone())
                .unwrap_or_else(|| song.song.data.title().to_string());
            let mut song = song.clone();
            song.song.user_specific_addons.liked = false;
            Some(RoomQueueItem {
                id: format!("source-{index}-{song_id}"),
                song_id,
                title,
                song,
                added_by: added_by.to_string(),
                upvotes: 0,
            })
        })
        .collect()
}

#[utoipa::path(get, path = "/api/v1/rooms", params(("page" = Option<u32>, Query), ("page_size" = Option<u32>, Query), ("q" = Option<String>, Query), ("team" = Option<String>, Query)), responses((status = 200, body = [RoomSummary])), tag = "Rooms", security(("SessionCookie" = []), ("SessionToken" = [])))]
#[get("")]
pub async fn list_rooms(
    svc: Data<RoomService>,
    ctx: ReqData<AuthorizationContext>,
    query: Query<ListQuery>,
) -> Result<HttpResponse, AppError> {
    let query = query
        .into_inner()
        .validate()
        .map_err(crate::error::map_list_query_error)?;
    let mut teams = team_ids(&ctx);
    if let Some(team) = query.team.as_deref() {
        if !teams.contains(&team.to_string()) {
            return Err(AppError::NotFound("team not found".into()));
        }
        teams = vec![team.to_string()];
    }
    let rows = svc
        .list(
            &teams,
            query.q.as_deref(),
            &ctx.user.id,
            &closable_team_ids(&ctx),
        )
        .await?;
    let total = rows.len();
    let start =
        query.page.unwrap_or(0) as usize * query.page_size.unwrap_or(PAGE_SIZE_DEFAULT) as usize;
    let end = (start + query.page_size.unwrap_or(PAGE_SIZE_DEFAULT) as usize).min(total);
    let page = if start < total {
        rows[start..end].to_vec()
    } else {
        vec![]
    };
    Ok(HttpResponse::Ok()
        .insert_header(("X-Total-Count", total.to_string()))
        .json(page))
}

#[utoipa::path(post, path = "/api/v1/rooms", request_body = CreateRoom, responses((status = 201, body = CreatedRoom)), tag = "Rooms", security(("SessionCookie" = []), ("SessionToken" = [])))]
#[post("")]
pub async fn create_room(
    svc: Data<RoomService>,
    song_svc: Data<SongServiceHandle>,
    collection_svc: Data<CollectionServiceHandle>,
    setlist_svc: Data<SetlistServiceHandle>,
    ctx: ReqData<AuthorizationContext>,
    body: Json<CreateRoom>,
) -> Result<HttpResponse, AppError> {
    let request = body.into_inner();
    let owner_record = parse_owner_record_id(&request.team_id)?;
    ctx.require_write_access_to_owner(&owner_record)?;

    let (source_type, source_id, source_title, content, initial_queue) =
        match (request.source_type, request.source_id) {
            (None, None) => (
                None,
                None,
                None,
                RoomContent {
                    items: Vec::new(),
                    toc: Vec::new(),
                },
                Vec::new(),
            ),
            (Some(source_type), Some(source_id)) => match source_type {
                RoomSourceType::Song => {
                    let source = song_svc.get_song_for_user(&ctx, &source_id).await?;
                    let player = song_svc.song_player_for_user(&ctx, &source_id).await?;
                    let title = source
                        .data
                        .titles
                        .first()
                        .filter(|title| !title.trim().is_empty())
                        .cloned()
                        .unwrap_or_else(|| "Untitled".into());
                    (
                        Some(RoomSourceType::Song),
                        Some(source_id),
                        Some(title),
                        RoomContent::from(&player),
                        Vec::new(),
                    )
                }
                RoomSourceType::Collection => {
                    let source = collection_svc
                        .get_collection_for_user(&ctx, &source_id)
                        .await?;
                    let player = collection_svc
                        .collection_player_for_user(&ctx, &source_id)
                        .await?;
                    (
                        Some(RoomSourceType::Collection),
                        Some(source_id),
                        Some(source.title),
                        RoomContent::from(&player),
                        Vec::new(),
                    )
                }
                RoomSourceType::Setlist => {
                    let source = setlist_svc.get_setlist_for_user(&ctx, &source_id).await?;
                    let player = setlist_svc
                        .setlist_player_for_user(&ctx, &source_id)
                        .await?;
                    (
                        Some(RoomSourceType::Setlist),
                        Some(source_id),
                        Some(source.title),
                        RoomContent::from(&player),
                        queue_from_player(&player, &ctx.user.email),
                    )
                }
            },
            _ => {
                return Err(AppError::invalid_request(
                    "source_type and source_id must be provided together",
                ));
            }
        };

    let created = svc
        .create(CreateRoomInput {
            team_id: crate::database::record_id_string(&owner_record),
            name: request.name,
            host_user_id: ctx.user.id.clone(),
            host_email: ctx.user.email.clone(),
            host_avatar_url: ctx.user.oauth_picture_url.clone(),
            source_type,
            source_id,
            source_title,
            content,
            initial_queue,
            host_mode: RoomMode::Sheet,
            musical_state: RoomMusicalState::default(),
            projection: None,
        })
        .await?;
    Ok(HttpResponse::Created().json(created))
}

#[utoipa::path(get, path = "/api/v1/rooms/{id}", params(("id" = String, Path)), responses((status = 200, body = RoomSnapshot)), tag = "Rooms", security(("SessionCookie" = []), ("SessionToken" = [])))]
#[get("/{id}")]
pub async fn get_room(
    svc: Data<RoomService>,
    ctx: ReqData<AuthorizationContext>,
    id: Path<String>,
) -> Result<HttpResponse, AppError> {
    Ok(HttpResponse::Ok().json(svc.get_for_teams(&id, &team_ids(&ctx)).await?))
}

#[utoipa::path(post, path = "/api/v1/rooms/{id}/join", params(("id" = String, Path)), request_body = JoinRoom, responses((status = 200, body = RoomCredentials)), tag = "Rooms", security(("SessionCookie" = []), ("SessionToken" = [])))]
#[post("/{id}/join")]
pub async fn join_room(
    svc: Data<RoomService>,
    ctx: ReqData<AuthorizationContext>,
    id: Path<String>,
    body: Json<JoinRoom>,
) -> Result<HttpResponse, AppError> {
    let body = body.into_inner();
    Ok(HttpResponse::Ok().json(
        svc.join_authenticated(
            &id,
            &ctx.user.id,
            &ctx.user.email,
            ctx.user.oauth_picture_url.clone(),
            body.mode,
            body.hide_chords,
            body.resume_credential.as_deref(),
            &team_ids(&ctx),
        )
        .await?,
    ))
}

#[utoipa::path(
    post,
    path = "/api/v1/rooms/{id}/queue",
    params(("id" = String, Path)),
    request_body = AddRoomQueueItem,
    responses((status = 204), (status = 400, body = Problem, content_type = "application/problem+json"), (status = 401, body = Problem, content_type = "application/problem+json"), (status = 404, body = Problem, content_type = "application/problem+json"), (status = 409, body = Problem, content_type = "application/problem+json")),
    tag = "Rooms",
    security(("SessionCookie" = []), ("SessionToken" = []))
)]
#[post("/{id}/queue")]
pub async fn add_queue_item(
    room_svc: Data<RoomService>,
    song_svc: Data<crate::resources::song::service::SongServiceHandle>,
    ctx: ReqData<AuthorizationContext>,
    id: Path<String>,
    body: Json<AddRoomQueueItem>,
) -> Result<HttpResponse, AppError> {
    let request = body.into_inner();
    let player = match room_svc
        .room_song_player(&id, &ctx.user.id, &team_ids(&ctx), &request.song_id)
        .await?
    {
        Some(player) => player,
        None => {
            song_svc
                .song_player_for_user(&ctx, &request.song_id)
                .await?
        }
    };
    let content = RoomContent::from(&player);
    let Some(PlayerItem::Chords(song)) = content.items.into_iter().next() else {
        return Err(AppError::invalid_request(
            "only songs can be added to a room queue",
        ));
    };
    if song.song.not_a_song {
        return Err(AppError::invalid_request(
            "only songs can be added to a room queue",
        ));
    }
    let song_id = song.song.id.clone();
    let title = song.song.data.title().to_string();
    room_svc
        .add_queue_item(
            &id,
            &ctx.user.id,
            &team_ids(&ctx),
            RoomQueueItem {
                id: uuid::Uuid::new_v4().to_string(),
                song_id,
                title,
                song,
                added_by: ctx.user.email.clone(),
                upvotes: 0,
            },
            request.revision,
        )
        .await?;
    Ok(HttpResponse::NoContent().finish())
}

#[utoipa::path(
    post,
    path = "/api/v1/rooms/{id}/queue/{queue_id}/promote",
    params(("id" = String, Path), ("queue_id" = String, Path)),
    request_body = RoomQueueRevision,
    responses((status = 204), (status = 403, body = Problem, content_type = "application/problem+json"), (status = 404, body = Problem, content_type = "application/problem+json"), (status = 409, body = Problem, content_type = "application/problem+json")),
    tag = "Rooms",
    security(("SessionCookie" = []), ("SessionToken" = []))
)]
#[post("/{id}/queue/{queue_id}/promote")]
pub async fn promote_queue_item(
    svc: Data<RoomService>,
    ctx: ReqData<AuthorizationContext>,
    path: Path<(String, String)>,
    body: Json<RoomQueueRevision>,
) -> Result<HttpResponse, AppError> {
    let (id, queue_id) = path.into_inner();
    svc.promote_queue_item(&id, &ctx.user.id, &team_ids(&ctx), &queue_id, body.revision)
        .await?;
    Ok(HttpResponse::NoContent().finish())
}

#[utoipa::path(
    delete,
    path = "/api/v1/rooms/{id}/queue/{queue_id}",
    params(("id" = String, Path), ("queue_id" = String, Path), ("revision" = u64, Query)),
    responses((status = 204), (status = 403, body = Problem, content_type = "application/problem+json"), (status = 404, body = Problem, content_type = "application/problem+json"), (status = 409, body = Problem, content_type = "application/problem+json")),
    tag = "Rooms",
    security(("SessionCookie" = []), ("SessionToken" = []))
)]
#[delete("/{id}/queue/{queue_id}")]
pub async fn remove_queue_item(
    svc: Data<RoomService>,
    ctx: ReqData<AuthorizationContext>,
    path: Path<(String, String)>,
    query: Query<RoomQueueRevision>,
) -> Result<HttpResponse, AppError> {
    let (id, queue_id) = path.into_inner();
    svc.remove_queue_item(
        &id,
        &ctx.user.id,
        &team_ids(&ctx),
        &queue_id,
        query.revision,
    )
    .await?;
    Ok(HttpResponse::NoContent().finish())
}

#[utoipa::path(
    put,
    path = "/api/v1/rooms/{id}/queue/order",
    params(("id" = String, Path)),
    request_body = ReorderRoomQueue,
    responses((status = 204), (status = 400, body = Problem, content_type = "application/problem+json"), (status = 403, body = Problem, content_type = "application/problem+json"), (status = 404, body = Problem, content_type = "application/problem+json"), (status = 409, body = Problem, content_type = "application/problem+json")),
    tag = "Rooms",
    security(("SessionCookie" = []), ("SessionToken" = []))
)]
#[put("/{id}/queue/order")]
pub async fn reorder_queue(
    svc: Data<RoomService>,
    ctx: ReqData<AuthorizationContext>,
    id: Path<String>,
    body: Json<ReorderRoomQueue>,
) -> Result<HttpResponse, AppError> {
    let body = body.into_inner();
    svc.reorder_queue(
        &id,
        &ctx.user.id,
        &team_ids(&ctx),
        &body.queue_ids,
        body.revision,
    )
    .await?;
    Ok(HttpResponse::NoContent().finish())
}

#[utoipa::path(delete, path = "/api/v1/rooms/{id}", params(("id" = String, Path)), responses((status = 204)), tag = "Rooms", security(("SessionCookie" = []), ("SessionToken" = [])))]
#[delete("/{id}")]
pub async fn close_room(
    svc: Data<RoomService>,
    ctx: ReqData<AuthorizationContext>,
    id: Path<String>,
) -> Result<HttpResponse, AppError> {
    svc.close(&id, &ctx.user.id, &team_ids(&ctx), &closable_team_ids(&ctx))
        .await?;
    Ok(HttpResponse::NoContent().finish())
}

#[utoipa::path(post, path = "/api/v1/rooms/invite/inspect", request_body = InspectRoomInvite, responses((status = 200, body = RoomInviteInfo)), tag = "Rooms")]
#[post("/invite/inspect")]
pub async fn inspect_invite(
    svc: Data<RoomService>,
    body: Json<InspectRoomInvite>,
) -> Result<HttpResponse, AppError> {
    Ok(HttpResponse::Ok().json(svc.inspect_invite(&body.invite_secret).await?))
}

#[utoipa::path(post, path = "/api/v1/rooms/invite/join", request_body = JoinRoomInvite, responses((status = 200, body = RoomCredentials)), tag = "Rooms")]
#[post("/invite/join")]
pub async fn join_invite(
    svc: Data<RoomService>,
    body: Json<JoinRoomInvite>,
) -> Result<HttpResponse, AppError> {
    Ok(HttpResponse::Ok().json(svc.join_invite(&body).await?))
}

#[utoipa::path(post, path = "/api/v1/rooms/{id}/reconnect", params(("id" = String, Path)), request_body = JoinRoom, responses((status = 200, body = RoomCredentials)), tag = "Rooms")]
#[post("/{id}/reconnect")]
pub async fn reconnect_room(
    svc: Data<RoomService>,
    id: Path<String>,
    body: Json<JoinRoom>,
) -> Result<HttpResponse, AppError> {
    let credential = body
        .resume_credential
        .as_deref()
        .ok_or_else(AppError::unauthorized)?;
    Ok(HttpResponse::Ok().json(svc.reconnect(&id, credential).await?))
}

#[utoipa::path(get, path = "/api/v1/rooms/{room_id}/media/{blob_id}", params(("room_id" = String, Path), ("blob_id" = String, Path), ("Authorization" = String, Header)), responses((status = 200, content_type = "application/octet-stream")), tag = "Rooms")]
#[get("/{room_id}/media/{blob_id}")]
pub async fn room_media(
    req: HttpRequest,
    svc: Data<RoomService>,
    blobs: Data<BlobServiceHandle>,
    path: Path<(String, String)>,
) -> Result<HttpResponse, AppError> {
    let (room_id, blob_id) = path.into_inner();
    let auth = req
        .headers()
        .get("Authorization")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Room "))
        .ok_or_else(AppError::unauthorized)?;
    let team_id = svc.authorize_media(&room_id, auth, &blob_id).await?;
    let team = parse_owner_record_id(&team_id)?;
    let file = blobs.open_blob_data_file_for_room(team, &blob_id).await?;
    Ok(file.into_response(&req))
}

#[get("/ws")]
pub async fn room_websocket(
    req: HttpRequest,
    body: web::Payload,
    svc: Data<RoomService>,
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
        let Ok(ClientEvent::Authenticate { ticket }) = serde_json::from_str::<ClientEvent>(&raw)
        else {
            let _ = session.close(None).await;
            return;
        };
        let Ok((room_id, participant_id, mut events, snapshot)) = svc.consume_ticket(&ticket).await
        else {
            let _ = session.close(None).await;
            return;
        };
        let _ = session
            .text(
                serde_json::to_string(&ServerEvent::Snapshot {
                    snapshot: Box::new(snapshot),
                })
                .unwrap(),
            )
            .await;
        loop {
            tokio::select! {
                message = stream.next() => match message {
                    Some(Ok(actix_ws::Message::Text(raw))) => if let Ok(command) = serde_json::from_str::<ClientEvent>(&raw) { let result = svc.command(&room_id, &participant_id, command).await; if let Ok(Some(event)) = result { let _ = session.text(serde_json::to_string(&event).unwrap()).await; } },
                    Some(Ok(actix_ws::Message::Ping(bytes))) => { let _ = session.pong(&bytes).await; },
                    Some(Ok(actix_ws::Message::Close(_))) | None => break,
                    _ => {}
                },
                event = events.recv() => match event { Ok(event) => { if session.text(serde_json::to_string(&event).unwrap()).await.is_err() { break; } }, Err(broadcast::error::RecvError::Lagged(_)) => if let Ok(snapshot) = svc.snapshot_for_participant(&room_id, &participant_id).await { let _ = session.text(serde_json::to_string(&ServerEvent::Snapshot { snapshot: Box::new(snapshot) }).unwrap()).await; }, Err(_) => break }
            }
        }
        svc.disconnect(&room_id, &participant_id).await;
        let _ = session.close(None).await;
    });
    Ok(response)
}
