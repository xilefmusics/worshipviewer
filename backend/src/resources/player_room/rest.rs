use std::time::Duration as StdDuration;

use actix_web::{
    HttpRequest, HttpResponse, Scope, delete, get, post,
    web::{self, Data, Json, Path, Query, ReqData},
};
use futures_util::StreamExt;
use shared::{
    api::{ListQuery, PAGE_SIZE_DEFAULT},
    player_room::*,
};
use tokio::sync::broadcast;

use crate::{
    auth::{AuthorizationContext, context::AuthorizedTeamRole, middleware::RequireUser},
    error::AppError,
    resources::{blob::service::BlobServiceHandle, team::parse_owner_record_id},
};

use super::service::{ClientEvent, CreateRoomInput, PlayerRoomService, ServerEvent};

pub fn scope() -> Scope {
    web::scope("/player-rooms")
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
                .service(close_room),
        )
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

#[utoipa::path(get, path = "/api/v1/player-rooms", params(("page" = Option<u32>, Query), ("page_size" = Option<u32>, Query), ("q" = Option<String>, Query), ("team" = Option<String>, Query)), responses((status = 200, body = [PlayerRoomSummary])), tag = "Player Rooms", security(("SessionCookie" = []), ("SessionToken" = [])))]
#[get("")]
pub async fn list_rooms(
    svc: Data<PlayerRoomService>,
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

#[utoipa::path(post, path = "/api/v1/player-rooms", request_body = CreatePlayerRoom, responses((status = 201, body = CreatedPlayerRoom)), tag = "Player Rooms", security(("SessionCookie" = []), ("SessionToken" = [])))]
#[post("")]
pub async fn create_room(
    svc: Data<PlayerRoomService>,
    ctx: ReqData<AuthorizationContext>,
    body: Json<CreatePlayerRoom>,
) -> Result<HttpResponse, AppError> {
    let request = body.into_inner();
    let owner_record = parse_owner_record_id(&request.team_id)?;
    ctx.require_write_access_to_owner(&owner_record)?;
    let created = svc
        .create(CreateRoomInput {
            team_id: crate::database::record_id_string(&owner_record),
            name: request.name,
            host_user_id: ctx.user.id.clone(),
            host_email: ctx.user.email.clone(),
            host_avatar_url: ctx.user.oauth_picture_url.clone(),
            source_type: None,
            source_id: None,
            source_title: None,
            content: PlayerRoomContent {
                items: Vec::new(),
                toc: Vec::new(),
            },
            host_mode: PlayerRoomMode::Sheet,
            musical_state: PlayerRoomMusicalState::default(),
            projection: None,
        })
        .await?;
    Ok(HttpResponse::Created().json(created))
}

#[utoipa::path(get, path = "/api/v1/player-rooms/{id}", params(("id" = String, Path)), responses((status = 200, body = PlayerRoomSnapshot)), tag = "Player Rooms", security(("SessionCookie" = []), ("SessionToken" = [])))]
#[get("/{id}")]
pub async fn get_room(
    svc: Data<PlayerRoomService>,
    ctx: ReqData<AuthorizationContext>,
    id: Path<String>,
) -> Result<HttpResponse, AppError> {
    Ok(HttpResponse::Ok().json(svc.get_for_teams(&id, &team_ids(&ctx)).await?))
}

#[utoipa::path(post, path = "/api/v1/player-rooms/{id}/join", params(("id" = String, Path)), request_body = JoinPlayerRoom, responses((status = 200, body = PlayerRoomCredentials)), tag = "Player Rooms", security(("SessionCookie" = []), ("SessionToken" = [])))]
#[post("/{id}/join")]
pub async fn join_room(
    svc: Data<PlayerRoomService>,
    ctx: ReqData<AuthorizationContext>,
    id: Path<String>,
    body: Json<JoinPlayerRoom>,
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

#[utoipa::path(delete, path = "/api/v1/player-rooms/{id}", params(("id" = String, Path)), responses((status = 204)), tag = "Player Rooms", security(("SessionCookie" = []), ("SessionToken" = [])))]
#[delete("/{id}")]
pub async fn close_room(
    svc: Data<PlayerRoomService>,
    ctx: ReqData<AuthorizationContext>,
    id: Path<String>,
) -> Result<HttpResponse, AppError> {
    svc.close(&id, &ctx.user.id, &team_ids(&ctx), &closable_team_ids(&ctx))
        .await?;
    Ok(HttpResponse::NoContent().finish())
}

#[utoipa::path(post, path = "/api/v1/player-rooms/invite/inspect", request_body = InspectPlayerRoomInvite, responses((status = 200, body = PlayerRoomInviteInfo)), tag = "Player Rooms")]
#[post("/invite/inspect")]
pub async fn inspect_invite(
    svc: Data<PlayerRoomService>,
    body: Json<InspectPlayerRoomInvite>,
) -> Result<HttpResponse, AppError> {
    Ok(HttpResponse::Ok().json(svc.inspect_invite(&body.invite_secret).await?))
}

#[utoipa::path(post, path = "/api/v1/player-rooms/invite/join", request_body = JoinPlayerRoomInvite, responses((status = 200, body = PlayerRoomCredentials)), tag = "Player Rooms")]
#[post("/invite/join")]
pub async fn join_invite(
    svc: Data<PlayerRoomService>,
    body: Json<JoinPlayerRoomInvite>,
) -> Result<HttpResponse, AppError> {
    Ok(HttpResponse::Ok().json(svc.join_invite(&body).await?))
}

#[utoipa::path(post, path = "/api/v1/player-rooms/{id}/reconnect", params(("id" = String, Path)), request_body = JoinPlayerRoom, responses((status = 200, body = PlayerRoomCredentials)), tag = "Player Rooms")]
#[post("/{id}/reconnect")]
pub async fn reconnect_room(
    svc: Data<PlayerRoomService>,
    id: Path<String>,
    body: Json<JoinPlayerRoom>,
) -> Result<HttpResponse, AppError> {
    let credential = body
        .resume_credential
        .as_deref()
        .ok_or_else(AppError::unauthorized)?;
    Ok(HttpResponse::Ok().json(svc.reconnect(&id, credential).await?))
}

#[utoipa::path(get, path = "/api/v1/player-rooms/{room_id}/media/{blob_id}", params(("room_id" = String, Path), ("blob_id" = String, Path), ("Authorization" = String, Header)), responses((status = 200, content_type = "application/octet-stream")), tag = "Player Rooms")]
#[get("/{room_id}/media/{blob_id}")]
pub async fn room_media(
    req: HttpRequest,
    svc: Data<PlayerRoomService>,
    blobs: Data<BlobServiceHandle>,
    path: Path<(String, String)>,
) -> Result<HttpResponse, AppError> {
    let (room_id, blob_id) = path.into_inner();
    let auth = req
        .headers()
        .get("Authorization")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("PlayerRoom "))
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
    svc: Data<PlayerRoomService>,
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
