use std::path::Path;
use std::time::Duration;

use futures_util::{SinkExt, StreamExt};
use reqwest::multipart::{Form, Part};
use reqwest::{Client, RequestBuilder};
use serde_json::Value;
use shared::collection::{Collection, TransferCollectionSong, TransferCollectionSongResult};
use shared::error::NetworkClientError;
use shared::media::{CreateUploadedMedia, Media};
use shared::net::{DefaultHttpClient, HttpClient, HttpClientConfig};
use shared::room_message::{MessageRoomClientEvent, MessageRoomReplay, MessageRoomServerEvent};
use shared::team::Team;

use crate::session::CliSession;

pub async fn room_socket(
    session: &CliSession,
    connection_ticket: &str,
    room_id: Option<&str>,
    resume_credential: Option<&str>,
    messages: &[String],
    wait_secs: u64,
    follow: bool,
) -> Result<(), Box<dyn std::error::Error>> {
    use tokio_tungstenite::tungstenite::Message;

    let base = session.config().base_url.trim_end_matches('/');
    let websocket_base = base
        .strip_prefix("https://")
        .map(|rest| format!("wss://{rest}"))
        .or_else(|| {
            base.strip_prefix("http://")
                .map(|rest| format!("ws://{rest}"))
        })
        .ok_or("base URL must start with http:// or https://")?;
    let url = format!("{websocket_base}/api/v1/rooms/ws");
    let (socket, _) = tokio::time::timeout(
        Duration::from_secs(10),
        tokio_tungstenite::connect_async(url),
    )
    .await??;
    let (mut writer, mut reader) = socket.split();
    writer
        .send(Message::Text(
            serde_json::json!({"type": "authenticate", "ticket": connection_ticket})
                .to_string()
                .into(),
        ))
        .await?;

    let first_deadline = tokio::time::Instant::now() + Duration::from_secs(6);
    loop {
        let incoming = tokio::time::timeout_at(first_deadline, reader.next()).await?;
        match incoming {
            Some(Ok(Message::Text(text))) => {
                println!("{text}");
                let event: MessageRoomServerEvent = serde_json::from_str(&text)?;
                let MessageRoomServerEvent::Authorized {
                    room_id: authorized_room_id,
                    boundary,
                    ..
                } = event
                else {
                    return Err(format!("room socket did not authorize: {text}").into());
                };
                if room_id.is_some_and(|expected| expected != authorized_room_id) {
                    return Err("room socket authorized a different room".into());
                }
                if let (Some(room_id), Some(resume_credential)) = (room_id, resume_credential) {
                    let replay = get_room_history(
                        session,
                        room_id,
                        resume_credential,
                        boundary.epoch,
                        boundary.sequence,
                    )
                    .await?;
                    println!("{}", serde_json::json!({"type": "replay", "data": replay}));
                }
                writer
                    .send(Message::Text(
                        serde_json::to_string(&MessageRoomClientEvent::HistoryReady)?.into(),
                    ))
                    .await?;
                break;
            }
            Some(Ok(Message::Ping(payload))) => {
                writer.send(Message::Pong(payload)).await?;
            }
            Some(Ok(Message::Close(_))) | None => {
                return Err("room socket closed before authorizing the connection".into());
            }
            Some(Ok(_)) => {}
            Some(Err(error)) => return Err(Box::new(error)),
        }
    }

    for message in messages {
        let _: MessageRoomClientEvent = serde_json::from_str(message)?;
        writer.send(Message::Text(message.clone().into())).await?;
    }

    if follow {
        loop {
            match reader.next().await {
                Some(Ok(Message::Text(text))) => {
                    let ended = serde_json::from_str::<MessageRoomServerEvent>(&text)
                        .ok()
                        .is_some_and(|event| {
                            matches!(event, MessageRoomServerEvent::Error { code } if code == "room_deleted")
                        });
                    println!("{text}");
                    if ended {
                        break;
                    }
                }
                Some(Ok(Message::Ping(payload))) => writer.send(Message::Pong(payload)).await?,
                Some(Ok(Message::Close(_))) | None => break,
                Some(Ok(_)) => {}
                Some(Err(error)) => return Err(Box::new(error)),
            }
        }
    } else {
        let deadline = tokio::time::Instant::now() + Duration::from_secs(wait_secs);
        loop {
            let incoming = match tokio::time::timeout_at(deadline, reader.next()).await {
                Ok(incoming) => incoming,
                Err(_) => break,
            };
            match incoming {
                Some(Ok(Message::Text(text))) => println!("{text}"),
                Some(Ok(Message::Ping(payload))) => writer.send(Message::Pong(payload)).await?,
                Some(Ok(Message::Close(_))) | None => break,
                Some(Ok(_)) => {}
                Some(Err(error)) => return Err(Box::new(error)),
            }
        }
    }
    writer.close().await?;
    Ok(())
}

