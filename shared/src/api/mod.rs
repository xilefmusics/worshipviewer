use crate::auth::otp::{OtpRequest, OtpVerify};
use crate::blob::{Blob, CreateBlob, UpdateBlob};
use crate::collection::{Collection, CreateCollection, UpdateCollection};
use crate::error::NetworkClientError;
use crate::like::LikeStatus;
use crate::monitoring::{HttpAuditLog, MonitoringMetricsQuery};
use crate::move_owner::MoveOwner;
use crate::net::HttpClient;
#[cfg(any(
    all(feature = "cli", not(target_arch = "wasm32")),
    all(feature = "frontend", target_arch = "wasm32")
))]
use crate::net::{DefaultHttpClient, HttpClientConfig};
use crate::player::Player;
use crate::setlist::{CreateSetlist, Setlist, UpdateSetlist};
use crate::song::{CreateSong, Song, UpdateSong};
use crate::team::{CreateTeam, Team, TeamInvitation, UpdateTeam};
use crate::user::{CreateUser, HttpAuditMetrics, SessionBody, User};
use crate::AboutResponse;
use std::vec::Vec;

mod list_query;
pub mod pagination_link;
mod song_list_query;

pub use list_query::{ListQuery, PageQuery, PAGE_SIZE_DEFAULT, PAGE_SIZE_MAX};
pub use pagination_link::pagination_link_header;
pub use song_list_query::{SongListQuery, SongSort};
pub struct ApiClient<C: HttpClient> {
    client: C,
}

impl<C: HttpClient> ApiClient<C> {
    pub fn new(client: C) -> Self {
        Self { client }
    }
}

#[cfg(any(
    all(feature = "cli", not(target_arch = "wasm32")),
    all(feature = "frontend", target_arch = "wasm32")
))]
impl ApiClient<DefaultHttpClient> {
    pub fn with_default(config: HttpClientConfig) -> Self {
        Self {
            client: DefaultHttpClient::new(config),
        }
    }
}

impl<C: HttpClient> ApiClient<C> {
    pub async fn request_otp(&self, payload: OtpRequest) -> Result<(), NetworkClientError> {
        self.client
            .post_no_response("auth/otp/request", &payload)
            .await
    }

    pub async fn verify_otp(&self, payload: OtpVerify) -> Result<SessionBody, NetworkClientError> {
        self.client.post("auth/otp/verify", &payload).await
    }

    pub async fn get_openapi_docs(&self) -> Result<serde_json::Value, NetworkClientError> {
        self.client.get("api/docs/openapi.json").await
    }

    pub async fn get_about(&self) -> Result<AboutResponse, NetworkClientError> {
        self.client.get("api/v1/about").await
    }

    pub async fn logout(&self) -> Result<(), NetworkClientError> {
        self.client
            .post_no_response("auth/logout", &serde_json::json!({}))
            .await
    }

    pub async fn get_current_user(&self) -> Result<User, NetworkClientError> {
        self.client.get("api/v1/users/me").await
    }

    pub async fn upload_profile_picture(
        &self,
        content_type: &str,
        body: &[u8],
    ) -> Result<User, NetworkClientError> {
        self.client
            .put_bytes_json("api/v1/users/me/profile-picture", content_type, body)
            .await
    }

    pub async fn delete_profile_picture(&self) -> Result<User, NetworkClientError> {
        self.client.delete("api/v1/users/me/profile-picture").await
    }

    pub async fn get_user(&self, id: &str) -> Result<User, NetworkClientError> {
        self.client.get(&format!("api/v1/users/{id}")).await
    }

    pub async fn list_users(&self, query: ListQuery) -> Result<Vec<User>, NetworkClientError> {
        let path = format!("api/v1/users{}", query.to_query_string());
        self.client.get(&path).await
    }

    pub async fn create_user(&self, payload: CreateUser) -> Result<User, NetworkClientError> {
        self.client.post("api/v1/users", &payload).await
    }

