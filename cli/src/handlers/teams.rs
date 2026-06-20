use std::fs;

use shared::team::{CreateTeam, UpdateTeam};

use crate::commands::{TeamInvitationsCommand, TeamsCommand};
use crate::http_extra::upload_team_cover;
use crate::list_output::print_list;
use crate::output::{self, OutputFormat};
use crate::session::CliSession;
use crate::validate::{
    image_content_type_for_path, list_query_from_hub_args, page_query_from_page_args,
    validate_resource_id,
};

pub async fn handle_teams(
    session: &CliSession,
    output: OutputFormat,
    dry_run: bool,
    cmd: &TeamsCommand,
) -> Result<(), Box<dyn std::error::Error>> {
    let client = session.api();
    match cmd {
        TeamsCommand::List { list } => {
            let query = list_query_from_hub_args(list)?;
            print_list(
                session,
                "api/v1/teams",
                &query.to_query_string(),
                list.page.with_meta,
                &output,
                || async { client.list_teams(query.clone()).await },
            )
            .await
        }
        TeamsCommand::Invitations { command } => {
            handle_team_invitations(client, output.clone(), dry_run, command).await
        }
        TeamsCommand::Get { id } => {
            validate_resource_id(id)?;
            let team = client.get_team(id).await?;
            output::print_json(&team, &output)
        }
        TeamsCommand::Create { json } => {
            let payload: CreateTeam = serde_json::from_str(json)?;
            if dry_run {
                let planned = serde_json::json!({
                    "method": "POST",
                    "path": "api/v1/teams",
                    "body": payload,
                });
                output::print_json(&planned, &output)?;
                return Ok(());
            }
            let team = client.create_team(payload).await?;
            output::print_json(&team, &output)
        }
        TeamsCommand::Update { id, json } => {
            validate_resource_id(id)?;
            let payload: UpdateTeam = serde_json::from_str(json)?;
            if dry_run {
                let planned = serde_json::json!({
                    "method": "PUT",
                    "path": format!("api/v1/teams/{id}"),
                    "body": payload,
                });
                output::print_json(&planned, &output)?;
                return Ok(());
            }
            let team = client.update_team(id, payload).await?;
            output::print_json(&team, &output)
        }
        TeamsCommand::Patch { id, json } => {
            validate_resource_id(id)?;
            let payload: serde_json::Value = serde_json::from_str(json)?;
            if dry_run {
                let planned = serde_json::json!({
                    "method": "PATCH",
                    "path": format!("api/v1/teams/{id}"),
                    "body": payload,
                });
                output::print_json(&planned, &output)?;
                return Ok(());
            }
            let team = client.patch_team(id, payload).await?;
            output::print_json(&team, &output)
        }
        TeamsCommand::Delete { id } => {
            validate_resource_id(id)?;
            if dry_run {
                let planned = serde_json::json!({
                    "method": "DELETE",
                    "path": format!("api/v1/teams/{id}"),
                });
                output::print_json(&planned, &output)?;
                return Ok(());
            }
            client.delete_team(id).await?;
            output::print_json(&serde_json::json!({"deleted": true}), &output)
        }
        TeamsCommand::CoverPut {
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
                    "path": format!("api/v1/teams/{id}/cover"),
                    "content_type": ct,
                    "body_len": body.len(),
                });
                output::print_json(&planned, &output)?;
                return Ok(());
            }
            let team = upload_team_cover(session.http(), id, &ct, &body).await?;
            output::print_json(&team, &output)
        }
    }
}

async fn handle_team_invitations(
    client: &shared::api::ApiClient<shared::net::DefaultHttpClient>,
    output: OutputFormat,
    dry_run: bool,
    cmd: &TeamInvitationsCommand,
) -> Result<(), Box<dyn std::error::Error>> {
    match cmd {
        TeamInvitationsCommand::List { team_id, page } => {
            validate_resource_id(team_id)?;
            let query = page_query_from_page_args(page)?;
            if dry_run {
                output::print_json(
                    &serde_json::json!({
                        "method": "GET",
                        "path": format!(
                            "api/v1/teams/{team_id}/invitations{}",
                            query.as_list_query().to_query_string()
                        ),
                    }),
                    &output,
                )?;
                return Ok(());
            }
            let items = client.list_team_invitations(team_id, query).await?;
            match output::effective_output_format(&output) {
                output::OutputFormat::Ndjson => output::print_ndjson_list(&items),
                _ => output::print_json(&items, &output),
            }
        }
        TeamInvitationsCommand::Create { team_id } => {
            validate_resource_id(team_id)?;
            if dry_run {
                output::print_json(
                    &serde_json::json!({
                        "method": "POST",
                        "path": format!("api/v1/teams/{team_id}/invitations"),
                        "body": {},
                    }),
                    &output,
                )?;
                return Ok(());
            }
            let inv = client.create_team_invitation(team_id).await?;
            output::print_json(&inv, &output)
        }
        TeamInvitationsCommand::Get {
            team_id,
            invitation_id,
        } => {
            validate_resource_id(team_id)?;
            validate_resource_id(invitation_id)?;
            let inv = client.get_team_invitation(team_id, invitation_id).await?;
            output::print_json(&inv, &output)
        }
        TeamInvitationsCommand::Delete {
            team_id,
            invitation_id,
        } => {
            validate_resource_id(team_id)?;
            validate_resource_id(invitation_id)?;
            if dry_run {
                output::print_json(
                    &serde_json::json!({
                        "method": "DELETE",
                        "path": format!(
                            "api/v1/teams/{team_id}/invitations/{invitation_id}"
                        ),
                    }),
                    &output,
                )?;
                return Ok(());
            }
            client
                .delete_team_invitation(team_id, invitation_id)
                .await?;
            output::print_json(&serde_json::json!({"deleted": true}), &output)
        }
        TeamInvitationsCommand::Accept {
            team_id,
            invitation_id,
        } => {
            validate_resource_id(team_id)?;
            validate_resource_id(invitation_id)?;
            if dry_run {
                output::print_json(
                    &serde_json::json!({
                        "method": "POST",
                        "path": format!(
                            "api/v1/teams/{team_id}/invitations/{invitation_id}/accept"
                        ),
                        "body": {},
                    }),
                    &output,
                )?;
                return Ok(());
            }
            let team = client
                .accept_team_invitation(team_id, invitation_id)
                .await?;
            output::print_json(&team, &output)
        }
        TeamInvitationsCommand::AcceptLegacy { invitation_id } => {
            validate_resource_id(invitation_id)?;
            if dry_run {
                output::print_json(
                    &serde_json::json!({
                        "method": "POST",
                        "path": format!(
                            "api/v1/invitations/{invitation_id}/accept"
                        ),
                        "body": {},
                    }),
                    &output,
                )?;
                return Ok(());
            }
            let team = client.accept_team_invitation_legacy(invitation_id).await?;
            output::print_json(&team, &output)
        }
    }
}
