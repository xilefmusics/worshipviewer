use std::fs;

use shared::user::CreateUser;

use crate::commands::UsersCommand;
use crate::list_output::print_list;
use crate::output::{self, OutputFormat};
use crate::session::CliSession;
use crate::validate::{
    image_content_type_for_path, list_query_from_page_args, validate_resource_id,
};

pub async fn handle_users(
    session: &CliSession,
    output: OutputFormat,
    dry_run: bool,
    cmd: &UsersCommand,
) -> Result<(), Box<dyn std::error::Error>> {
    let client = session.api();
    match cmd {
        UsersCommand::List { page } => {
            let query = list_query_from_page_args(page)?;
            print_list(
                session,
                "api/v1/users",
                &query.to_query_string(),
                page.with_meta,
                &output,
                || async { client.list_users(query.clone()).await },
            )
            .await
        }
        UsersCommand::Get { id } => {
            validate_resource_id(id)?;
            let user = client.get_user(id).await?;
            output::print_json(&user, &output)
        }
        UsersCommand::Me => {
            let user = client.get_current_user().await?;
            output::print_json(&user, &output)
        }
        UsersCommand::MeMetrics => {
            let m = client.get_users_me_metrics().await?;
            output::print_json(&m, &output)
        }
        UsersCommand::Metrics { id } => {
            validate_resource_id(id)?;
            let m = client.get_user_metrics(id).await?;
            output::print_json(&m, &output)
        }
        UsersCommand::ProfilePicturePut { file, content_type } => {
            let ct = image_content_type_for_path(file, content_type.as_deref())?;
            let body = fs::read(file)?;
            if dry_run {
                let planned = serde_json::json!({
                    "method": "PUT",
                    "path": "api/v1/users/me/profile-picture",
                    "content_type": ct,
                    "body_len": body.len(),
                });
                output::print_json(&planned, &output)?;
                return Ok(());
            }
            let user = client.upload_profile_picture(&ct, &body).await?;
            output::print_json(&user, &output)
        }
        UsersCommand::ProfilePictureDelete => {
            if dry_run {
                let planned = serde_json::json!({
                    "method": "DELETE",
                    "path": "api/v1/users/me/profile-picture",
                });
                output::print_json(&planned, &output)?;
                return Ok(());
            }
            let user = client.delete_profile_picture().await?;
            output::print_json(&user, &output)
        }
        UsersCommand::Create { json } => {
            let payload: CreateUser = serde_json::from_str(json)?;
            if dry_run {
                let planned = serde_json::json!({
                    "method": "POST",
                    "path": "api/v1/users",
                    "body": payload,
                });
                output::print_json(&planned, &output)?;
                return Ok(());
            }
            let user = client.create_user(payload).await?;
            output::print_json(&user, &output)
        }
        UsersCommand::Delete { id } => {
            validate_resource_id(id)?;
            if dry_run {
                let planned = serde_json::json!({
                    "method": "DELETE",
                    "path": format!("api/v1/users/{id}"),
                });
                output::print_json(&planned, &output)?;
                return Ok(());
            }
            client.delete_user(id).await?;
            output::print_json(&serde_json::json!({"deleted": true}), &output)
        }
    }
}
