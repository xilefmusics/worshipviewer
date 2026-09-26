use std::sync::Arc;

use reqwest::Url;
use shared::MoveOwner;
use shared::media::{
    CreateMedia, CreateMediaContent, DuplicateMedia, Media, MediaContent, MediaListQuery,
    SpotifyResourceType, UpdateMedia,
};
use tracing::instrument;

use crate::auth::AuthorizationContext;
use crate::database::Database;
use crate::error::AppError;
use crate::resources::common::{read_teams_for_query, resolve_owner_team};
use crate::resources::media::processing::MediaProcessingHandle;
use crate::resources::media_asset::service::MediaAssetServiceHandle;
use crate::resources::team::{parse_owner_record_id, thing_record_key};

use super::model::MediaWrite;
use super::repository::MediaRepository;
use super::surreal_repo::SurrealMediaRepo;

const YOUTUBE_ID_LENGTH: usize = 11;
const SPOTIFY_ID_LENGTH: usize = 22;

#[derive(Clone)]
pub struct MediaService<R> {
    pub repo: R,
    pub asset_svc: MediaAssetServiceHandle,
    pub processing: Arc<MediaProcessingHandle>,
}

impl<R> MediaService<R> {
    pub fn new(
        repo: R,
        asset_svc: MediaAssetServiceHandle,
        processing: Arc<MediaProcessingHandle>,
    ) -> Self {
        Self {
            repo,
            asset_svc,
            processing,
        }
    }
}

impl<R: MediaRepository> MediaService<R> {
    #[instrument(level = "debug", err, skip(self, ctx))]
    pub async fn list_for_user(
        &self,
        ctx: &AuthorizationContext,
        query: MediaListQuery,
    ) -> Result<Vec<Media>, AppError> {
        let teams = read_teams_for_query(&ctx.read_teams(), query.team.as_deref())?;
        self.repo.list(&teams, query).await
    }

    pub async fn count_for_user(
        &self,
        ctx: &AuthorizationContext,
        query: &MediaListQuery,
    ) -> Result<u64, AppError> {
        let teams = read_teams_for_query(&ctx.read_teams(), query.team.as_deref())?;
        self.repo.count(&teams, query).await
    }

    pub async fn get_for_user(
        &self,
        ctx: &AuthorizationContext,
        id: &str,
    ) -> Result<Media, AppError> {
        self.repo.get(&ctx.read_teams(), id).await
    }

    #[instrument(level = "debug", err, skip(self, ctx, payload))]
    pub async fn create_for_user(
        &self,
        ctx: &AuthorizationContext,
        mut payload: CreateMedia,
    ) -> Result<Media, AppError> {
        let owner = match payload.owner.take() {
            None => ctx.personal_team()?,
            Some(value) => {
                let owner = parse_owner_record_id(&value)?;
                ctx.require_write_access_to_owner(&owner)?;
                owner
            }
        };
        let is_background = payload.is_background;
        let mut value = create_write(payload.title, payload.content)?;
        value.is_background = is_background;
        validate_background_flag(&value.content, value.is_background)?;
        self.repo.create(owner, value).await
    }

    #[instrument(level = "debug", err, skip(self, ctx, payload))]
    pub async fn update_for_user(
        &self,
        ctx: &AuthorizationContext,
        id: &str,
        payload: UpdateMedia,
    ) -> Result<Media, AppError> {
        let write_teams = ctx.write_teams();
        let existing = self.repo.get(&write_teams, id).await?;
        self.update_current_for_user(ctx, id, &existing, payload)
            .await
    }

    pub async fn update_current_for_user(
        &self,
        ctx: &AuthorizationContext,
        id: &str,
        existing: &Media,
        payload: UpdateMedia,
    ) -> Result<Media, AppError> {
        let write_teams = ctx.write_teams();
        let owner = resolve_owner_team(&write_teams, payload.owner)?;
        let value = update_write(
            existing,
            payload.title,
            payload.content,
            payload.is_background,
        )?;
        self.repo
            .update_if_current(&write_teams, id, existing, owner, value)
            .await
    }

