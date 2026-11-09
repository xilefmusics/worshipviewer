use shared::media::{
    CommitDeck, CreateMedia, CreateUploadedMedia, DuplicateMedia, UpdateMedia, UploadedMediaKind,
};
use shared::move_owner::MoveOwner;
use shared::MediaAssetKind;

use crate::commands::MediaCommand;
use crate::http_extra::{
    create_uploaded_media, download_media_asset, head_media_asset, upload_media_asset_file,
};
use crate::list_output::print_list;
use crate::output::{self, OutputFormat};
use crate::session::CliSession;
use crate::validate::{
    media_content_type_for_path, media_list_query_from_args, validate_resource_id,
};

fn encode_query_value(value: &str) -> String {
    let mut encoded = String::with_capacity(value.len());
    for byte in value.bytes() {
        if byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'.' | b'_' | b'~') {
            encoded.push(byte as char);
        } else {
            encoded.push_str(&format!("%{byte:02X}"));
        }
    }
    encoded
}

pub async fn handle_media(
    session: &CliSession,
    output: OutputFormat,
    dry_run: bool,
    cmd: &MediaCommand,
) -> Result<(), Box<dyn std::error::Error>> {
    let client = session.api();
    match cmd {
        MediaCommand::List { list } => {
            let query = media_list_query_from_args(list)?;
            print_list(
                session,
                "api/v1/media",
                &query.to_query_string(),
                list.page.with_meta,
                &output,
                || async { client.list_media(query.clone()).await },
            )
            .await
        }
        MediaCommand::Get { id } => {
            validate_resource_id(id)?;
            let media = client.get_media(id).await?;
            output::print_json(&media, &output)
        }
        MediaCommand::Create { json } => {
            let payload: CreateMedia = serde_json::from_str(json)?;
            if dry_run {
                output::print_json(
                    &serde_json::json!({
                        "method": "POST",
                        "path": "api/v1/media",
                        "body": payload,
                    }),
                    &output,
                )?;
                return Ok(());
            }
            let media = client.create_media(payload).await?;
            output::print_json(&media, &output)
        }
        MediaCommand::Upload {
            kind,
            metadata,
            files,
        } => {
            let kind_value = UploadedMediaKind::parse(kind)
                .ok_or("--kind must be image, video, audio, or slide_deck")?;
            if files.is_empty() {
                return Err("at least one --file is required".into());
            }
            if kind_value != UploadedMediaKind::SlideDeck && files.len() != 1 {
                return Err("image, video, and audio uploads accept exactly one file".into());
            }
            let metadata: CreateUploadedMedia = serde_json::from_str(metadata)?;
            if dry_run {
                output::print_json(
                    &serde_json::json!({
                        "method": "POST",
                        "path": format!("api/v1/media/uploads?kind={kind}"),
                        "metadata": metadata,
                        "files": files,
                    }),
                    &output,
                )?;
                return Ok(());
            }
            let media = create_uploaded_media(session, kind, metadata, files).await?;
            output::print_json(&media, &output)
        }
        MediaCommand::Update { id, json } => {
            validate_resource_id(id)?;
            let payload: UpdateMedia = serde_json::from_str(json)?;
            if dry_run {
                output::print_json(
                    &serde_json::json!({
                        "method": "PUT",
                        "path": format!("api/v1/media/{id}"),
                        "body": payload,
                    }),
                    &output,
                )?;
                return Ok(());
            }
            let media = client.update_media(id, payload).await?;
            output::print_json(&media, &output)
        }
        MediaCommand::Move { id, json } => {
            validate_resource_id(id)?;
            let payload: MoveOwner = serde_json::from_str(json)?;
            if dry_run {
                output::print_json(
                    &serde_json::json!({
                        "method": "POST",
                        "path": format!("api/v1/media/{id}/move"),
                        "body": payload,
                    }),
                    &output,
                )?;
                return Ok(());
            }
            let media = client.move_media(id, payload).await?;
            output::print_json(&media, &output)
        }
        MediaCommand::Duplicate { id, json } => {
            validate_resource_id(id)?;
            let payload = match json {
                Some(json) => serde_json::from_str::<DuplicateMedia>(json)?,
                None => DuplicateMedia::default(),
            };
            if dry_run {
                output::print_json(
                    &serde_json::json!({
                        "method": "POST",
                        "path": format!("api/v1/media/{id}/duplicate"),
                        "body": payload,
                    }),
                    &output,
                )?;
                return Ok(());
            }
            let media = client.duplicate_media(id, payload).await?;
            output::print_json(&media, &output)
        }
        MediaCommand::Delete { id } => {
            validate_resource_id(id)?;
            if dry_run {
                output::print_json(
                    &serde_json::json!({
                        "method": "DELETE",
                        "path": format!("api/v1/media/{id}"),
                    }),
                    &output,
                )?;
                return Ok(());
            }
            client.delete_media(id).await?;
            output::print_json(&serde_json::json!({"deleted": true}), &output)
        }
        MediaCommand::UploadAsset {
            id,
            file,
            kind,
            replace_page,
            content_type,
        } => {
            validate_resource_id(id)?;
            let kind_value = MediaAssetKind::parse(kind)
                .ok_or("--kind must be video, audio, image, pdf, or svg")?;
            if let Some(page) = replace_page {
                validate_resource_id(page)?;
            }
            let content_type = media_content_type_for_path(file, content_type.as_deref())?;
            let mut query = format!("kind={}", kind_value.as_str());
            if let Some(page) = replace_page {
                query.push_str("&replace_page=");
                query.push_str(&encode_query_value(page));
            }
            if dry_run {
                output::print_json(
                    &serde_json::json!({
                        "method": "PUT",
                        "path": format!("api/v1/media/{id}/uploads?{query}"),
                        "content_type": content_type,
                        "file": file,
                    }),
                    &output,
                )?;
                return Ok(());
            }
            let media = upload_media_asset_file(session, id, &query, &content_type, file).await?;
            output::print_json(&media, &output)
        }
        MediaCommand::DeckBegin { id } => {
            validate_resource_id(id)?;
            if dry_run {
                output::print_json(
                    &serde_json::json!({
                        "method": "POST",
                        "path": format!("api/v1/media/{id}/deck/revisions"),
                        "body": {},
                    }),
                    &output,
                )?;
                return Ok(());
            }
            let media = client.begin_media_deck_revision(id).await?;
            output::print_json(&media, &output)
        }
        MediaCommand::DeckCommit { id, json } => {
            validate_resource_id(id)?;
            let payload: CommitDeck = serde_json::from_str(json)?;
            if dry_run {
                output::print_json(
                    &serde_json::json!({
                        "method": "POST",
                        "path": format!("api/v1/media/{id}/deck/commit"),
                        "body": payload,
                    }),
                    &output,
                )?;
                return Ok(());
            }
            let media = client.commit_media_deck(id, payload).await?;
            output::print_json(&media, &output)
        }
        MediaCommand::DownloadAsset {
            media_id,
            asset_id,
            output: path,
            range,
        } => {
            validate_resource_id(media_id)?;
            validate_resource_id(asset_id)?;
            let details = download_media_asset(
                session,
                media_id,
                asset_id,
                path.as_deref(),
                range.as_deref(),
            )
            .await?;
            if let Some(path) = path {
                let mut details = details;
                details["output"] = serde_json::Value::String(path.display().to_string());
                output::print_json(&details, &output)
            } else {
                Ok(())
            }
        }
        MediaCommand::HeadAsset {
            media_id,
            asset_id,
            range,
        } => {
            validate_resource_id(media_id)?;
            validate_resource_id(asset_id)?;
            let details = head_media_asset(session, media_id, asset_id, range.as_deref()).await?;
            output::print_json(&details, &output)
        }
    }
}
