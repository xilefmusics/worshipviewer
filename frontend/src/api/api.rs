use yew_router::prelude::Navigator;

use shared::auth::otp::{OtpRequest, OtpVerify};
use shared::blob::Blob;
use shared::blob::{CreateBlob, UpdateBlob};
use shared::collection::Collection;
use shared::collection::{CreateCollection, UpdateCollection};
use shared::error::NetworkClientError;
use shared::net::{DefaultHttpClient, HttpClientConfig};
use shared::player::Player;
use shared::setlist::Setlist;
use shared::setlist::{CreateSetlist, UpdateSetlist};
use shared::song::Song;
use shared::song::{CreateSong, UpdateSong};
use shared::user::{CreateUser, SessionBody, User};

use super::error::{ApiError, OperationType};
use crate::route::Route;
use shared::api::{ApiClient, ListQuery, SongListQuery};

use std::rc::Rc;

/// `X-Worship-Client` value: `worshipviewer-frontend/<version>`, matching the backend
/// `GET /api/v1/about` build metadata: git SHA if `GIT_COMMIT_SHA` was set at compile time,
/// else `CARGO_PKG_VERSION` from this crate.
fn worshipviewer_frontend_client_ident() -> String {
    format!(
        "worshipviewer-frontend/{}",
        option_env!("GIT_COMMIT_SHA").unwrap_or(env!("CARGO_PKG_VERSION"))
    )
}

#[derive(Clone)]
pub struct Api {
    client: Rc<ApiClient<DefaultHttpClient>>,
    navigator: Navigator,
}

impl PartialEq for Api {
    fn eq(&self, other: &Self) -> bool {
        Rc::ptr_eq(&self.client, &other.client)
    }
}

impl Api {
    pub fn new(navigator: Navigator, base_url: String) -> Self {
        let config = HttpClientConfig {
            base_url,
            timeout: None,
            session_cookie: None,
            bearer_token: None,
            client_ident: Some(worshipviewer_frontend_client_ident()),
        };
        let client = Rc::new(ApiClient::with_default(config));

        Self { client, navigator }
    }

    fn handle_error(&self, err: NetworkClientError) -> ApiError {
        let api_error: ApiError = err.into();
        match api_error {
            ApiError::Unauthorized(msg) => {
                self.route_logout();
                ApiError::Unauthorized(msg)
            }
            other => other,
        }
    }

    pub fn route_login(&self) {
        self.navigator.push(&Route::Login);
    }

    pub fn route_logout(&self) {
        self.navigator.push(&Route::Logout);
    }

    pub fn route_index(&self) {
        self.navigator.push(&Route::Index);
    }

    #[allow(dead_code)]
    pub async fn request_otp(&self, email: String) -> Result<(), ApiError> {
        ApiError::check_and_notify_offline(OperationType::Write);
        self.client
            .request_otp(OtpRequest { email })
            .await
            .map_err(|e| self.handle_error(e))
    }

    #[allow(dead_code)]
    pub async fn verify_otp(&self, email: String, code: String) -> Result<SessionBody, ApiError> {
        ApiError::check_and_notify_offline(OperationType::Write);
        self.client
            .verify_otp(OtpVerify { email, code })
            .await
            .map_err(|e| self.handle_error(e))
    }

    #[allow(dead_code)]
    pub fn auth_login_url(&self, provider: Option<&str>) -> String {
        match provider {
            Some(provider) if !provider.is_empty() => {
                format!("/auth/login?provider={}", provider)
            }
            _ => "/auth/login".into(),
        }
    }

    pub async fn logout(&self) -> Result<(), ApiError> {
        ApiError::check_and_notify_offline(OperationType::Write);
        self.client.logout().await.map_err(|e| self.handle_error(e))
    }

    #[allow(dead_code)]
    pub async fn get_users(&self) -> Result<Vec<User>, ApiError> {
        ApiError::check_and_notify_offline(OperationType::Read);
        self.client
            .list_users(ListQuery::default())
            .await
            .map_err(|e| self.handle_error(e))
    }

    #[allow(dead_code)]
    pub async fn get_user(&self, id: &str) -> Result<User, ApiError> {
        ApiError::check_and_notify_offline(OperationType::Read);
        self.client
            .get_user(id)
            .await
            .map_err(|e| self.handle_error(e))
    }