    #[instrument(level = "debug", err, skip(self, ctx, payload))]
    pub async fn move_for_user(
        &self,
        ctx: &AuthorizationContext,
        id: &str,
        payload: MoveOwner,
    ) -> Result<Media, AppError> {
        let write_teams = ctx.write_teams();
        let media = self.repo.get(&write_teams, id).await?;
        let current = parse_owner_record_id(&media.owner)?;
        let destination = parse_owner_record_id(&payload.owner)?;
        ctx.require_write_access_to_owner(&current)?;
        ctx.require_write_access_to_owner(&destination)?;
        if thing_record_key(&current) == thing_record_key(&destination) {
            return Ok(media);
        }
        let moved = self.repo.move_owner(&write_teams, id, destination).await?;
        Ok(moved)
    }

    #[instrument(level = "debug", err, skip(self, ctx, payload))]
    pub async fn duplicate_for_user(
        &self,
        ctx: &AuthorizationContext,
        id: &str,
        payload: DuplicateMedia,
    ) -> Result<Media, AppError> {
        let write_teams = ctx.write_teams();
        let source = self.repo.get(&write_teams, id).await?;
        let source_owner = parse_owner_record_id(&source.owner)?;
        let owner = match payload.owner {
            Some(value) => {
                let destination = parse_owner_record_id(&value)?;
                ctx.require_write_access_to_owner(&destination)?;
                destination
            }
            None => source_owner,
        };
        let source_title = source.title.clone();
        let title = checked_title(payload.title.unwrap_or(source_title))?;
        let created = if is_uploaded(&source.content) {
            let media_id = uuid::Uuid::new_v4().to_string();
            let content = match self
                .asset_svc
                .duplicate_uploaded_content(&source.id, &media_id, &source.content, owner.clone())
                .await
            {
                Ok(content) => content,
                Err(error) => {
                    let _ = self.asset_svc.delete_assets_for_media(&media_id).await;
                    return Err(error);
                }
            };
            match self
                .repo
                .create_with_id(
                    &media_id,
                    owner,
                    MediaWrite {
                        title,
                        content,
                        pending_revision: None,
                        is_background: source.is_background,
                    },
                )
                .await
            {
                Ok(media) => media,
                Err(error) => {
                    let _ = self.asset_svc.delete_assets_for_media(&media_id).await;
                    return Err(error);
                }
            }
        } else {
            self.repo
                .create(
                    owner,
                    MediaWrite {
                        title,
                        content: source.content.clone(),
                        pending_revision: None,
                        is_background: source.is_background,
                    },
                )
                .await?
        };
        Ok(created)
    }

    pub async fn delete_for_user(
        &self,
        ctx: &AuthorizationContext,
        id: &str,
    ) -> Result<Media, AppError> {
        let current = self.repo.get(&ctx.write_teams(), id).await?;
        self.delete_current_for_user(ctx, id, &current).await
    }

    pub async fn delete_current_for_user(
        &self,
        ctx: &AuthorizationContext,
        id: &str,
        current: &Media,
    ) -> Result<Media, AppError> {
        self.processing
            .delete_current_for_user(ctx, id, current)
            .await
    }

    pub async fn begin_deck_revision_for_user(
        &self,
        ctx: &AuthorizationContext,
        id: &str,
    ) -> Result<Media, AppError> {
        self.processing.begin_deck_revision_for_user(ctx, id).await
    }

    pub async fn commit_deck_for_user(
        &self,
        ctx: &AuthorizationContext,
        id: &str,
        payload: shared::media::CommitDeck,
    ) -> Result<Media, AppError> {
        self.processing.commit_deck_for_user(ctx, id, payload).await
    }
}

fn create_write(title: String, content: CreateMediaContent) -> Result<MediaWrite, AppError> {
    content_write(title, content)
}

fn update_write(
    existing: &Media,
    title: String,
    content: Option<CreateMediaContent>,
    is_background: Option<bool>,
) -> Result<MediaWrite, AppError> {
    if is_uploaded(&existing.content) {
        if content.is_some() {
            return Err(AppError::invalid_request(
                "uploaded media title updates cannot change content",
            ));
        }
        let is_background = is_background.unwrap_or(existing.is_background);
        validate_background_flag(&existing.content, is_background)?;
        Ok(MediaWrite {
            title: checked_title(title)?,
            content: existing.content.clone(),
            pending_revision: existing.pending_revision.clone(),
            is_background,
        })
    } else {
        let content = content.ok_or_else(|| AppError::invalid_request("content is required"))?;
        let mut write = content_write(title, content)?;
        write.is_background = is_background.unwrap_or(existing.is_background);
        validate_background_flag(&write.content, write.is_background)?;
        Ok(write)
    }
}

