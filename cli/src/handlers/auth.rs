use shared::api::ApiClient;
use shared::auth::otp::{OtpRequest, OtpVerify};
use shared::net::DefaultHttpClient;

use crate::commands::AuthCommand;
use crate::output::{self, OutputFormat};

pub async fn handle_auth(
    client: &ApiClient<DefaultHttpClient>,
    output: OutputFormat,
    dry_run: bool,
    cmd: &AuthCommand,
) -> Result<(), Box<dyn std::error::Error>> {
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
    }
}