pub async fn get_room_history(
    session: &CliSession,
    room_id: &str,
    resume_credential: &str,
    epoch: u64,
    sequence: u64,
) -> Result<MessageRoomReplay, Box<dyn std::error::Error>> {
    let config = session.config();
    let client = reqwest_client(config)?;
    let path = format!("api/v1/rooms/{room_id}/history?epoch={epoch}&sequence={sequence}");
    let response = request_with_auth(client.get(api_url(config, &path)), config)
        .header("x-room-resume", resume_credential)
        .send()
        .await?
        .error_for_status()?;
    Ok(response.json().await?)
}

fn reqwest_client(config: &HttpClientConfig) -> Result<Client, Box<dyn std::error::Error>> {
    let mut builder = Client::builder();
    if let Some(timeout) = config.timeout {
        builder = builder.timeout(timeout);
    }
    Ok(builder.build()?)
}

fn request_with_auth(mut request: RequestBuilder, config: &HttpClientConfig) -> RequestBuilder {
    let mut cookies = Vec::new();
    if let Some(cookie) = config.session_cookie.as_deref() {
        cookies.push(format!("sso_session={cookie}"));
    }
    if let Some(cookie) = config.impersonation_cookie.as_deref() {
        cookies.push(format!("wv_impersonation={cookie}"));
    }
    if !cookies.is_empty() {
        request = request.header(reqwest::header::COOKIE, cookies.join("; "));
    }
    if let Some(token) = config.bearer_token.as_deref() {
        request = request.bearer_auth(token);
    }
    if let Some(id) = config.client_ident.as_deref() {
        request = request.header("X-Worship-Client", id);
    }
    request
}

fn api_url(config: &HttpClientConfig, path: &str) -> String {
    format!(
        "{}/{}",
        config.base_url.trim_end_matches('/'),
        path.trim_start_matches('/')
    )
}

pub async fn create_uploaded_media(
    session: &CliSession,
    kind: &str,
    metadata: CreateUploadedMedia,
    files: &[std::path::PathBuf],
) -> Result<Media, Box<dyn std::error::Error>> {
    let config = session.config();
    let client = reqwest_client(config)?;
    let metadata = serde_json::to_string(&metadata)?;
    let metadata_part = Part::text(metadata).mime_str("application/json")?;
    let mut form = Form::new().part("metadata", metadata_part);
    for file in files {
        form = form.part("file", Part::file(file).await?);
    }
    let response = request_with_auth(
        client.post(api_url(
            config,
            &format!("api/v1/media/uploads?kind={kind}"),
        )),
        config,
    )
    .multipart(form)
    .send()
    .await?
    .error_for_status()?;
    Ok(response.json().await?)
}

pub async fn upload_media_asset_file(
    session: &CliSession,
    media_id: &str,
    query: &str,
    content_type: &str,
    path: &Path,
) -> Result<Media, Box<dyn std::error::Error>> {
    use tokio::io::AsyncReadExt;

    let config = session.config();
    let client = reqwest_client(config)?;
    let file = tokio::fs::File::open(path).await?;
    let stream = futures_util::stream::try_unfold(file, |mut file| async move {
        let mut buffer = vec![0; 64 * 1024];
        let count = file.read(&mut buffer).await?;
        if count == 0 {
            Ok::<_, std::io::Error>(None)
        } else {
            buffer.truncate(count);
            Ok(Some((buffer, file)))
        }
    });
    let response = request_with_auth(
        client.put(api_url(
            config,
            &format!("api/v1/media/{media_id}/uploads?{query}"),
        )),
        config,
    )
    .header(reqwest::header::CONTENT_TYPE, content_type)
    .body(reqwest::Body::wrap_stream(stream))
    .send()
    .await?
    .error_for_status()?;
    Ok(response.json().await?)
}

