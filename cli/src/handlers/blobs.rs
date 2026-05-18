use std::fs;
use std::io::{self, Write};

use shared::api::ApiClient;
use shared::blob::{CreateBlob, UpdateBlob};
use shared::move_owner::MoveOwner;
use shared::net::DefaultHttpClient;

use crate::commands::BlobsCommand;
use crate::output::{self, OutputFormat};
use crate::validate::{list_query_from_opts, validate_resource_id};

pub async fn handle_blobs(
    client: &ApiClient<DefaultHttpClient>,
    output: OutputFormat,
    dry_run: bool,
    effective_base_url: &str,
    cmd: &BlobsCommand,
) -> Result<(), Box<dyn std::error::Error>> {
    match cmd {
        BlobsCommand::List { page, page_size } => {
            let query = list_query_from_opts(*page, *page_size);
            let blobs = client.list_blobs(query).await?;
            match output::effective_output_format(&output) {
                OutputFormat::Ndjson => output::print_ndjson_list(&blobs),
                _ => output::print_json(&blobs, &output),
            }
        }
        BlobsCommand::Get { id } => {
            validate_resource_id(id)?;
            let blob = client.get_blob(id).await?;
            output::print_json(&blob, &output)
        }
        BlobsCommand::Create { json } => {
            let payload: CreateBlob = serde_json::from_str(json)?;
            if dry_run {
                let planned = serde_json::json!({
                    "method": "POST",
                    "path": "api/v1/blobs",
                    "body": payload,
                });
                output::print_json(&planned, &output)?;
                return Ok(());
            }
            let blob = client.create_blob(payload).await?;
            output::print_json(&blob, &output)
        }
        BlobsCommand::Update { id, json } => {
            validate_resource_id(id)?;
            let payload: UpdateBlob = serde_json::from_str(json)?;
            if dry_run {
                let planned = serde_json::json!({
                    "method": "PUT",
                    "path": format!("api/v1/blobs/{id}"),
                    "body": payload,
                });
                output::print_json(&planned, &output)?;
                return Ok(());
            }
            let blob = client.update_blob(id, payload).await?;
            output::print_json(&blob, &output)
        }
        BlobsCommand::Patch { id, json } => {
            validate_resource_id(id)?;
            let payload: serde_json::Value = serde_json::from_str(json)?;
            if dry_run {
                let planned = serde_json::json!({
                    "method": "PATCH",
                    "path": format!("api/v1/blobs/{id}"),
                    "body": payload,
                });
                output::print_json(&planned, &output)?;
                return Ok(());
            }
            let blob = client.patch_blob(id, payload).await?;
            output::print_json(&blob, &output)
        }
        BlobsCommand::Move { id, json } => {
            validate_resource_id(id)?;
            let payload: MoveOwner = serde_json::from_str(json)?;
            if dry_run {
                let planned = serde_json::json!({
                    "method": "POST",
                    "path": format!("api/v1/blobs/{id}/move"),
                    "body": payload,
                });
                output::print_json(&planned, &output)?;
                return Ok(());
            }
            let blob = client.move_blob(id, payload).await?;
            output::print_json(&blob, &output)
        }
        BlobsCommand::Delete { id } => {
            validate_resource_id(id)?;
            if dry_run {
                let planned = serde_json::json!({
                    "method": "DELETE",
                    "path": format!("api/v1/blobs/{id}"),
                });
                output::print_json(&planned, &output)?;
                return Ok(());
            }
            client.delete_blob(id).await?;
            output::print_json(&serde_json::json!({"deleted": true}), &output)
        }
        BlobsCommand::DownloadUrl { id } => {
            validate_resource_id(id)?;
            let url_path = client.download_blob_image_url(id);
            let full_url = format!(
                "{}/{}",
                effective_base_url.trim_end_matches('/'),
                url_path.trim_start_matches('/')
            );
            output::print_json(&serde_json::json!({ "url": full_url }), &output)
        }
        BlobsCommand::DownloadData {
            id,
            output: out_path,
        } => {
            validate_resource_id(id)?;
            if dry_run {
                output::print_json(
                    &serde_json::json!({
                        "method": "GET",
                        "path": format!("api/v1/blobs/{id}/data"),
                    }),
                    &output,
                )?;
                return Ok(());
            }
            let bytes = client.download_blob_data(id).await?;
            if let Some(path) = out_path {
                fs::write(path, &bytes)?;
            } else {
                let mut stdout = io::stdout().lock();
                stdout.write_all(&bytes)?;
            }
            Ok(())
        }
        BlobsCommand::UploadData {
            id,
            file,
            content_type,
        } => {
            validate_resource_id(id)?;
            let body = fs::read(file)?;
            let ct = content_type
                .as_deref()
                .map(str::trim)
                .filter(|s| !s.is_empty())
                .map(String::from)
                .unwrap_or_else(|| "application/octet-stream".to_string());
            if dry_run {
                output::print_json(
                    &serde_json::json!({
                        "method": "PUT",
                        "path": format!("api/v1/blobs/{id}/data"),
                        "content_type": ct,
                        "body_len": body.len(),
                    }),
                    &output,
                )?;
                return Ok(());
            }
            client.upload_blob_data(id, &ct, &body).await?;
            output::print_json(&serde_json::json!({"uploaded": true}), &output)
        }
    }
}
