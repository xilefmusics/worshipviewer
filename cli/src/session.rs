use shared::api::ApiClient;
use shared::net::{DefaultHttpClient, HttpClientConfig};

use crate::config::{self, BuildConfigOptions};

/// Shared HTTP session: API wrapper plus a clone of the underlying client for
/// endpoints not yet exposed on [`ApiClient`].
pub struct CliSession {
    config: HttpClientConfig,
    api: ApiClient<DefaultHttpClient>,
    http: DefaultHttpClient,
}

impl CliSession {
    pub fn new(options: &BuildConfigOptions) -> Result<Self, Box<dyn std::error::Error>> {
        let (config, _) = config::build_http_client_config(options)?;
        let http = DefaultHttpClient::new(config.clone());
        let api = ApiClient::new(http.clone());
        Ok(Self { config, api, http })
    }

    pub fn api(&self) -> &ApiClient<DefaultHttpClient> {
        &self.api
    }

    pub fn http(&self) -> &DefaultHttpClient {
        &self.http
    }

    pub fn config(&self) -> &HttpClientConfig {
        &self.config
    }

    pub fn base_url(&self) -> &str {
        &self.config.base_url
    }
}
