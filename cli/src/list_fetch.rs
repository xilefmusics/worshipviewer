use reqwest::Client;
use serde::de::DeserializeOwned;

use shared::error::NetworkClientError;
use shared::net::HttpClientConfig;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ListPagination {
    pub total: Option<u64>,
    pub link: Option<String>,
}

pub async fn fetch_json_list<T: DeserializeOwned>(
    config: &HttpClientConfig,
    path_with_query: &str,
) -> Result<(Vec<T>, ListPagination), NetworkClientError> {
    let base = config.base_url.trim_end_matches('/');
    let path = path_with_query.trim_start_matches('/');
    let url = format!("{base}/{path}");

    let mut builder = Client::builder();
    if let Some(timeout) = config.timeout {
        builder = builder.timeout(timeout);
    }
    let client = builder
        .build()
        .map_err(|e| NetworkClientError::Unexpected {
            message: e.to_string(),
        })?;

    let mut req = client.get(&url);
    if let Some(ref cookie) = config.session_cookie {
        req = req.header(reqwest::header::COOKIE, format!("sso_session={cookie}"));
    }
    if let Some(ref token) = config.bearer_token {
        req = req.bearer_auth(token);
    }
    if let Some(ref id) = config.client_ident {
        req = req.header("X-Worship-Client", id);
    }

    let resp = req.send().await?;
    let resp = resp.error_for_status()?;

    let total = resp
        .headers()
        .get("x-total-count")
        .and_then(|v| v.to_str().ok())
        .and_then(|s| s.parse().ok());
    let link = resp
        .headers()
        .get("link")
        .and_then(|v| v.to_str().ok())
        .map(str::to_string);

    let items: Vec<T> = resp.json().await?;
    Ok((items, ListPagination { total, link }))
}