    pub async fn delete_user(&self, id: &str) -> Result<(), NetworkClientError> {
        self.client
            .delete_no_content(&format!("api/v1/users/{id}"))
            .await
    }

    pub async fn get_users_me_metrics(&self) -> Result<HttpAuditMetrics, NetworkClientError> {
        self.client.get("api/v1/users/me/metrics").await
    }

    pub async fn get_user_metrics(&self, id: &str) -> Result<HttpAuditMetrics, NetworkClientError> {
        self.client.get(&format!("api/v1/users/{id}/metrics")).await
    }

    pub async fn list_my_sessions(
        &self,
        query: ListQuery,
    ) -> Result<Vec<SessionBody>, NetworkClientError> {
        let path = append_query_param(
            format!("api/v1/users/me/sessions{}", query.to_query_string()),
            "expand",
            "user",
        );
        self.client.get(&path).await
    }

    pub async fn get_my_session(&self, id: &str) -> Result<SessionBody, NetworkClientError> {
        self.client
            .get(&append_query_param(
                format!("api/v1/users/me/sessions/{id}"),
                "expand",
                "user",
            ))
            .await
    }

    pub async fn get_my_current_session(&self) -> Result<SessionBody, NetworkClientError> {
        self.client
            .get(&append_query_param(
                "api/v1/users/me/sessions/current".to_string(),
                "expand",
                "user",
            ))
            .await
    }

    pub async fn delete_my_session(&self, id: &str) -> Result<(), NetworkClientError> {
        self.client
            .delete_no_content(&format!("api/v1/users/me/sessions/{id}"))
            .await
    }

    pub async fn create_session_for_user(
        &self,
        user_id: &str,
    ) -> Result<SessionBody, NetworkClientError> {
        self.client
            .post(
                &append_query_param(format!("api/v1/users/{user_id}/sessions"), "expand", "user"),
                &serde_json::json!({}),
            )
            .await
    }

    pub async fn list_sessions_for_user(
        &self,
        user_id: &str,
        query: ListQuery,
    ) -> Result<Vec<SessionBody>, NetworkClientError> {
        let path = append_query_param(
            format!("api/v1/users/{user_id}/sessions{}", query.to_query_string()),
            "expand",
            "user",
        );
        self.client.get(&path).await
    }

    pub async fn get_session_for_user(
        &self,
        user_id: &str,
        id: &str,
    ) -> Result<SessionBody, NetworkClientError> {
        self.client
            .get(&append_query_param(
                format!("api/v1/users/{user_id}/sessions/{id}"),
                "expand",
                "user",
            ))
            .await
    }

    pub async fn delete_session_for_user(
        &self,
        user_id: &str,
        id: &str,
    ) -> Result<(), NetworkClientError> {
        self.client
            .delete_no_content(&format!("api/v1/users/{user_id}/sessions/{id}"))
            .await
    }

    pub async fn get_current_session_metrics(
        &self,
    ) -> Result<HttpAuditMetrics, NetworkClientError> {
        self.client.get("api/v1/users/me/session/metrics").await
    }

    pub async fn get_session_for_current_user_metrics(
        &self,
        id: &str,
    ) -> Result<HttpAuditMetrics, NetworkClientError> {
        self.client
            .get(&format!("api/v1/users/me/sessions/{id}/metrics"))
            .await
    }

    pub async fn get_session_for_user_metrics(
        &self,
        user_id: &str,
        id: &str,
    ) -> Result<HttpAuditMetrics, NetworkClientError> {
        self.client
            .get(&format!("api/v1/users/{user_id}/sessions/{id}/metrics"))
            .await
    }

    pub async fn list_teams(&self, query: ListQuery) -> Result<Vec<Team>, NetworkClientError> {
        let path = format!("api/v1/teams{}", query.to_query_string());
        self.client.get(&path).await
    }

    pub async fn get_team(&self, id: &str) -> Result<Team, NetworkClientError> {
        self.client.get(&format!("api/v1/teams/{id}")).await
    }