fn is_uploaded(content: &MediaContent) -> bool {
    matches!(
        content,
        MediaContent::Image { .. }
            | MediaContent::Video { .. }
            | MediaContent::Audio { .. }
            | MediaContent::SlideDeck { .. }
    )
}

fn content_write(title: String, content: CreateMediaContent) -> Result<MediaWrite, AppError> {
    Ok(MediaWrite {
        title: checked_title(title)?,
        content: normalize_content(content)?,
        pending_revision: None,
        is_background: false,
    })
}

pub(crate) fn validate_background_flag(
    content: &MediaContent,
    is_background: bool,
) -> Result<(), AppError> {
    if is_background && !matches!(content, MediaContent::Image { .. }) {
        return Err(AppError::invalid_request(
            "only image media can be used as a background",
        ));
    }
    Ok(())
}

fn checked_title(title: String) -> Result<String, AppError> {
    let title = title.trim();
    if title.is_empty() {
        return Err(AppError::invalid_request("title must not be empty"));
    }
    Ok(title.to_owned())
}

pub(crate) fn normalize_content(value: CreateMediaContent) -> Result<MediaContent, AppError> {
    match value {
        CreateMediaContent::YouTube { url } => normalize_youtube(&url),
        CreateMediaContent::Spotify { url } => normalize_spotify(&url),
    }
}

fn parsed_url(raw: &str) -> Result<Url, AppError> {
    Url::parse(raw).map_err(|_| AppError::media_invalid_url("URL is malformed"))
}

fn ensure_safe_common(url: &Url) -> Result<(), AppError> {
    if url.scheme() != "https" {
        return Err(AppError::media_unsupported_url("URL must use HTTPS"));
    }
    if url.host_str().is_none() {
        return Err(AppError::media_invalid_url("URL must include a valid host"));
    }
    if !url.username().is_empty() || url.password().is_some() {
        return Err(AppError::media_invalid_url(
            "URL credentials are not allowed",
        ));
    }
    if url.fragment().is_some() {
        return Err(AppError::media_invalid_url("URL fragments are not allowed"));
    }
    Ok(())
}

fn normalize_youtube(raw: &str) -> Result<MediaContent, AppError> {
    let url = parsed_url(raw)?;
    ensure_safe_common(&url)?;
    let host = url.host_str().unwrap().to_ascii_lowercase();
    let segments: Vec<_> = url
        .path_segments()
        .map(|v| v.filter(|s| !s.is_empty()).collect())
        .unwrap_or_default();
    let video_id: String = match host.as_str() {
        "youtu.be" => segments.first().map(|value| (*value).to_owned()),
        "youtube.com" | "www.youtube.com" | "m.youtube.com" | "music.youtube.com" => {
            match segments.first().copied() {
                Some("watch") | None => url
                    .query_pairs()
                    .find(|(key, _)| key == "v")
                    .map(|(_, value)| value.into_owned())
                    .as_deref()
                    .map(str::to_owned),
                Some("embed" | "shorts" | "live") => segments.get(1).copied().map(str::to_owned),
                _ => None,
            }
        }
        _ => return Err(AppError::media_unsupported_url("unsupported YouTube host")),
    }
    .ok_or_else(|| {
        AppError::media_invalid_url("YouTube URL does not contain a supported video id")
    })?;
    if video_id.len() != YOUTUBE_ID_LENGTH
        || !video_id
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-')
    {
        return Err(AppError::media_invalid_url("YouTube video id is invalid"));
    }
    Ok(MediaContent::YouTube {
        canonical_url: format!("https://www.youtube.com/watch?v={video_id}"),
        video_id,
    })
}

