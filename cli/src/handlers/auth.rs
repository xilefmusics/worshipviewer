use shared::api::ApiClient;
use shared::auth::otp::{OtpRequest, OtpVerify};
use shared::net::DefaultHttpClient;

use crate::commands::AuthCommand;
use crate::output::{self, OutputFormat};
use crate::session::CliSession;

pub async fn handle_auth(
    session: &CliSession,
    output: OutputFormat,
    dry_run: bool,
    cmd: &AuthCommand,
) -> Result<(), Box<dyn std::error::Error>> {
    let client: &ApiClient<DefaultHttpClient> = session.api();
    match cmd {
        AuthCommand::OtpRequest { json } => {
            let payload: OtpRequest = serde_json::from_str(json)?;
            if dry_run {
                let planned = serde_json::json!({
                    "method": "POST",
                    "path": "auth/otp/request",
                    "body": payload,
                });
                output::print_json(&planned, &output)?;
                return Ok(());
            }
            client.request_otp(payload).await?;
            output::print_json(&serde_json::json!({"status": "ok"}), &output)
        }
        AuthCommand::OtpVerify { json } => {
            let payload: OtpVerify = serde_json::from_str(json)?;
            if dry_run {
                let planned = serde_json::json!({
                    "method": "POST",
                    "path": "auth/otp/verify",
                    "body": payload,
                });
                output::print_json(&planned, &output)?;
                return Ok(());
            }
            let session = client.verify_otp(payload).await?;
            output::print_json(&session, &output)
        }
        AuthCommand::Logout => {
            if dry_run {
                let planned = serde_json::json!({
                    "method": "POST",
                    "path": "auth/logout",
                    "body": {},
                });
                output::print_json(&planned, &output)?;
                return Ok(());
            }
            client.logout().await?;
            output::print_json(&serde_json::json!({"status": "ok"}), &output)
        }
        AuthCommand::ImpersonationCurrent => {
            let status = client.get_impersonation_status().await?;
            output::print_json(&status, &output)
        }
        AuthCommand::ImpersonationStop => {
            if session.config().bearer_token.is_some() {
                return Err(
                    "browser impersonation requires cookie authentication; remove --bearer-token"
                        .into(),
                );
            }
            if dry_run {
                output::print_json(
                    &serde_json::json!({
                        "method": "POST",
                        "path": "auth/impersonation/stop",
                        "body": {},
                    }),
                    &output,
                )?;
                return Ok(());
            }
            client.stop_impersonation().await?;
            output::print_json(&serde_json::json!({"status": "stopped"}), &output)
        }
    }
}