    #[allow(dead_code)]
    pub async fn create_user(&self, payload: &CreateUser) -> Result<User, ApiError> {
        ApiError::check_and_notify_offline(OperationType::Write);
        self.client
            .create_user(payload.clone())
            .await
            .map_err(|e| self.handle_error(e))
    }

    #[allow(dead_code)]
    pub async fn delete_user(&self, id: &str) -> Result<(), ApiError> {
        ApiError::check_and_notify_offline(OperationType::Write);
        self.client
            .delete_user(id)
            .await
            .map_err(|e| self.handle_error(e))
    }

    #[allow(dead_code)]
    pub async fn get_users_me(&self) -> Result<User, ApiError> {
        ApiError::check_and_notify_offline(OperationType::Read);
        self.client
            .get_current_user()
            .await
            .map_err(|e| self.handle_error(e))
    }

    pub async fn upload_profile_picture(
        &self,
        content_type: &str,
        body: &[u8],
    ) -> Result<User, ApiError> {
        ApiError::check_and_notify_offline(OperationType::Write);
        self.client
            .upload_profile_picture(content_type, body)
            .await
            .map_err(|e| self.handle_error(e))
    }

    pub async fn delete_uploaded_profile_picture(&self) -> Result<User, ApiError> {
        ApiError::check_and_notify_offline(OperationType::Write);
        self.client
            .delete_profile_picture()
            .await
            .map_err(|e| self.handle_error(e))
    }

    #[allow(dead_code)]
    pub async fn get_sessions_for_current_user(&self) -> Result<Vec<SessionBody>, ApiError> {
        ApiError::check_and_notify_offline(OperationType::Read);
        self.client
            .list_my_sessions(ListQuery::default())
            .await
            .map_err(|e| self.handle_error(e))
    }

    #[allow(dead_code)]
    pub async fn get_session_for_current_user(&self, id: &str) -> Result<SessionBody, ApiError> {
        ApiError::check_and_notify_offline(OperationType::Read);
        self.client
            .get_my_session(id)
            .await
            .map_err(|e| self.handle_error(e))
    }

    #[allow(dead_code)]
    pub async fn get_current_session(&self) -> Result<SessionBody, ApiError> {
        ApiError::check_and_notify_offline(OperationType::Read);
        self.client
            .get_my_current_session()
            .await
            .map_err(|e| self.handle_error(e))
    }

    #[allow(dead_code)]
    pub async fn delete_session_for_current_user(&self, id: &str) -> Result<(), ApiError> {
        ApiError::check_and_notify_offline(OperationType::Write);
        self.client
            .delete_my_session(id)
            .await
            .map_err(|e| self.handle_error(e))
    }

    #[allow(dead_code)]
    pub async fn get_sessions_for_user(&self, user_id: &str) -> Result<Vec<SessionBody>, ApiError> {
        ApiError::check_and_notify_offline(OperationType::Read);
        self.client
            .list_sessions_for_user(user_id, ListQuery::default())
            .await
            .map_err(|e| self.handle_error(e))
    }

    #[allow(dead_code)]
    pub async fn get_session_for_user(
        &self,
        user_id: &str,
        id: &str,
    ) -> Result<SessionBody, ApiError> {
        ApiError::check_and_notify_offline(OperationType::Read);
        self.client
            .get_session_for_user(user_id, id)
            .await
            .map_err(|e| self.handle_error(e))
    }

    #[allow(dead_code)]
    pub async fn create_session_for_user(&self, user_id: &str) -> Result<SessionBody, ApiError> {
        ApiError::check_and_notify_offline(OperationType::Write);
        self.client
            .create_session_for_user(user_id)
            .await
            .map_err(|e| self.handle_error(e))
    }

    #[allow(dead_code)]
    pub async fn delete_session_for_user(&self, user_id: &str, id: &str) -> Result<(), ApiError> {
        ApiError::check_and_notify_offline(OperationType::Write);
        self.client
            .delete_session_for_user(user_id, id)
            .await
            .map_err(|e| self.handle_error(e))
    }

    #[allow(dead_code)]
    pub async fn get_songs(&self) -> Result<Vec<Song>, ApiError> {
        ApiError::check_and_notify_offline(OperationType::Read);
        self.client
            .get_songs(ListQuery::default().into())
            .await
            .map_err(|e| self.handle_error(e))
    }

