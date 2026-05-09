use shared::api::ApiClient;
use shared::net::DefaultHttpClient;

use crate::output::OutputFormat;

pub async fn handle_about(
    client: &ApiClient<DefaultHttpClient>,
    output: OutputFormat,
) -> Result<(), Box<dyn std::error::Error>> {
    let about = client.get_about().await?;
    crate::output::print_json(&about, &output)?;
    Ok(())
}
