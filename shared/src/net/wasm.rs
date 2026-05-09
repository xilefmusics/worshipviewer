use serde::de::DeserializeOwned;
use serde::Serialize;
use wasm_bindgen::JsValue;

use super::{HttpClient, HttpClientConfig};
use crate::error::NetworkClientError;
use js_sys::Uint8Array;
use web_sys::RequestCredentials;

#[derive(Clone)]
pub struct WasmHttpClient {
    config: HttpClientConfig,
}

impl WasmHttpClient {
    pub fn new(config: HttpClientConfig) -> Self {
        Self { config }
    }

    fn make_url(&self, path: &str) -> String {
        let base = self.config.base_url.trim_end_matches('/');
        let path = path.trim_start_matches('/');
        format!("{base}/{path}")
    }

    fn with_client(
        &self,
        request: gloo_net::http::RequestBuilder,
    ) -> gloo_net::http::RequestBuilder {
        if let Some(ref id) = self.config.client_ident {
            request.header("X-Worship-Client", id)
        } else {
            request
        }
    }
}

#[async_trait::async_trait(?Send)]
impl HttpClient for WasmHttpClient {
    async fn get<T>(&self, path: &str) -> Result<T, NetworkClientError>
    where
        T: DeserializeOwned + Send + 'static,
    {
        let url = self.make_url(path);

        let response = self
            .with_client(gloo_net::http::Request::get(&url))
            .credentials(RequestCredentials::Include)
            .send()
            .await?;
        let status = response.status();
        let text = response.text().await.unwrap_or_default();

        if !(200..300).contains(&status) {
            return Err(NetworkClientError::RequestFailed {
                status: Some(status as u16),
                message: text,
            });
        }

        let value = serde_json::from_str::<T>(&text)?;
        Ok(value)
    }

    async fn post<B, T>(&self, path: &str, body: &B) -> Result<T, NetworkClientError>
    where
        B: Serialize + Send + Sync,
        T: DeserializeOwned + Send + 'static,
    {
        let url = self.make_url(path);

        let payload = serde_json::to_string(body)?;
        let response = self
            .with_client(
                gloo_net::http::Request::post(&url).header("Content-Type", "application/json"),
            )
            .credentials(RequestCredentials::Include)
            .body(payload)?
            .send()
            .await?;

        let status = response.status();
        let text = response.text().await.unwrap_or_default();

        if !(200..300).contains(&status) {
            return Err(NetworkClientError::RequestFailed {
                status: Some(status as u16),
                message: text,
            });
        }

        let value = serde_json::from_str::<T>(&text)?;
        Ok(value)
    }

    async fn put<B, T>(&self, path: &str, body: &B) -> Result<T, NetworkClientError>
    where
        B: Serialize + Send + Sync,
        T: DeserializeOwned + Send + 'static,
    {
        let url = self.make_url(path);

        let payload = serde_json::to_string(body)?;
        let response = self
            .with_client(
                gloo_net::http::Request::put(&url).header("Content-Type", "application/json"),
            )
            .credentials(RequestCredentials::Include)
            .body(payload)?
            .send()
            .await?;

        let status = response.status();
        let text = response.text().await.unwrap_or_default();

        if !(200..300).contains(&status) {
            return Err(NetworkClientError::RequestFailed {
                status: Some(status as u16),
                message: text,
            });
        }

        let value = serde_json::from_str::<T>(&text)?;
        Ok(value)
    }

    async fn patch<B, T>(&self, path: &str, body: &B) -> Result<T, NetworkClientError>
    where
        B: Serialize + Send + Sync,
        T: DeserializeOwned + Send + 'static,
    {
        let url = self.make_url(path);

        let payload = serde_json::to_string(body)?;
        let response = self
            .with_client(
                gloo_net::http::Request::patch(&url).header("Content-Type", "application/json"),
            )
            .credentials(RequestCredentials::Include)
            .body(payload)?
            .send()
            .await?;

        let status = response.status();
        let text = response.text().await.unwrap_or_default();

        if !(200..300).contains(&status) {
            return Err(NetworkClientError::RequestFailed {
                status: Some(status as u16),
                message: text,
            });
        }

        let value = serde_json::from_str::<T>(&text)?;
        Ok(value)
    }

