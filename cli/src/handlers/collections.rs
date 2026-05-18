use shared::api::ApiClient;
use shared::collection::{CreateCollection, UpdateCollection};
use shared::move_owner::MoveOwner;
use shared::net::DefaultHttpClient;

use crate::commands::CollectionsCommand;
use crate::output::{self, OutputFormat};
use crate::validate::{list_query_from_opts, validate_resource_id};

pub async fn handle_collections(
    client: &ApiClient<DefaultHttpClient>,
    output: OutputFormat,
    dry_run: bool,
    _effective_base_url: &str,
    cmd: &CollectionsCommand,
) -> Result<(), Box<dyn std::error::Error>> {
    match cmd {
        CollectionsCommand::List { page, page_size } => {
            let query = list_query_from_opts(*page, *page_size);
            let collections = client.list_collections(query).await?;
            match output::effective_output_format(&output) {
                OutputFormat::Ndjson => output::print_ndjson_list(&collections),
                _ => output::print_json(&collections, &output),
            }
        }
        CollectionsCommand::Get { id } => {
            validate_resource_id(&id)?;
            let collection = client.get_collection(&id).await?;
            output::print_json(&collection, &output)
        }
        CollectionsCommand::Songs {
            id,
            page,
            page_size,
        } => {
            validate_resource_id(id)?;
            let query = list_query_from_opts(*page, *page_size);
            let songs = client.get_collection_songs(id, query).await?;
            match output::effective_output_format(&output) {
                OutputFormat::Ndjson => output::print_ndjson_list(&songs),
                _ => output::print_json(&songs, &output),
            }
        }
        CollectionsCommand::Player { id } => {
            validate_resource_id(&id)?;
            let player = client.get_collection_player(&id).await?;
            output::print_json(&player, &output)
        }
        CollectionsCommand::Create { json } => {
            let payload: CreateCollection = serde_json::from_str(&json)?;
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
            validate_resource_id(&id)?;
            let payload: UpdateCollection = serde_json::from_str(&json)?;
            if dry_run {
                let planned = serde_json::json!({
                    "method": "PUT",
                    "path": format!("api/v1/collections/{id}"),
                    "body": payload,
                });
                output::print_json(&planned, &output)?;
                return Ok(());
            }
            let collection = client.update_collection(&id, payload).await?;
            output::print_json(&collection, &output)
        }
        CollectionsCommand::Patch { id, json } => {
            validate_resource_id(&id)?;
            let payload: serde_json::Value = serde_json::from_str(&json)?;
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
            validate_resource_id(&id)?;
            if dry_run {
                let planned = serde_json::json!({
                    "method": "DELETE",
                    "path": format!("api/v1/collections/{id}"),
                });
                output::print_json(&planned, &output)?;
                return Ok(());
            }
            client.delete_collection(&id).await?;
            output::print_json(&serde_json::json!({"deleted": true}), &output)
        }
    }
}