    pub async fn get_songs_query(&self, query: SongListQuery) -> Result<Vec<Song>, ApiError> {
        ApiError::check_and_notify_offline(OperationType::Read);
        self.client
            .get_songs(query)
            .await
            .map_err(|e| self.handle_error(e))
    }

    #[allow(dead_code)]
    pub async fn get_song(&self, id: &str) -> Result<Song, ApiError> {
        ApiError::check_and_notify_offline(OperationType::Read);
        self.client
            .get_song(id)
            .await
            .map_err(|e| self.handle_error(e))
    }

    #[allow(dead_code)]
    pub async fn get_song_player(&self, id: &str) -> Result<Player, ApiError> {
        ApiError::check_and_notify_offline(OperationType::Read);
        self.client
            .get_song_player(id)
            .await
            .map_err(|e| self.handle_error(e))
    }

    #[allow(dead_code)]
    #[allow(dead_code)]
    pub async fn create_song(&self, payload: &CreateSong) -> Result<Song, ApiError> {
        ApiError::check_and_notify_offline(OperationType::Write);
        self.client
            .create_song(payload.clone())
            .await
            .map_err(|e| self.handle_error(e))
    }

    #[allow(dead_code)]
    pub async fn update_song(&self, id: &str, payload: &UpdateSong) -> Result<Song, ApiError> {
        ApiError::check_and_notify_offline(OperationType::Write);
        self.client
            .update_song(id, payload.clone())
            .await
            .map_err(|e| self.handle_error(e))
    }

    #[allow(dead_code)]
    pub async fn delete_song(&self, id: &str) -> Result<(), ApiError> {
        ApiError::check_and_notify_offline(OperationType::Write);
        self.client
            .delete_song(id)
            .await
            .map_err(|e| self.handle_error(e))
    }

    #[allow(dead_code)]
    pub async fn get_song_like_status(&self, id: &str) -> Result<bool, ApiError> {
        ApiError::check_and_notify_offline(OperationType::Read);
        self.client
            .get_song_like_status(id)
            .await
            .map_err(|e| self.handle_error(e))
    }

    #[allow(dead_code)]
    pub async fn update_song_like_status(&self, id: &str, liked: bool) -> Result<(), ApiError> {
        ApiError::check_and_notify_offline(OperationType::Write);
        self.client
            .update_song_like_status(id, liked)
            .await
            .map_err(|e| self.handle_error(e))
    }

    #[allow(dead_code)]
    pub async fn get_collections(&self) -> Result<Vec<Collection>, ApiError> {
        ApiError::check_and_notify_offline(OperationType::Read);
        self.client
            .list_collections(ListQuery::default())
            .await
            .map_err(|e| self.handle_error(e))
    }

    #[allow(dead_code)]
    pub async fn get_collection(&self, id: &str) -> Result<Collection, ApiError> {
        ApiError::check_and_notify_offline(OperationType::Read);
        self.client
            .get_collection(id)
            .await
            .map_err(|e| self.handle_error(e))
    }

    #[allow(dead_code)]
    pub async fn get_collection_songs(&self, id: &str) -> Result<Vec<Song>, ApiError> {
        ApiError::check_and_notify_offline(OperationType::Read);
        self.client
            .get_collection_songs(id, ListQuery::default())
            .await
            .map_err(|e| self.handle_error(e))
    }

    #[allow(dead_code)]
    pub async fn get_collection_player(&self, id: &str) -> Result<Player, ApiError> {
        ApiError::check_and_notify_offline(OperationType::Read);
        self.client
            .get_collection_player(id)
            .await
            .map_err(|e| self.handle_error(e))
    }

    #[allow(dead_code)]
    pub async fn create_collection(
        &self,
        payload: &CreateCollection,
    ) -> Result<Collection, ApiError> {
        ApiError::check_and_notify_offline(OperationType::Write);
        self.client
            .create_collection(payload.clone())
            .await
            .map_err(|e| self.handle_error(e))
    }

