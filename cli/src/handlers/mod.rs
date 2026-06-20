use crate::commands::{Cli, Command, SchemaCommand};
use crate::session::CliSession;

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

pub async fn dispatch(session: &CliSession, cli: &Cli) -> Result<(), Box<dyn std::error::Error>> {
    let client = session.api();
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
            users::handle_users(session, cli.output.clone(), cli.dry_run, command).await
        }
        Command::Sessions { command } => {
            sessions::handle_sessions(client, cli.output.clone(), cli.dry_run, command).await
        }
        Command::Songs { command } => {
            songs::handle_songs(session, cli.output.clone(), cli.dry_run, command).await
        }
        Command::Collections { command } => {
            collections::handle_collections(session, cli.output.clone(), cli.dry_run, command).await
        }
        Command::Setlists { command } => {
            setlists::handle_setlists(session, cli.output.clone(), cli.dry_run, command).await
        }
        Command::Blobs { command } => {
            blobs::handle_blobs(session, cli.output.clone(), cli.dry_run, command).await
        }
        Command::Teams { command } => {
            teams::handle_teams(session, cli.output.clone(), cli.dry_run, command).await
        }
        Command::Monitoring { command } => {
            monitoring::handle_monitoring(client, cli.output.clone(), cli.dry_run, command).await
        }
    }
}