fn normalize_spotify(raw: &str) -> Result<MediaContent, AppError> {
    let url = parsed_url(raw)?;
    ensure_safe_common(&url)?;
    let host = url.host_str().unwrap().to_ascii_lowercase();
    if host != "open.spotify.com" && host != "www.open.spotify.com" {
        return Err(AppError::media_unsupported_url("unsupported Spotify host"));
    }
    let segments: Vec<_> = url
        .path_segments()
        .map(|value| value.filter(|segment| !segment.is_empty()).collect())
        .unwrap_or_default();
    let resource_type = match segments.first().copied() {
        Some("track") => SpotifyResourceType::Track,
        Some("playlist") => SpotifyResourceType::Playlist,
        _ => {
            return Err(AppError::media_invalid_url(
                "Spotify URL must identify a track or playlist",
            ));
        }
    };
    if segments.len() != 2 {
        return Err(AppError::media_invalid_url(
            "Spotify URL must identify a track or playlist",
        ));
    }
    let spotify_id = segments[1];
    if spotify_id.len() != SPOTIFY_ID_LENGTH
        || !spotify_id.bytes().all(|byte| byte.is_ascii_alphanumeric())
    {
        return Err(AppError::media_invalid_url("Spotify id is invalid"));
    }
    let resource_path = match resource_type {
        SpotifyResourceType::Track => "track",
        SpotifyResourceType::Playlist => "playlist",
    };
    Ok(MediaContent::Spotify {
        resource_type,
        spotify_id: spotify_id.to_owned(),
        canonical_url: format!("https://open.spotify.com/{resource_path}/{spotify_id}"),
    })
}

pub type MediaServiceHandle = MediaService<SurrealMediaRepo>;

