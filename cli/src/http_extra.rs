use shared::collection::{Collection, TransferCollectionSong, TransferCollectionSongResult};
use shared::error::NetworkClientError;
use shared::net::{DefaultHttpClient, HttpClient};
use shared::team::Team;

pub async fn transfer_collection_song(
    http: &DefaultHttpClient,
    collection_id: &str,
    song_id: &str,
    payload: TransferCollectionSong,
) -> Result<TransferCollectionSongResult, NetworkClientError> {
    let path = format!("api/v1/collections/{collection_id}/songs/{song_id}/transfer");
    http.post(&path, &payload).await
}

pub async fn upload_collection_cover(
    http: &DefaultHttpClient,
    collection_id: &str,
    content_type: &str,
    body: &[u8],
) -> Result<Collection, NetworkClientError> {
    let path = format!("api/v1/collections/{collection_id}/cover");
    http.put_bytes_json(&path, content_type, body).await
}

pub async fn upload_team_cover(
    http: &DefaultHttpClient,
    team_id: &str,
    content_type: &str,
    body: &[u8],
) -> Result<Team, NetworkClientError> {
    let path = format!("api/v1/teams/{team_id}/cover");
    http.put_bytes_json(&path, content_type, body).await
}
