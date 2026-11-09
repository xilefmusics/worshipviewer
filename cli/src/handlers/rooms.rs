use shared::room::CreateRoom;
use shared::room_message::{MessageRoomClientEvent, MessageRoomJoin};

use crate::commands::RoomsCommand;
use crate::http_extra::{get_room_history, room_socket};
use crate::list_output::print_list;
use crate::output::{self, OutputFormat};
use crate::session::CliSession;
use crate::validate::{list_query_from_hub_args, validate_resource_id};

pub async fn handle_rooms(
    session: &CliSession,
    output: OutputFormat,
    dry_run: bool,
    cmd: &RoomsCommand,
) -> Result<(), Box<dyn std::error::Error>> {
    let client = session.api();
    match cmd {
        RoomsCommand::List { list } => {
            let query = list_query_from_hub_args(list)?;
            print_list(
                session,
                "api/v1/rooms",
                &query.to_query_string(),
                list.page.with_meta,
                &output,
                || async { client.list_rooms(query.clone()).await },
            )
            .await
        }
        RoomsCommand::Create { json } => {
            let payload: CreateRoom = serde_json::from_str(json)?;
            if dry_run {
                output::print_json(
                    &serde_json::json!({
                        "method": "POST",
                        "path": "api/v1/rooms",
                        "body": payload,
                    }),
                    &output,
                )?;
                return Ok(());
            }
            let room = client.create_room(payload).await?;
            output::print_json(&room, &output)
        }
        RoomsCommand::Join {
            id,
            resume_credential,
        } => {
            validate_resource_id(id)?;
            let payload = MessageRoomJoin {
                resume_credential: resume_credential.clone(),
            };
            if dry_run {
                output::print_json(
                    &serde_json::json!({
                        "method": "POST",
                        "path": format!("api/v1/rooms/{id}/join"),
                        "body": {"resume_credential": resume_credential.as_ref().map(|_| "<redacted>")},
                    }),
                    &output,
                )?;
                return Ok(());
            }
            let credentials = client.join_room(id, payload).await?;
            output::print_json(&credentials, &output)
        }
        RoomsCommand::History {
            id,
            resume_credential,
            epoch,
            sequence,
        } => {
            validate_resource_id(id)?;
            if dry_run {
                output::print_json(
                    &serde_json::json!({
                        "method": "GET",
                        "path": format!("api/v1/rooms/{id}/history?epoch={epoch}&sequence={sequence}"),
                        "headers": {"x-room-resume": "<redacted>"},
                    }),
                    &output,
                )?;
                return Ok(());
            }
            let replay =
                get_room_history(session, id, resume_credential, *epoch, *sequence).await?;
            output::print_json(&replay, &output)
        }
        RoomsCommand::Socket {
            connection_ticket,
            room_id,
            resume_credential,
            messages,
            wait_secs,
            follow,
        } => {
            for message in messages {
                let event: MessageRoomClientEvent = serde_json::from_str(message)?;
                if matches!(event, MessageRoomClientEvent::Authenticate { .. }) {
                    return Err("rooms socket authenticates with --connection-ticket".into());
                }
            }
            if room_id.is_some() != resume_credential.is_some() {
                return Err("--room-id and --resume-credential must be used together".into());
            }
            if let Some(room_id) = room_id {
                validate_resource_id(room_id)?;
            }
            if dry_run {
                output::print_json(
                    &serde_json::json!({
                        "protocol": "websocket",
                        "path": "api/v1/rooms/ws",
                        "authenticate": {"type": "authenticate", "ticket": "<redacted>"},
                        "room_id": room_id,
                        "resume_credential": resume_credential.as_ref().map(|_| "<redacted>"),
                        "messages": messages,
                        "wait_secs": wait_secs,
                        "follow": follow,
                    }),
                    &output,
                )?;
                return Ok(());
            }
            room_socket(
                session,
                connection_ticket,
                room_id.as_deref(),
                resume_credential.as_deref(),
                messages,
                *wait_secs,
                *follow,
            )
            .await
        }
        RoomsCommand::Close { id } => {
            validate_resource_id(id)?;
            if dry_run {
                output::print_json(
                    &serde_json::json!({
                        "method": "DELETE",
                        "path": format!("api/v1/rooms/{id}"),
                    }),
                    &output,
                )?;
                return Ok(());
            }
            client.close_room(id).await?;
            output::print_json(&serde_json::json!({"closed": true}), &output)
        }
    }
}
