use std::fs;

use shared::collection::{CreateCollection, TransferCollectionSong, UpdateCollection};
use shared::move_owner::MoveOwner;

use crate::commands::CollectionsCommand;
use crate::http_extra::{transfer_collection_song, upload_collection_cover};
use crate::list_output::print_list;
use crate::output::{self, OutputFormat};
use crate::session::CliSession;
use crate::validate::{
    image_content_type_for_path, list_query_from_hub_args, list_query_from_page_args,
    validate_resource_id,
};

pub async fn handle_collections(
    session: &CliSession,
    output: OutputFormat,
    dry_run: bool,
    cmd: &CollectionsCommand,
) -> Result<(), Box<dyn std::error::Error>> {
    let client = session.api();
    match cmd {
        CollectionsCommand::List { list } => {
            let query = list_query_from_hub_args(list)?;
            print_list(
                session,
                "api/v1/collections",
                &query.to_query_string(),
                list.page.with_meta,
                &output,
                || async { client.list_collections(query.clone()).await },
            )
            .await
        }
        CollectionsCommand::Get { id } => {
            validate_resource_id(id)?;
            let collection = client.get_collection(id).await?;
            output::print_json(&collection, &output)
        }
        CollectionsCommand::Songs { id, page } => {
            validate_resource_id(id)?;
            let query = list_query_from_page_args(page)?;
            let path = format!("api/v1/collections/{id}/songs{}", query.to_query_string());
            print_list(session, &path, "", page.with_meta, &output, || async {
                client.get_collection_songs(id, query.clone()).await
            })
            .await
        }
        CollectionsCommand::Player { id } => {
            validate_resource_id(id)?;
            let player = client.get_collection_player(id).await?;
            output::print_json(&player, &output)
        }
        CollectionsCommand::Create { json } => {
            let payload: CreateCollection = serde_json::from_str(json)?;
            if dry_run {
                let planned = serde_json::json!({
                    "method": "POST",
                    "path": "api/v1/collections",
                    "body": payload,
                });
                output::print_json(&planned, &output)?;
                return Ok(());
            }
            let collection = client.create_collection(payload).await?;
            output::print_json(&collection, &output)
        }
        CollectionsCommand::Update { id, json } => {
            validate_resource_id(id)?;
            let payload: UpdateCollection = serde_json::from_str(json)?;
            if dry_run {
                let planned = serde_json::json!({
                    "method": "PUT",
                    "path": format!("api/v1/collections/{id}"),
                    "body": payload,
                });
                output::print_json(&planned, &output)?;
                return Ok(());
            }
            let collection = client.update_collection(id, payload).await?;
            output::print_json(&collection, &output)
        }
        CollectionsCommand::Patch { id, json } => {
            validate_resource_id(id)?;
            let payload: serde_json::Value = serde_json::from_str(json)?;
            if dry_run {
                let planned = serde_json::json!({
                    "method": "PATCH",
                    "path": format!("api/v1/collections/{id}"),
                    "body": payload,
                });
                output::print_json(&planned, &output)?;
                return Ok(());
            }
            let collection = client.patch_collection(id, payload).await?;
            output::print_json(&collection, &output)
        }
        CollectionsCommand::Move { id, json } => {
            validate_resource_id(id)?;
            let payload: MoveOwner = serde_json::from_str(json)?;
            if dry_run {
                let planned = serde_json::json!({
                    "method": "POST",
                    "path": format!("api/v1/collections/{id}/move"),
                    "body": payload,
                });
                output::print_json(&planned, &output)?;
                return Ok(());
            }
            let collection = client.move_collection(id, payload).await?;
            output::print_json(&collection, &output)
        }
        CollectionsCommand::Delete { id } => {
            validate_resource_id(id)?;
            if dry_run {
                let planned = serde_json::json!({
                    "method": "DELETE",
                    "path": format!("api/v1/collections/{id}"),
                });
                output::print_json(&planned, &output)?;
                return Ok(());
            }
            client.delete_collection(id).await?;
            output::print_json(&serde_json::json!({"deleted": true}), &output)
        }
        CollectionsCommand::TransferSong { id, song_id, json } => {
            validate_resource_id(id)?;
            validate_resource_id(song_id)?;
            let payload: TransferCollectionSong = serde_json::from_str(json)?;
            if dry_run {
                let planned = serde_json::json!({
                    "method": "POST",
                    "path": format!("api/v1/collections/{id}/songs/{song_id}/transfer"),
                    "body": payload,
                });
                output::print_json(&planned, &output)?;
                return Ok(());
            }
            let result = transfer_collection_song(session.http(), id, song_id, payload).await?;
            output::print_json(&result, &output)
        }
        CollectionsCommand::CoverPut {
            id,
            file,
            content_type,
        } => {
            validate_resource_id(id)?;
            let ct = image_content_type_for_path(file, content_type.as_deref())?;
            let body = fs::read(file)?;
            if dry_run {
                let planned = serde_json::json!({
                    "method": "PUT",
                    "path": format!("api/v1/collections/{id}/cover"),
                    "content_type": ct,
                    "body_len": body.len(),
                });
                output::print_json(&planned, &output)?;
                return Ok(());
            }
            let collection = upload_collection_cover(session.http(), id, &ct, &body).await?;
            output::print_json(&collection, &output)
        }
    }
}
