use std::time::Duration;

use serde::de::DeserializeOwned;
use serde::Serialize;

use crate::error::NetworkClientError;

#[derive(Clone, Debug)]
pub struct HttpClientConfig {
    pub base_url: String,
    pub timeout: Option<Duration>,
    /// Optional value for the `sso_session` cookie used by the backend.
    /// When set, the HTTP client should send a `Cookie: sso_session=<value>` header.
    pub session_cookie: Option<String>,
    /// Optional bearer token used for `Authorization: Bearer <token>` authentication.
    pub bearer_token: Option<String>,
    /// Value for the `X-Worship-Client` header (`<product>/<version>`, e.g. `worshipviewer-cli/0.1.0`).
    pub client_ident: Option<String>,
}

#[cfg(target_arch = "wasm32")]
#[async_trait::async_trait(?Send)]
pub trait HttpClient: Send + Sync {
    async fn get<T>(&self, path: &str) -> Result<T, NetworkClientError>
    where
        T: DeserializeOwned + Send + 'static;

    async fn post<B, T>(&self, path: &str, body: &B) -> Result<T, NetworkClientError>
    where
        B: Serialize + Send + Sync,
        T: DeserializeOwned + Send + 'static;

    async fn put<B, T>(&self, path: &str, body: &B) -> Result<T, NetworkClientError>
    where
        B: Serialize + Send + Sync,
        T: DeserializeOwned + Send + 'static;

    async fn patch<B, T>(&self, path: &str, body: &B) -> Result<T, NetworkClientError>
    where
        B: Serialize + Send + Sync,
        T: DeserializeOwned + Send + 'static;

    async fn post_no_response<B>(&self, path: &str, body: &B) -> Result<(), NetworkClientError>
    where
        B: Serialize + Send + Sync;

    async fn delete<T>(&self, path: &str) -> Result<T, NetworkClientError>
    where
        T: DeserializeOwned + Send + 'static;

    /// Send a DELETE request and treat `204 No Content` (empty body) as success.
    async fn delete_no_content(&self, path: &str) -> Result<(), NetworkClientError>;

    /// Send a PUT with no body and treat `204 No Content` as success.
    async fn put_no_content(&self, path: &str) -> Result<(), NetworkClientError>;

    /// PUT raw bytes with the given `Content-Type` and parse a JSON response body.
    async fn put_bytes_json<T>(
        &self,
        path: &str,
        content_type: &str,
        body: &[u8],
    ) -> Result<T, NetworkClientError>
    where
        T: DeserializeOwned + Send + 'static;

    /// PUT raw bytes; treat a successful empty body (e.g. 204) as `Ok(())`.
    async fn put_bytes_no_content(
        &self,
        path: &str,
        content_type: &str,
        body: &[u8],
    ) -> Result<(), NetworkClientError>;

    /// GET raw response body as bytes (e.g. blob download).
    async fn get_bytes(&self, path: &str) -> Result<Vec<u8>, NetworkClientError>;
}

#[cfg(not(target_arch = "wasm32"))]
#[async_trait::async_trait]
pub trait HttpClient: Send + Sync {
    async fn get<T>(&self, path: &str) -> Result<T, NetworkClientError>
    where
        T: DeserializeOwned + Send + 'static;

    async fn post<B, T>(&self, path: &str, body: &B) -> Result<T, NetworkClientError>
    where
        B: Serialize + Send + Sync,
        T: DeserializeOwned + Send + 'static;

    async fn put<B, T>(&self, path: &str, body: &B) -> Result<T, NetworkClientError>
    where
        B: Serialize + Send + Sync,
        T: DeserializeOwned + Send + 'static;

    async fn patch<B, T>(&self, path: &str, body: &B) -> Result<T, NetworkClientError>
    where
        B: Serialize + Send + Sync,
        T: DeserializeOwned + Send + 'static;

    async fn post_no_response<B>(&self, path: &str, body: &B) -> Result<(), NetworkClientError>
    where
        B: Serialize + Send + Sync;

    async fn delete<T>(&self, path: &str) -> Result<T, NetworkClientError>
    where
        T: DeserializeOwned + Send + 'static;

    /// Send a DELETE request and treat `204 No Content` (empty body) as success.
    async fn delete_no_content(&self, path: &str) -> Result<(), NetworkClientError>;

    /// Send a PUT with no body and treat `204 No Content` as success.
    async fn put_no_content(&self, path: &str) -> Result<(), NetworkClientError>;

    /// PUT raw bytes with the given `Content-Type` and parse a JSON response body.
    async fn put_bytes_json<T>(
        &self,
        path: &str,
        content_type: &str,
        body: &[u8],
    ) -> Result<T, NetworkClientError>
    where
        T: DeserializeOwned + Send + 'static;

    /// PUT raw bytes; treat a successful empty body (e.g. 204) as `Ok(())`.
    async fn put_bytes_no_content(
        &self,
        path: &str,
        content_type: &str,
        body: &[u8],
    ) -> Result<(), NetworkClientError>;

    /// GET raw response body as bytes (e.g. blob download).
    async fn get_bytes(&self, path: &str) -> Result<Vec<u8>, NetworkClientError>;
}

#[cfg(all(feature = "cli", not(target_arch = "wasm32")))]
mod desktop;
#[cfg(all(feature = "cli", not(target_arch = "wasm32")))]
pub use desktop::DesktopHttpClient;

#[cfg(all(feature = "frontend", target_arch = "wasm32"))]
mod wasm;
#[cfg(all(feature = "frontend", target_arch = "wasm32"))]
pub use wasm::WasmHttpClient;

#[cfg(all(feature = "cli", not(target_arch = "wasm32")))]
pub type DefaultHttpClient = DesktopHttpClient;

#[cfg(all(feature = "frontend", target_arch = "wasm32"))]
pub type DefaultHttpClient = WasmHttpClient;