    #[allow(dead_code)]
    pub async fn update_collection(
        &self,
        id: &str,
        payload: &UpdateCollection,
    ) -> Result<Collection, ApiError> {
        ApiError::check_and_notify_offline(OperationType::Write);
        self.client
            .update_collection(id, payload.clone())
            .await
            .map_err(|e| self.handle_error(e))
    }

    #[allow(dead_code)]
    pub async fn delete_collection(&self, id: &str) -> Result<(), ApiError> {
        ApiError::check_and_notify_offline(OperationType::Write);
        self.client
            .delete_collection(id)
            .await
            .map_err(|e| self.handle_error(e))
    }

    #[allow(dead_code)]
    pub async fn get_setlists(&self) -> Result<Vec<Setlist>, ApiError> {
        ApiError::check_and_notify_offline(OperationType::Read);
        self.client
            .list_setlists(ListQuery::default())
            .await
            .map_err(|e| self.handle_error(e))
    }

    #[allow(dead_code)]
    pub async fn get_setlist(&self, id: &str) -> Result<Setlist, ApiError> {
        ApiError::check_and_notify_offline(OperationType::Read);
        self.client
            .get_setlist(id)
            .await
            .map_err(|e| self.handle_error(e))
    }

    #[allow(dead_code)]
    pub async fn get_setlist_songs(&self, id: &str) -> Result<Vec<Song>, ApiError> {
        ApiError::check_and_notify_offline(OperationType::Read);
        self.client
            .get_setlist_songs(id, ListQuery::default())
            .await
            .map_err(|e| self.handle_error(e))
    }

    #[allow(dead_code)]
    pub async fn get_setlist_player(&self, id: &str) -> Result<Player, ApiError> {
        ApiError::check_and_notify_offline(OperationType::Read);
        self.client
            .get_setlist_player(id)
            .await
            .map_err(|e| self.handle_error(e))
    }

    #[allow(dead_code)]
    pub async fn create_setlist(&self, payload: &CreateSetlist) -> Result<Setlist, ApiError> {
        ApiError::check_and_notify_offline(OperationType::Write);
        self.client
            .create_setlist(payload.clone())
            .await
            .map_err(|e| self.handle_error(e))
    }

    #[allow(dead_code)]
    pub async fn update_setlist(
        &self,
        id: &str,
        payload: &UpdateSetlist,
    ) -> Result<Setlist, ApiError> {
        ApiError::check_and_notify_offline(OperationType::Write);
        self.client
            .update_setlist(id, payload.clone())
            .await
            .map_err(|e| self.handle_error(e))
    }

    #[allow(dead_code)]
    pub async fn delete_setlist(&self, id: &str) -> Result<(), ApiError> {
        ApiError::check_and_notify_offline(OperationType::Write);
        self.client
            .delete_setlist(id)
            .await
            .map_err(|e| self.handle_error(e))
    }

    #[allow(dead_code)]
    pub async fn get_blobs(&self) -> Result<Vec<Blob>, ApiError> {
        ApiError::check_and_notify_offline(OperationType::Read);
        self.client
            .list_blobs(ListQuery::default())
            .await
            .map_err(|e| self.handle_error(e))
    }

    #[allow(dead_code)]
    pub async fn get_blob(&self, id: &str) -> Result<Blob, ApiError> {
        ApiError::check_and_notify_offline(OperationType::Read);
        self.client
            .get_blob(id)
            .await
            .map_err(|e| self.handle_error(e))
    }

    #[allow(dead_code)]
    pub async fn create_blob(&self, payload: &CreateBlob) -> Result<Blob, ApiError> {
        ApiError::check_and_notify_offline(OperationType::Write);
        self.client
            .create_blob(payload.clone())
            .await
            .map_err(|e| self.handle_error(e))
    }

    #[allow(dead_code)]
    pub async fn update_blob(&self, id: &str, payload: &UpdateBlob) -> Result<Blob, ApiError> {
        ApiError::check_and_notify_offline(OperationType::Write);
        self.client
            .update_blob(id, payload.clone())
            .await
            .map_err(|e| self.handle_error(e))
    }

    #[allow(dead_code)]
    pub async fn delete_blob(&self, id: &str) -> Result<(), ApiError> {
        ApiError::check_and_notify_offline(OperationType::Write);
        self.client
            .delete_blob(id)
            .await
            .map_err(|e| self.handle_error(e))
    }
}