    pub async fn create_team(&self, payload: CreateTeam) -> Result<Team, NetworkClientError> {
        self.client.post("api/v1/teams", &payload).await
    }

    pub async fn update_team(
        &self,
        id: &str,
        payload: UpdateTeam,
    ) -> Result<Team, NetworkClientError> {
        self.client
            .put(&format!("api/v1/teams/{id}"), &payload)
            .await
    }

    pub async fn delete_team(&self, id: &str) -> Result<(), NetworkClientError> {
        self.client
            .delete_no_content(&format!("api/v1/teams/{id}"))
            .await
    }

    pub async fn patch_team(
        &self,
        id: &str,
        payload: serde_json::Value,
    ) -> Result<Team, NetworkClientError> {
        self.client
            .patch(&format!("api/v1/teams/{id}"), &payload)
            .await
    }

    pub async fn create_team_invitation(
        &self,
        team_id: &str,
    ) -> Result<TeamInvitation, NetworkClientError> {
        self.client
            .post(
                &format!("api/v1/teams/{team_id}/invitations"),
                &serde_json::json!({}),
            )
            .await
    }

    pub async fn list_team_invitations(
        &self,
        team_id: &str,
        query: PageQuery,
    ) -> Result<Vec<TeamInvitation>, NetworkClientError> {
        let path = format!(
            "api/v1/teams/{team_id}/invitations{}",
            query.as_list_query().to_query_string()
        );
        self.client.get(&path).await
    }

    pub async fn get_team_invitation(
        &self,
        team_id: &str,
        invitation_id: &str,
    ) -> Result<TeamInvitation, NetworkClientError> {
        self.client
            .get(&format!(
                "api/v1/teams/{team_id}/invitations/{invitation_id}"
            ))
            .await
    }

    pub async fn delete_team_invitation(
        &self,
        team_id: &str,
        invitation_id: &str,
    ) -> Result<(), NetworkClientError> {
        self.client
            .delete_no_content(&format!(
                "api/v1/teams/{team_id}/invitations/{invitation_id}"
            ))
            .await
    }

    pub async fn accept_team_invitation(
        &self,
        team_id: &str,
        invitation_id: &str,
    ) -> Result<Team, NetworkClientError> {
        self.client
            .post(
                &format!("api/v1/teams/{team_id}/invitations/{invitation_id}/accept"),
                &serde_json::json!({}),
            )
            .await
    }

    /// Deprecated server path; prefer [`accept_team_invitation`].
    pub async fn accept_team_invitation_legacy(
        &self,
        invitation_id: &str,
    ) -> Result<Team, NetworkClientError> {
        self.client
            .post(
                &format!("api/v1/invitations/{invitation_id}/accept"),
                &serde_json::json!({}),
            )
            .await
    }

    pub async fn get_songs(&self, query: SongListQuery) -> Result<Vec<Song>, NetworkClientError> {
        let path = format!("api/v1/songs{}", query.to_query_string());
        self.client.get(&path).await
    }

    pub async fn get_song(&self, id: &str) -> Result<Song, NetworkClientError> {
        self.client.get(&format!("api/v1/songs/{id}")).await
    }

    pub async fn get_song_player(&self, id: &str) -> Result<Player, NetworkClientError> {
        self.client.get(&format!("api/v1/songs/{id}/player")).await
    }

    pub async fn create_song(&self, payload: CreateSong) -> Result<Song, NetworkClientError> {
        self.client.post("api/v1/songs", &payload).await
    }

    pub async fn update_song(
        &self,
        id: &str,
        payload: UpdateSong,
    ) -> Result<Song, NetworkClientError> {
        self.client
            .put(&format!("api/v1/songs/{id}"), &payload)
            .await
    }

    pub async fn delete_song(&self, id: &str) -> Result<(), NetworkClientError> {
        self.client
            .delete_no_content(&format!("api/v1/songs/{id}"))
            .await
    }

    pub async fn patch_song(
        &self,
        id: &str,
        payload: serde_json::Value,
    ) -> Result<Song, NetworkClientError> {
        self.client
            .patch(&format!("api/v1/songs/{id}"), &payload)
            .await
    }

