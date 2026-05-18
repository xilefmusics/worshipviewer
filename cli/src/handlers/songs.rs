use shared::api::{ApiClient, ListQuery};
use shared::move_owner::MoveOwner;
use shared::net::DefaultHttpClient;
use shared::song::{CreateSong, UpdateSong};

use crate::commands::SongsCommand;
use crate::output::{self, OutputFormat};
use crate::validate::validate_resource_id;

pub async fn handle_songs(
    client: &ApiClient<DefaultHttpClient>,
    output: OutputFormat,
    dry_run: bool,
    _effective_base_url: &str,
    cmd: &SongsCommand,
) -> Result<(), Box<dyn std::error::Error>> {
    match cmd {
        SongsCommand::List { page, page_size } => {
            let mut query = ListQuery::new();
            if let Some(p) = *page {
                query = query.with_page(p);
            }
            if let Some(ps) = *page_size {
                query = query.with_page_size(ps);
            }
            let songs = client.get_songs(query.into()).await?;
            match output::effective_output_format(&output) {
                OutputFormat::Ndjson => output::print_ndjson_list(&songs),
                _ => output::print_json(&songs, &output),
            }
        }
        SongsCommand::Get { id } => {
            validate_resource_id(id)?;
            let song = client.get_song(id).await?;
            output::print_json(&song, &output)
        }
        SongsCommand::Player { id } => {
            validate_resource_id(id)?;
            let player = client.get_song_player(id).await?;
            output::print_json(&player, &output)
        }
        SongsCommand::Create { json } => {
            let payload: CreateSong = serde_json::from_str(json)?;
            if dry_run {
                let planned = serde_json::json!({
                    "method": "POST",
                    "path": "api/v1/songs",
                    "body": payload,
                });
                output::print_json(&planned, &output)?;
                return Ok(());
            }
            let song = client.create_song(payload).await?;
            output::print_json(&song, &output)
        }
        SongsCommand::Update { id, json } => {
            validate_resource_id(id)?;
            let payload: UpdateSong = serde_json::from_str(json)?;
            if dry_run {
                let planned = serde_json::json!({
                    "method": "PUT",
                    "path": format!("api/v1/songs/{id}"),
                    "body": payload,
                });
                output::print_json(&planned, &output)?;
                return Ok(());
            }
            let song = client.update_song(id, payload).await?;
            output::print_json(&song, &output)
        }
        SongsCommand::Patch { id, json } => {
            validate_resource_id(id)?;
            let payload: serde_json::Value = serde_json::from_str(json)?;
            if dry_run {
                let planned = serde_json::json!({
                    "method": "PATCH",
                    "path": format!("api/v1/songs/{id}"),
                    "body": payload,
                });
                output::print_json(&planned, &output)?;
                return Ok(());
            }
            let song = client.patch_song(id, payload).await?;
            output::print_json(&song, &output)
        }
        SongsCommand::Move { id, json } => {
            validate_resource_id(id)?;
            let payload: MoveOwner = serde_json::from_str(json)?;
            if dry_run {
                let planned = serde_json::json!({
                    "method": "POST",
                    "path": format!("api/v1/songs/{id}/move"),
                    "body": payload,
                });
                output::print_json(&planned, &output)?;
                return Ok(());
            }
            let song = client.move_song(id, payload).await?;
            output::print_json(&song, &output)
        }
        SongsCommand::Delete { id } => {
            validate_resource_id(id)?;
            if dry_run {
                let planned = serde_json::json!({
                    "method": "DELETE",
                    "path": format!("api/v1/songs/{id}"),
                });
                output::print_json(&planned, &output)?;
                return Ok(());
            }
            client.delete_song(id).await?;
            output::print_json(&serde_json::json!({"deleted": true}), &output)
        }
        SongsCommand::LikeStatus { id } => {
            validate_resource_id(id)?;
            let liked = client.get_song_like_status(id).await?;
            output::print_json(&serde_json::json!({ "liked": liked }), &output)
        }
        SongsCommand::UpdateLikeStatus { id, liked } => {
            validate_resource_id(id)?;
            if dry_run {
                let planned = if *liked {
                    serde_json::json!({
                        "method": "PUT",
                        "path": format!("api/v1/songs/{id}/like"),
                    })
                } else {
                    serde_json::json!({
                        "method": "DELETE",
                        "path": format!("api/v1/songs/{id}/like"),
                    })
                };
                output::print_json(&planned, &output)?;
                return Ok(());
            }
            client.update_song_like_status(id, *liked).await?;
            output::print_json(&serde_json::json!({ "liked": liked }), &output)
        }
    }
}