pub async fn start_impersonation(
    session: &CliSession,
    user_id: &str,
) -> Result<(Value, String), Box<dyn std::error::Error>> {
    let config = session.config();
    let client = reqwest_client(config)?;
    let response = request_with_auth(
        client.post(api_url(
            config,
            &format!("api/v1/users/{user_id}/impersonation"),
        )),
        config,
    )
    .json(&serde_json::json!({}))
    .send()
    .await?
    .error_for_status()?;
    let cookie = response
        .headers()
        .get_all(reqwest::header::SET_COOKIE)
        .iter()
        .filter_map(|header| header.to_str().ok())
        .find_map(|header| {
            let pair = header.split(';').next()?;
            let (name, value) = pair.split_once('=')?;
            (name == "wv_impersonation").then(|| value.to_owned())
        })
        .ok_or("successful impersonation response did not set wv_impersonation")?;
    let status = response.json().await?;
    Ok((status, cookie))
}

fn asset_response_headers(
    status: reqwest::StatusCode,
    headers: &reqwest::header::HeaderMap,
) -> Value {
    let header =
        |name: reqwest::header::HeaderName| headers.get(name).and_then(|value| value.to_str().ok());
    serde_json::json!({
        "status": status.as_u16(),
        "content_type": header(reqwest::header::CONTENT_TYPE),
        "content_length": header(reqwest::header::CONTENT_LENGTH),
        "etag": header(reqwest::header::ETAG),
        "accept_ranges": header(reqwest::header::ACCEPT_RANGES),
        "content_range": header(reqwest::header::CONTENT_RANGE),
        "cache_control": header(reqwest::header::CACHE_CONTROL),
    })
}

fn set_range(request: RequestBuilder, range: Option<&str>) -> RequestBuilder {
    match range {
        Some(range) => request.header(reqwest::header::RANGE, range),
        None => request,
    }
}

pub async fn head_media_asset(
    session: &CliSession,
    media_id: &str,
    asset_id: &str,
    range: Option<&str>,
) -> Result<Value, Box<dyn std::error::Error>> {
    let config = session.config();
    let client = reqwest_client(config)?;
    let request = request_with_auth(
        client.head(api_url(
            config,
            &format!("api/v1/media/{media_id}/assets/{asset_id}/data"),
        )),
        config,
    );
    let response = set_range(request, range).send().await?;
    response.error_for_status_ref()?;
    Ok(asset_response_headers(
        response.status(),
        response.headers(),
    ))
}

pub async fn download_media_asset(
    session: &CliSession,
    media_id: &str,
    asset_id: &str,
    output: Option<&Path>,
    range: Option<&str>,
) -> Result<Value, Box<dyn std::error::Error>> {
    let config = session.config();
    let client = reqwest_client(config)?;
    let request = request_with_auth(
        client.get(api_url(
            config,
            &format!("api/v1/media/{media_id}/assets/{asset_id}/data"),
        )),
        config,
    );
    let mut response = set_range(request, range).send().await?;
    response.error_for_status_ref()?;
    let details = asset_response_headers(response.status(), response.headers());

    if let Some(path) = output {
        let mut file = tokio::fs::File::create(path).await?;
        while let Some(chunk) = response.chunk().await? {
            tokio::io::AsyncWriteExt::write_all(&mut file, &chunk).await?;
        }
        tokio::io::AsyncWriteExt::flush(&mut file).await?;
    } else {
        let mut stdout = tokio::io::stdout();
        while let Some(chunk) = response.chunk().await? {
            tokio::io::AsyncWriteExt::write_all(&mut stdout, &chunk).await?;
        }
        tokio::io::AsyncWriteExt::flush(&mut stdout).await?;
    }

    Ok(details)
}

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