    pub async fn move_song(
        &self,
        id: &str,
        payload: MoveOwner,
    ) -> Result<Song, NetworkClientError> {
        self.client
            .post(&format!("api/v1/songs/{id}/move"), &payload)
            .await
    }

    pub async fn get_song_like_status(&self, id: &str) -> Result<bool, NetworkClientError> {
        self.client
            .get(&format!("api/v1/songs/{id}/like"))
            .await
            .map(|like: LikeStatus| like.liked)
    }

    pub async fn update_song_like_status(
        &self,
        id: &str,
        liked: bool,
    ) -> Result<(), NetworkClientError> {
        if liked {
            self.client
                .put_no_content(&format!("api/v1/songs/{id}/like"))
                .await
        } else {
            self.client
                .delete_no_content(&format!("api/v1/songs/{id}/like"))
                .await
        }
    }

    pub async fn list_collections(
        &self,
        query: ListQuery,
    ) -> Result<Vec<Collection>, NetworkClientError> {
        let path = format!("api/v1/collections{}", query.to_query_string());
        self.client.get(&path).await
    }

    pub async fn get_collection(&self, id: &str) -> Result<Collection, NetworkClientError> {
        self.client.get(&format!("api/v1/collections/{id}")).await
    }

    pub async fn get_collection_songs(
        &self,
        id: &str,
        query: ListQuery,
    ) -> Result<Vec<Song>, NetworkClientError> {
        let path = format!("api/v1/collections/{id}/songs{}", query.to_query_string());
        self.client.get(&path).await
    }

    pub async fn get_collection_player(&self, id: &str) -> Result<Player, NetworkClientError> {
        self.client
            .get(&format!("api/v1/collections/{id}/player"))
            .await
    }

    pub async fn create_collection(
        &self,
        payload: CreateCollection,
    ) -> Result<Collection, NetworkClientError> {
        self.client.post("api/v1/collections", &payload).await
    }

    pub async fn update_collection(
        &self,
        id: &str,
        payload: UpdateCollection,
    ) -> Result<Collection, NetworkClientError> {
        self.client
            .put(&format!("api/v1/collections/{id}"), &payload)
            .await
    }

    pub async fn delete_collection(&self, id: &str) -> Result<(), NetworkClientError> {
        self.client
            .delete_no_content(&format!("api/v1/collections/{id}"))
            .await
    }

    pub async fn patch_collection(
        &self,
        id: &str,
        payload: serde_json::Value,
    ) -> Result<Collection, NetworkClientError> {
        self.client
            .patch(&format!("api/v1/collections/{id}"), &payload)
            .await
    }

    pub async fn move_collection(
        &self,
        id: &str,
        payload: MoveOwner,
    ) -> Result<Collection, NetworkClientError> {
        self.client
            .post(&format!("api/v1/collections/{id}/move"), &payload)
            .await
    }

    pub async fn list_setlists(
        &self,
        query: ListQuery,
    ) -> Result<Vec<Setlist>, NetworkClientError> {
        let path = format!("api/v1/setlists{}", query.to_query_string());
        self.client.get(&path).await
    }

    pub async fn get_setlist(&self, id: &str) -> Result<Setlist, NetworkClientError> {
        self.client.get(&format!("api/v1/setlists/{id}")).await
    }

    pub async fn get_setlist_songs(
        &self,
        id: &str,
        query: ListQuery,
    ) -> Result<Vec<Song>, NetworkClientError> {
        let path = format!("api/v1/setlists/{id}/songs{}", query.to_query_string());
        self.client.get(&path).await
    }

    pub async fn get_setlist_player(&self, id: &str) -> Result<Player, NetworkClientError> {
        self.client
            .get(&format!("api/v1/setlists/{id}/player"))
            .await
    }

    pub async fn create_setlist(
        &self,
        payload: CreateSetlist,
    ) -> Result<Setlist, NetworkClientError> {
        self.client.post("api/v1/setlists", &payload).await
    }

