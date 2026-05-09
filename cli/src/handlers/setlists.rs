use shared::api::ApiClient;
use shared::move_owner::MoveOwner;
use shared::net::DefaultHttpClient;
use shared::setlist::{CreateSetlist, UpdateSetlist};

use crate::commands::SetlistsCommand;
use crate::output::{self, OutputFormat};
use crate::validate::{list_query_from_opts, validate_resource_id};

pub async fn handle_setlists(
    client: &ApiClient<DefaultHttpClient>,
    output: OutputFormat,
    dry_run: bool,
    _effective_base_url: &str,
    cmd: &SetlistsCommand,
) -> Result<(), Box<dyn std::error::Error>> {
    match cmd {
        SetlistsCommand::List { page, page_size } => {
            let query = list_query_from_opts(*page, *page_size);
            let setlists = client.list_setlists(query).await?;
            match output::effective_output_format(&output) {
                OutputFormat::Ndjson => output::print_ndjson_list(&setlists),
                _ => output::print_json(&setlists, &output),
            }
        }
        SetlistsCommand::Get { id } => {
            validate_resource_id(id)?;
            let setlist = client.get_setlist(id).await?;
            output::print_json(&setlist, &output)
        }
        SetlistsCommand::Songs {
            id,
            page,
            page_size,
        } => {
            validate_resource_id(id)?;
            let query = list_query_from_opts(*page, *page_size);
            let songs = client.get_setlist_songs(id, query).await?;
            match output::effective_output_format(&output) {
                OutputFormat::Ndjson => output::print_ndjson_list(&songs),
                _ => output::print_json(&songs, &output),
            }
        }
        SetlistsCommand::Player { id } => {
            validate_resource_id(id)?;
            let player = client.get_setlist_player(id).await?;
            output::print_json(&player, &output)
        }
        SetlistsCommand::Create { json } => {
            let payload: CreateSetlist = serde_json::from_str(json)?;
            if dry_run {
                let planned = serde_json::json!({
                    "method": "POST",
                    "path": "api/v1/setlists",
                    "body": payload,
                });
                output::print_json(&planned, &output)?;
                return Ok(());
            }
            let setlist = client.create_setlist(payload).await?;
            output::print_json(&setlist, &output)
        }
        SetlistsCommand::Update { id, json } => {
            validate_resource_id(id)?;
            let payload: UpdateSetlist = serde_json::from_str(json)?;
            if dry_run {
                let planned = serde_json::json!({
                    "method": "PUT",
                    "path": format!("api/v1/setlists/{id}"),
                    "body": payload,
                });
                output::print_json(&planned, &output)?;
                return Ok(());
            }
            let setlist = client.update_setlist(id, payload).await?;
            output::print_json(&setlist, &output)
        }
        SetlistsCommand::Patch { id, json } => {
            validate_resource_id(id)?;
            let payload: serde_json::Value = serde_json::from_str(json)?;
            if dry_run {
                let planned = serde_json::json!({
                    "method": "PATCH",
                    "path": format!("api/v1/setlists/{id}"),
                    "body": payload,
                });
                output::print_json(&planned, &output)?;
                return Ok(());
            }
            let setlist = client.patch_setlist(id, payload).await?;
            output::print_json(&setlist, &output)
        }
        SetlistsCommand::Move { id, json } => {
            validate_resource_id(id)?;
            let payload: MoveOwner = serde_json::from_str(json)?;
            if dry_run {
                let planned = serde_json::json!({
                    "method": "POST",
                    "path": format!("api/v1/setlists/{id}/move"),
                    "body": payload,
                });
                output::print_json(&planned, &output)?;
                return Ok(());
            }
            let setlist = client.move_setlist(id, payload).await?;
            output::print_json(&setlist, &output)
        }
        SetlistsCommand::Delete { id } => {
            validate_resource_id(id)?;
            if dry_run {
                let planned = serde_json::json!({
                    "method": "DELETE",
                    "path": format!("api/v1/setlists/{id}"),
                });
                output::print_json(&planned, &output)?;
                return Ok(());
            }
            client.delete_setlist(id).await?;
            output::print_json(&serde_json::json!({"deleted": true}), &output)
        }
    }
}