    async fn post_no_response<B>(&self, path: &str, body: &B) -> Result<(), NetworkClientError>
    where
        B: Serialize + Send + Sync,
    {
        let url = self.make_url(path);

        let payload = serde_json::to_string(body)?;
        let response = self
            .with_client(
                gloo_net::http::Request::post(&url).header("Content-Type", "application/json"),
            )
            .credentials(RequestCredentials::Include)
            .body(payload)?
            .send()
            .await?;

        let status = response.status();
        if !(200..300).contains(&status) {
            let text = response.text().await.unwrap_or_default();
            return Err(NetworkClientError::RequestFailed {
                status: Some(status as u16),
                message: text,
            });
        }

        Ok(())
    }

    async fn delete<T>(&self, path: &str) -> Result<T, NetworkClientError>
    where
        T: DeserializeOwned + Send + 'static,
    {
        let url = self.make_url(path);

        let response = self
            .with_client(gloo_net::http::Request::delete(&url))
            .credentials(RequestCredentials::Include)
            .send()
            .await?;
        let status = response.status();
        let text = response.text().await.unwrap_or_default();

        if !(200..300).contains(&status) {
            return Err(NetworkClientError::RequestFailed {
                status: Some(status as u16),
                message: text,
            });
        }

        let value = serde_json::from_str::<T>(&text)?;
        Ok(value)
    }

    async fn delete_no_content(&self, path: &str) -> Result<(), NetworkClientError> {
        let url = self.make_url(path);

        let response = self
            .with_client(gloo_net::http::Request::delete(&url))
            .credentials(RequestCredentials::Include)
            .send()
            .await?;
        let status = response.status();

        if !(200..300).contains(&status) {
            let text = response.text().await.unwrap_or_default();
            return Err(NetworkClientError::RequestFailed {
                status: Some(status as u16),
                message: text,
            });
        }

        Ok(())
    }

    async fn put_no_content(&self, path: &str) -> Result<(), NetworkClientError> {
        let url = self.make_url(path);

        let response = self
            .with_client(gloo_net::http::Request::put(&url))
            .credentials(RequestCredentials::Include)
            .send()
            .await?;
        let status = response.status();

        if !(200..300).contains(&status) {
            let text = response.text().await.unwrap_or_default();
            return Err(NetworkClientError::RequestFailed {
                status: Some(status as u16),
                message: text,
            });
        }

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

        let buf = Uint8Array::new_with_length(body.len() as u32);
        buf.copy_from(body);

        let response = self
            .with_client(gloo_net::http::Request::put(&url).header("Content-Type", content_type))
            .credentials(RequestCredentials::Include)
            .body(JsValue::from(buf))?
            .send()
            .await?;

        let status = response.status();
        let text = response.text().await.unwrap_or_default();

        if !(200..300).contains(&status) {
            return Err(NetworkClientError::RequestFailed {
                status: Some(status as u16),
                message: text,
            });
        }

        let value = serde_json::from_str::<T>(&text)?;
        Ok(value)
    }

    async fn put_bytes_no_content(
        &self,
        path: &str,
        content_type: &str,
        body: &[u8],
    ) -> Result<(), NetworkClientError> {
        let url = self.make_url(path);

        let buf = Uint8Array::new_with_length(body.len() as u32);
        buf.copy_from(body);

        let response = self
            .with_client(gloo_net::http::Request::put(&url).header("Content-Type", content_type))
            .credentials(RequestCredentials::Include)
            .body(JsValue::from(buf))?
            .send()
            .await?;

        let status = response.status();

        if !(200..300).contains(&status) {
            let text = response.text().await.unwrap_or_default();
            return Err(NetworkClientError::RequestFailed {
                status: Some(status as u16),
                message: text,
            });
        }

        Ok(())
    }

    async fn get_bytes(&self, path: &str) -> Result<Vec<u8>, NetworkClientError> {
        let url = self.make_url(path);

        let response = self
            .with_client(gloo_net::http::Request::get(&url))
            .credentials(RequestCredentials::Include)
            .send()
            .await?;

        let status = response.status();

        if !(200..300).contains(&status) {
            let text = response.text().await.unwrap_or_default();
            return Err(NetworkClientError::RequestFailed {
                status: Some(status as u16),
                message: text,
            });
        }

        let buf: Vec<u8> =
            response
                .binary()
                .await
                .map_err(|e| NetworkClientError::RequestFailed {
                    status: Some(status as u16),
                    message: e.to_string(),
                })?;
        Ok(buf)
    }
}