    pub async fn update_setlist(
        &self,
        id: &str,
        payload: UpdateSetlist,
    ) -> Result<Setlist, NetworkClientError> {
        self.client
            .put(&format!("api/v1/setlists/{id}"), &payload)
            .await
    }

    pub async fn delete_setlist(&self, id: &str) -> Result<(), NetworkClientError> {
        self.client
            .delete_no_content(&format!("api/v1/setlists/{id}"))
            .await
    }

    pub async fn patch_setlist(
        &self,
        id: &str,
        payload: serde_json::Value,
    ) -> Result<Setlist, NetworkClientError> {
        self.client
            .patch(&format!("api/v1/setlists/{id}"), &payload)
            .await
    }

    pub async fn move_setlist(
        &self,
        id: &str,
        payload: MoveOwner,
    ) -> Result<Setlist, NetworkClientError> {
        self.client
            .post(&format!("api/v1/setlists/{id}/move"), &payload)
            .await
    }

    pub async fn list_blobs(&self, query: ListQuery) -> Result<Vec<Blob>, NetworkClientError> {
        let path = format!("api/v1/blobs{}", query.to_query_string());
        self.client.get(&path).await
    }

    pub async fn get_blob(&self, id: &str) -> Result<Blob, NetworkClientError> {
        self.client.get(&format!("api/v1/blobs/{id}")).await
    }

    pub async fn create_blob(&self, payload: CreateBlob) -> Result<Blob, NetworkClientError> {
        self.client.post("api/v1/blobs", &payload).await
    }

    pub async fn update_blob(
        &self,
        id: &str,
        payload: UpdateBlob,
    ) -> Result<Blob, NetworkClientError> {
        self.client
            .put(&format!("api/v1/blobs/{id}"), &payload)
            .await
    }

    pub async fn delete_blob(&self, id: &str) -> Result<(), NetworkClientError> {
        self.client
            .delete_no_content(&format!("api/v1/blobs/{id}"))
            .await
    }

    pub async fn patch_blob(
        &self,
        id: &str,
        payload: serde_json::Value,
    ) -> Result<Blob, NetworkClientError> {
        self.client
            .patch(&format!("api/v1/blobs/{id}"), &payload)
            .await
    }

    pub async fn move_blob(
        &self,
        id: &str,
        payload: MoveOwner,
    ) -> Result<Blob, NetworkClientError> {
        self.client
            .post(&format!("api/v1/blobs/{id}/move"), &payload)
            .await
    }

    pub async fn upload_blob_data(
        &self,
        id: &str,
        content_type: &str,
        body: &[u8],
    ) -> Result<(), NetworkClientError> {
        self.client
            .put_bytes_no_content(&format!("api/v1/blobs/{id}/data"), content_type, body)
            .await
    }

    pub async fn download_blob_data(&self, id: &str) -> Result<Vec<u8>, NetworkClientError> {
        self.client
            .get_bytes(&format!("api/v1/blobs/{id}/data"))
            .await
    }

    pub async fn list_http_audit_logs(
        &self,
        query: PageQuery,
    ) -> Result<Vec<HttpAuditLog>, NetworkClientError> {
        let path = format!(
            "api/v1/monitoring/http-audit-logs{}",
            query.as_list_query().to_query_string()
        );
        self.client.get(&path).await
    }

    pub async fn get_monitoring_metrics(
        &self,
        query: MonitoringMetricsQuery,
    ) -> Result<serde_json::Value, NetworkClientError> {
        let path = format!("api/v1/monitoring/metrics{}", query.to_query_string());
        self.client.get(&path).await
    }

    pub fn download_blob_image_url(&self, id: &str) -> String {
        format!("api/v1/blobs/{id}/data")
    }
}

fn append_query_param(path: String, key: &str, value: &str) -> String {
    let sep = if path.contains('?') { '&' } else { '?' };
    format!("{path}{sep}{key}={value}")
}
