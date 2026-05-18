use shared::api::ApiClient;
use shared::net::DefaultHttpClient;

use crate::commands::{Cli, Command, SchemaCommand};

mod about;
mod auth;
mod blobs;
mod collections;
mod monitoring;
mod schema;
mod sessions;
mod setlists;
mod songs;
mod teams;
mod users;

pub async fn dispatch(
    client: &ApiClient<DefaultHttpClient>,
    cli: &Cli,
    effective_base_url: &str,
) -> Result<(), Box<dyn std::error::Error>> {
    match &cli.command {
        Command::About => about::handle_about(client, cli.output.clone()).await,
        Command::Schema(args) => match &args.command {
            Some(SchemaCommand::Inspect { domain, action }) => {
                schema::handle_schema_inspect(client, cli.output.clone(), domain, action).await
            }
            None => {
                schema::handle_schema(client, cli.output.clone(), args.path_prefix.clone()).await
            }
        },
        Command::Auth { command } => {
            auth::handle_auth(client, cli.output.clone(), cli.dry_run, command).await
        }
        Command::Users { command } => {
            users::handle_users(client, cli.output.clone(), cli.dry_run, command).await
        }
        Command::Sessions { command } => {
            sessions::handle_sessions(client, cli.output.clone(), cli.dry_run, command).await
        }
        Command::Songs { command } => {
            songs::handle_songs(
                client,
                cli.output.clone(),
                cli.dry_run,
                effective_base_url,
                command,
            )
            .await
        }
        Command::Collections { command } => {
            collections::handle_collections(
                client,
                cli.output.clone(),
                cli.dry_run,
                effective_base_url,
                command,
            )
            .await
        }
        Command::Setlists { command } => {
            setlists::handle_setlists(
                client,
                cli.output.clone(),
                cli.dry_run,
                effective_base_url,
                command,
            )
            .await
        }
        Command::Blobs { command } => {
            blobs::handle_blobs(
                client,
                cli.output.clone(),
                cli.dry_run,
                effective_base_url,
                command,
            )
            .await
        }
        Command::Teams { command } => {
            teams::handle_teams(client, cli.output.clone(), cli.dry_run, command).await
        }
        Command::Monitoring { command } => {
            monitoring::handle_monitoring(client, cli.output.clone(), cli.dry_run, command).await
        }
    }
}
