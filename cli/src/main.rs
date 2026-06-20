use clap::Parser;

mod commands;
mod config;
mod handlers;
mod http_extra;
mod list_fetch;
mod list_output;
mod output;
mod session;
mod validate;

use crate::commands::Cli;
use crate::session::CliSession;

#[tokio::main]
async fn main() {
    if let Err(err) = run().await {
        eprintln!("{err}");
        std::process::exit(1);
    }
}

async fn run() -> Result<(), Box<dyn std::error::Error>> {
    let cli = Cli::parse();

    let options = config::BuildConfigOptions::from_cli(&cli);
    let session = CliSession::new(&options)?;

    handlers::dispatch(&session, &cli).await
}