impl MediaServiceHandle {
    pub fn build(
        db: Arc<Database>,
        asset_svc: MediaAssetServiceHandle,
        processing: Arc<MediaProcessingHandle>,
    ) -> Self {
        Self::new(SurrealMediaRepo::new(db), asset_svc, processing)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::resources::media_asset::{CreateFinalAsset, MediaAssetRepository};
    use crate::test_helpers::{
        TeamFixture, auth_ctx_for_user, media_service, test_db, two_shared_teams_for_user,
    };
    use shared::MediaAssetKind;
    use surrealdb::types::RecordId;

    #[test]
    fn youtube_normalization_table() {
        for raw in [
            "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
            "https://youtu.be/dQw4w9WgXcQ?t=2",
            "https://m.youtube.com/shorts/dQw4w9WgXcQ",
            "https://youtube.com/embed/dQw4w9WgXcQ",
            "https://youtube.com/live/dQw4w9WgXcQ",
        ] {
            assert_eq!(
                normalize_youtube(raw).unwrap(),
                MediaContent::YouTube {
                    video_id: "dQw4w9WgXcQ".into(),
                    canonical_url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ".into(),
                }
            );
        }
    }

    #[test]
    fn youtube_rejects_unsafe_or_misleading_urls() {
        for raw in [
            "http://youtube.com/watch?v=dQw4w9WgXcQ",
            "https://youtube.com.evil.test/watch?v=dQw4w9WgXcQ",
            "https://user@youtube.com/watch?v=dQw4w9WgXcQ",
            "https://youtube.com/watch?v=short",
            "https://youtube.com/watch?v=dQw4w9WgXcQ#fragment",
            "not a URL",
        ] {
            assert!(normalize_youtube(raw).is_err(), "{raw}");
        }
    }

    #[test]
    fn spotify_normalizes_tracks_and_playlists() {
        assert_eq!(
            normalize_spotify(
                "https://open.spotify.com/track/4iV5W9uYEdYUVa79Axb7Rh?si=share-token"
            )
            .unwrap(),
            MediaContent::Spotify {
                resource_type: SpotifyResourceType::Track,
                spotify_id: "4iV5W9uYEdYUVa79Axb7Rh".into(),
                canonical_url: "https://open.spotify.com/track/4iV5W9uYEdYUVa79Axb7Rh".into(),
            }
        );
        assert_eq!(
            normalize_spotify("https://www.open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M/")
                .unwrap(),
            MediaContent::Spotify {
                resource_type: SpotifyResourceType::Playlist,
                spotify_id: "37i9dQZF1DXcBWIGoYBM5M".into(),
                canonical_url: "https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M".into(),
            }
        );
    }

    #[test]
    fn spotify_rejects_unsafe_or_unsupported_urls() {
        for raw in [
            "http://open.spotify.com/track/4iV5W9uYEdYUVa79Axb7Rh",
            "https://open.spotify.com.evil.test/track/4iV5W9uYEdYUVa79Axb7Rh",
            "https://user@open.spotify.com/track/4iV5W9uYEdYUVa79Axb7Rh",
            "https://open.spotify.com/album/4iV5W9uYEdYUVa79Axb7Rh",
            "https://open.spotify.com/track/short",
            "https://open.spotify.com/track/4iV5W9uYEdYUVa79Axb7Rh#fragment",
        ] {
            assert!(normalize_spotify(raw).is_err(), "{raw}");
        }
    }

    fn youtube(owner: Option<String>, title: &str) -> CreateMedia {
        CreateMedia {
            owner,
            title: title.into(),
            content: CreateMediaContent::YouTube {
                url: "https://youtu.be/dQw4w9WgXcQ".into(),
            },
            is_background: false,
        }
    }

    #[tokio::test]
    async fn media_crud_search_pagination_acl_and_independent_duplicate() {
        let db = test_db().await.unwrap();
        let fixture = TeamFixture::build(&db).await.unwrap();
        let writer = auth_ctx_for_user(&db, &fixture.writer).await.unwrap();
        let guest = auth_ctx_for_user(&db, &fixture.guest).await.unwrap();
        let outsider = auth_ctx_for_user(&db, &fixture.non_member).await.unwrap();
        let platform_admin = auth_ctx_for_user(&db, &fixture.platform_admin)
            .await
            .unwrap();
        let service = media_service(&db);

        let first = service
            .create_for_user(
                &writer,
                youtube(Some(fixture.shared_team_id.clone()), "Alpha video"),
            )
            .await
            .unwrap();
        let second = service
            .create_for_user(
                &writer,
                CreateMedia {
                    owner: Some(fixture.shared_team_id.clone()),
                    title: "Beta stream".into(),
                    content: CreateMediaContent::YouTube {
                        url: "https://youtu.be/dQw4w9WgXcQ".into(),
                    },
                    is_background: false,
                },
            )
            .await
            .unwrap();
        service
            .create_for_user(
                &writer,
                CreateMedia {
                    owner: Some(fixture.shared_team_id.clone()),
                    title: "Gamma page".into(),
                    content: CreateMediaContent::YouTube {
                        url: "https://youtu.be/dQw4w9WgXcQ".into(),
                    },
                    is_background: false,
                },
            )
            .await
            .unwrap();

        assert_eq!(
            service.get_for_user(&guest, &first.id).await.unwrap(),
            first
        );
        assert!(matches!(
            service.get_for_user(&outsider, &first.id).await,
            Err(AppError::NotFound(_))
        ));
        assert!(matches!(
            service.get_for_user(&platform_admin, &first.id).await,
            Err(AppError::NotFound(_))
        ));
        assert!(matches!(
            service
                .create_for_user(
                    &guest,
                    youtube(Some(fixture.shared_team_id.clone()), "Denied")
                )
                .await,
            Err(AppError::NotFound(_))
        ));
        assert!(matches!(
            service
                .update_for_user(
                    &guest,
                    &first.id,
                    UpdateMedia {
                        title: "Denied".into(),
                        content: Some(CreateMediaContent::YouTube {
                            url: "https://youtu.be/dQw4w9WgXcQ".into()
                        }),
                        owner: None,
                        is_background: None,
                    }
                )
                .await,
            Err(AppError::NotFound(_))
        ));
        assert!(matches!(
            service
                .move_for_user(
                    &guest,
                    &first.id,
                    MoveOwner {
                        owner: fixture.shared_team_id.clone()
                    }
                )
                .await,
            Err(AppError::NotFound(_))
        ));
        assert!(matches!(
            service
                .duplicate_for_user(&guest, &first.id, DuplicateMedia::default())
                .await,
            Err(AppError::NotFound(_))
        ));
        assert!(matches!(
            service.delete_for_user(&guest, &first.id).await,
            Err(AppError::NotFound(_))
        ));

        let page = service
            .list_for_user(
                &guest,
                MediaListQuery {
                    page: Some(0),
                    page_size: Some(1),
                    q: Some("stream".into()),
                    team: Some(fixture.shared_team_id.clone()),
                    is_background: None,
                },
            )
            .await
            .unwrap();
        assert_eq!(page, vec![second]);

        let copy = service
            .duplicate_for_user(
                &writer,
                &first.id,
                DuplicateMedia {
                    title: Some("Alpha copy".into()),
                    owner: None,
                },
            )
            .await
            .unwrap();
        assert_ne!(copy.id, first.id);
        assert_eq!(copy.content, first.content);

        service
            .update_for_user(
                &writer,
                &first.id,
                UpdateMedia {
                    title: "Changed original".into(),
                    content: Some(CreateMediaContent::YouTube {
                        url: "https://youtu.be/9bZkp7q19f0".into(),
                    }),
                    owner: None,
                    is_background: None,
                },
            )
            .await
            .unwrap();
        service.delete_for_user(&writer, &first.id).await.unwrap();
        assert_eq!(
            service.get_for_user(&guest, &copy.id).await.unwrap().title,
            "Alpha copy"
        );
    }

    #[tokio::test]
    async fn concurrent_media_update_is_rejected() {
        let db = test_db().await.unwrap();
        let fixture = TeamFixture::build(&db).await.unwrap();
        let writer = auth_ctx_for_user(&db, &fixture.writer).await.unwrap();
        let service = media_service(&db);
        let original = service
            .create_for_user(
                &writer,
                youtube(Some(fixture.shared_team_id.clone()), "Original"),
            )
            .await
            .unwrap();

        service
            .update_current_for_user(
                &writer,
                &original.id,
                &original,
                UpdateMedia {
                    title: "First writer".into(),
                    content: Some(CreateMediaContent::YouTube {
                        url: "https://youtu.be/dQw4w9WgXcQ".into(),
                    }),
                    owner: None,
                    is_background: None,
                },
            )
            .await
            .unwrap();

        let stale = service
            .update_current_for_user(
                &writer,
                &original.id,
                &original,
                UpdateMedia {
                    title: "Stale writer".into(),
                    content: Some(CreateMediaContent::YouTube {
                        url: "https://youtu.be/dQw4w9WgXcQ".into(),
                    }),
                    owner: None,
                    is_background: None,
                },
            )
            .await;
        assert!(matches!(stale, Err(AppError::Conflict(_))));
    }

    #[tokio::test]
    async fn move_requires_write_access_to_both_teams() {
        let db = test_db().await.unwrap();
        let fixture = TeamFixture::build(&db).await.unwrap();
        let (source, destination) = two_shared_teams_for_user(&db, &fixture.admin_user)
            .await
            .unwrap();
        let admin = auth_ctx_for_user(&db, &fixture.admin_user).await.unwrap();
        let service = media_service(&db);
        let media = service
            .create_for_user(&admin, youtube(Some(source), "Move me"))
            .await
            .unwrap();
        service
            .asset_svc
            .repo
            .create_final(
                "move-owned-asset",
                CreateFinalAsset {
                    owner: parse_owner_record_id(&media.owner).unwrap(),
                    media_id: RecordId::new("media", media.id.clone()),
                    kind: MediaAssetKind::Video,
                    content_type: "video/mp4".into(),
                    byte_length: 1,
                    etag: "\"etag\"".into(),
                },
            )
            .await
            .unwrap();
        let moved = service
            .move_for_user(
                &admin,
                &media.id,
                MoveOwner {
                    owner: destination.clone(),
                },
            )
            .await
            .unwrap();
        assert_eq!(moved.owner, destination);
        let assets = service
            .asset_svc
            .repo
            .list_assets_for_media(&media.id)
            .await
            .unwrap();
        assert_eq!(assets.len(), 1);
        assert_eq!(assets[0].owner, moved.owner);

        let guest = auth_ctx_for_user(&db, &fixture.guest).await.unwrap();
        assert!(matches!(
            service
                .move_for_user(
                    &guest,
                    &media.id,
                    MoveOwner {
                        owner: fixture.shared_team_id
                    }
                )
                .await,
            Err(AppError::NotFound(_))
        ));
    }
}
