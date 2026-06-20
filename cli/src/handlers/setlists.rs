use shared::move_owner::MoveOwner;
use shared::setlist::{CreateSetlist, UpdateSetlist};

use crate::commands::SetlistsCommand;
use crate::list_output::print_list;
use crate::output::{self, OutputFormat};
use crate::session::CliSession;
use crate::validate::{list_query_from_hub_args, list_query_from_page_args, validate_resource_id};

pub async fn handle_setlists(
    session: &CliSession,
    output: OutputFormat,
    dry_run: bool,
    cmd: &SetlistsCommand,
) -> Result<(), Box<dyn std::error::Error>> {
    let client = session.api();
    match cmd {
        SetlistsCommand::List { list } => {
            let query = list_query_from_hub_args(list)?;
            print_list(
                session,
                "api/v1/setlists",
                &query.to_query_string(),
                list.page.with_meta,
                &output,
                || async { client.list_setlists(query.clone()).await },
            )
            .await
        }
        SetlistsCommand::Get { id } => {
            validate_resource_id(id)?;
            let setlist = client.get_setlist(id).await?;
            output::print_json(&setlist, &output)
        }
        SetlistsCommand::Songs { id, page } => {
            validate_resource_id(id)?;
            let query = list_query_from_page_args(page)?;
            let path = format!("api/v1/setlists/{id}/songs{}", query.to_query_string());
            print_list(session, &path, "", page.with_meta, &output, || async {
                client.get_setlist_songs(id, query.clone()).await
            })
            .await
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
