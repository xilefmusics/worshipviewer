use clap::Parser;

use shared::api::ApiClient;
use shared::net::DefaultHttpClient;

mod commands;
mod config;
mod handlers;
mod output;
mod validate;

use crate::commands::Cli;

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
    let (client_config, effective_base_url) = config::build_http_client_config(&options)?;
    let client = ApiClient::<DefaultHttpClient>::with_default(client_config);

    handlers::dispatch(&client, &cli, &effective_base_url).await
}
