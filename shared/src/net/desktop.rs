use reqwest::Client;
use serde::de::DeserializeOwned;
use serde::Serialize;

use super::{HttpClient, HttpClientConfig};
use crate::error::NetworkClientError;

#[derive(Clone)]
pub struct DesktopHttpClient {
    client: Client,
    config: HttpClientConfig,
}

impl DesktopHttpClient {
    pub fn new(config: HttpClientConfig) -> Self {
        let mut builder = Client::builder();

        if let Some(timeout) = config.timeout {
            builder = builder.timeout(timeout);
        }

        let client = builder.build().expect("failed to build reqwest client");

        Self { client, config }
    }

    fn make_url(&self, path: &str) -> String {
        let base = self.config.base_url.trim_end_matches('/');
        let path = path.trim_start_matches('/');
        format!("{base}/{path}")
    }

    fn with_common_headers(&self, request: reqwest::RequestBuilder) -> reqwest::RequestBuilder {
        let mut request = request;
        if let Some(ref cookie) = self.config.session_cookie {
            request = request.header(reqwest::header::COOKIE, format!("sso_session={cookie}"));
        }
        if let Some(ref token) = self.config.bearer_token {
            request = request.bearer_auth(token);
        }
        if let Some(ref id) = self.config.client_ident {
            request = request.header("X-Worship-Client", id);
        }
        request
    }
}

#[async_trait::async_trait]
impl HttpClient for DesktopHttpClient {
    async fn get<T>(&self, path: &str) -> Result<T, NetworkClientError>
    where
        T: DeserializeOwned + Send + 'static,
    {
        let url = self.make_url(path);

        let request = self.with_common_headers(self.client.get(url));

        let response = request.send().await?;
        let response = response.error_for_status()?;
        let value = response.json::<T>().await?;

        Ok(value)
    }

    async fn post<B, T>(&self, path: &str, body: &B) -> Result<T, NetworkClientError>
    where
        B: Serialize + Send + Sync,
        T: DeserializeOwned + Send + 'static,
    {
        let url = self.make_url(path);

        let request = self.with_common_headers(self.client.post(url).json(body));

        let response = request.send().await?;
        let response = response.error_for_status()?;
        let value = response.json::<T>().await?;

        Ok(value)
    }

    async fn put<B, T>(&self, path: &str, body: &B) -> Result<T, NetworkClientError>
    where
        B: Serialize + Send + Sync,
        T: DeserializeOwned + Send + 'static,
    {
        let url = self.make_url(path);

        let request = self.with_common_headers(self.client.put(url).json(body));

        let response = request.send().await?;
        let response = response.error_for_status()?;
        let value = response.json::<T>().await?;

        Ok(value)
    }

    async fn patch<B, T>(&self, path: &str, body: &B) -> Result<T, NetworkClientError>
    where
        B: Serialize + Send + Sync,
        T: DeserializeOwned + Send + 'static,
    {
        let url = self.make_url(path);

        let request = self.with_common_headers(self.client.patch(url).json(body));

        let response = request.send().await?;
        let response = response.error_for_status()?;
        let value = response.json::<T>().await?;

        Ok(value)
    }

    async fn post_no_response<B>(&self, path: &str, body: &B) -> Result<(), NetworkClientError>
    where
        B: Serialize + Send + Sync,
    {
        let url = self.make_url(path);

        let request = self.with_common_headers(self.client.post(url).json(body));

        let response = request.send().await?;
        response.error_for_status()?;

        Ok(())
    }

    async fn delete<T>(&self, path: &str) -> Result<T, NetworkClientError>
    where
        T: DeserializeOwned + Send + 'static,
    {
        let url = self.make_url(path);

        let request = self.with_common_headers(self.client.delete(url));

        let response = request.send().await?;
        let response = response.error_for_status()?;
        let value = response.json::<T>().await?;

        Ok(value)
    }

    async fn delete_no_content(&self, path: &str) -> Result<(), NetworkClientError> {
        let url = self.make_url(path);

        let request = self.with_common_headers(self.client.delete(url));

        let response = request.send().await?;
        response.error_for_status()?;
        Ok(())
    }

    async fn put_no_content(&self, path: &str) -> Result<(), NetworkClientError> {
        let url = self.make_url(path);

        let request = self.with_common_headers(self.client.put(url));

        let response = request.send().await?;
        response.error_for_status()?;
        Ok(())
    }

    async fn put_bytes_json<T>(
        &self,
        path: &str,
        content_type: &str,
        body: &[u8],
    ) -> Result<T, NetworkClientError>
    where
        T: DeserializeOwned + Send + 'static,
    {
        let url = self.make_url(path);

        let request = self.with_common_headers(
            self.client
                .put(url)
                .header(reqwest::header::CONTENT_TYPE, content_type)
                .body(body.to_vec()),
        );

        let response = request.send().await?;
        let response = response.error_for_status()?;
        let value = response.json::<T>().await?;

        Ok(value)
    }

    async fn put_bytes_no_content(
        &self,
        path: &str,
        content_type: &str,
        body: &[u8],
    ) -> Result<(), NetworkClientError> {
        let url = self.make_url(path);

        let request = self.with_common_headers(
            self.client
                .put(url)
                .header(reqwest::header::CONTENT_TYPE, content_type)
                .body(body.to_vec()),
        );

        let response = request.send().await?;
        response.error_for_status()?;
        Ok(())
    }

    async fn get_bytes(&self, path: &str) -> Result<Vec<u8>, NetworkClientError> {
        let url = self.make_url(path);

        let request = self.with_common_headers(self.client.get(url));

        let response = request.send().await?;
        let response = response.error_for_status()?;
        let bytes = response.bytes().await?.to_vec();
        Ok(bytes)
    }
}
