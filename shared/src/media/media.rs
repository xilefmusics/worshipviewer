use crate::api::ListQuery;
use serde::{Deserialize, Serialize};

#[cfg(feature = "backend")]
use utoipa::ToSchema;

/// A staged slide-deck revision that has not replaced active content yet.
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
#[cfg_attr(feature = "backend", derive(ToSchema))]
pub struct MediaPendingRevision {
    pub revision_id: String,
    pub pages: Vec<MediaStagedDeckPage>,
}

/// A page in a staged (not yet committed) slide-deck revision.
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
#[cfg_attr(feature = "backend", derive(ToSchema))]
pub struct MediaStagedDeckPage {
    pub id: String,
    pub blob_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub section_title: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
#[cfg_attr(feature = "backend", derive(ToSchema))]
pub enum LivestreamType {
    Hls,
    Direct,
}

#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
#[cfg_attr(feature = "backend", derive(ToSchema))]
pub enum SpotifyResourceType {
    Track,
    Playlist,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Eq)]
#[serde(tag = "type", rename_all = "snake_case", deny_unknown_fields)]
#[cfg_attr(feature = "backend", derive(ToSchema))]
pub enum MediaContent {
    Image {
        blob_id: String,
    },
    SlideDeck {
        pages: Vec<MediaDeckPage>,
    },
    Video {
        blob_id: String,
        duration_ms: u64,
        width: u32,
        height: u32,
    },
    Audio {
        blob_id: String,
        duration_ms: u64,
    },
    #[serde(rename = "youtube")]
    YouTube {
        video_id: String,
        canonical_url: String,
    },
    Spotify {
        resource_type: SpotifyResourceType,
        spotify_id: String,
        canonical_url: String,
    },
    Livestream {
        url: String,
        stream_type: LivestreamType,
    },
    WebPage {
        url: String,
    },
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
#[cfg_attr(feature = "backend", derive(ToSchema))]
pub struct MediaDeckPage {
    pub blob_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub section_title: Option<String>,
}

/// Uploaded media kind accepted by synchronous multipart creation.
#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
#[cfg_attr(feature = "backend", derive(ToSchema))]
pub enum UploadedMediaKind {
    Image,
    SlideDeck,
    Video,
    Audio,
}

impl UploadedMediaKind {
    pub fn parse(value: &str) -> Option<Self> {
        match value {
            "image" => Some(Self::Image),
            "slide_deck" => Some(Self::SlideDeck),
            "video" => Some(Self::Video),
            "audio" => Some(Self::Audio),
            _ => None,
        }
    }
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
#[cfg_attr(feature = "backend", derive(ToSchema))]
pub struct Media {
    pub id: String,
    pub owner: String,
    pub title: String,
    pub content: MediaContent,
    #[serde(default)]
    pub is_background: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub pending_revision: Option<MediaPendingRevision>,
}

/// Metadata part for synchronous multipart uploaded-media creation.
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
#[cfg_attr(feature = "backend", derive(ToSchema))]
pub struct CreateUploadedMedia {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub owner: Option<String>,
    pub title: String,
    /// Whether the uploaded item should appear in AV background selection.
    #[serde(default)]
    pub is_background: bool,
}

/// Create a synchronously validated URL-backed media resource.
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
#[cfg_attr(feature = "backend", derive(ToSchema))]
pub struct CreateMedia {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub owner: Option<String>,
    pub title: String,
    pub content: CreateMediaContent,
    /// URL-backed media cannot be selected as an AV background in v1.
    #[serde(default)]
    pub is_background: bool,
}

/// URL content accepted by E5.1. Uploaded/deck and legacy URL tags on
/// [`MediaContent`] cannot be fabricated through this request.
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Eq)]
#[serde(tag = "type", rename_all = "snake_case", deny_unknown_fields)]
#[cfg_attr(feature = "backend", derive(ToSchema))]
pub enum CreateMediaContent {
    #[serde(rename = "youtube")]
    YouTube {
        url: String,
    },
    Spotify {
        url: String,
    },
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
#[cfg_attr(feature = "backend", derive(ToSchema))]
pub struct UpdateMedia {
    pub title: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub content: Option<CreateMediaContent>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub owner: Option<String>,
    /// Omit to preserve the current value.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub is_background: Option<bool>,
}

/// Media list filters; kept separate from shared ListQuery so other resource endpoints
/// do not expose media-specific query parameters.
#[derive(Clone, Debug, Default, Serialize, Deserialize, PartialEq, Eq)]
pub struct MediaListQuery {
    pub page: Option<u32>,
    pub page_size: Option<u32>,
    pub q: Option<String>,
    pub team: Option<String>,
    pub is_background: Option<bool>,
}

impl MediaListQuery {
    pub fn validate(self) -> Result<Self, String> {
        let validated = to_shared_list_query(&self).validate()?;
        Ok(Self {
            page: validated.page,
            page_size: validated.page_size,
            q: validated.q,
            team: validated.team,
            is_background: self.is_background,
        })
    }

    pub fn effective_offset_limit(&self) -> (u32, u32) {
        to_shared_list_query(self).effective_offset_limit()
    }

    pub fn query_string_for_page(&self, page: u32) -> String {
        let mut query = to_shared_list_query(self);
        query.page = Some(page);
        let mut parts = query.to_query_string().trim_start_matches('?').to_owned();
        if let Some(is_background) = self.is_background {
            if !parts.is_empty() {
                parts.push('&');
            }
            parts.push_str(&format!("is_background={is_background}"));
        }
        parts
    }
}

fn to_shared_list_query(query: &MediaListQuery) -> ListQuery {
    ListQuery {
        page: query.page,
        page_size: query.page_size,
        q: query.q.clone(),
        team: query.team.clone(),
    }
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Eq, Default)]
#[serde(deny_unknown_fields)]
#[cfg_attr(feature = "backend", derive(ToSchema))]
pub struct DuplicateMedia {
    /// Destination team. Omit to keep the source owner.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub owner: Option<String>,
    /// Title for the copy. Omit to reuse the source title.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
}

/// Finalize a staged slide-deck revision in the operator-selected order.
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
#[cfg_attr(feature = "backend", derive(ToSchema))]
pub struct CommitDeck {
    pub revision_id: String,
    pub page_ids: Vec<String>,
    /// Optional section titles in the same order as `page_ids`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub section_titles: Option<Vec<Option<String>>>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn all_content_tags_round_trip() {
        let values = [
            serde_json::json!({"type":"image","blob_id":"b1"}),
            serde_json::json!({"type":"slide_deck","pages":[{"blob_id":"b1","section_title":"Intro"}]}),
            serde_json::json!({"type":"video","blob_id":"b1","duration_ms":1,"width":2,"height":3}),
            serde_json::json!({"type":"audio","blob_id":"b1","duration_ms":1}),
            serde_json::json!({"type":"youtube","video_id":"dQw4w9WgXcQ","canonical_url":"https://www.youtube.com/watch?v=dQw4w9WgXcQ"}),
            serde_json::json!({"type":"spotify","resource_type":"track","spotify_id":"4iV5W9uYEdYUVa79Axb7Rh","canonical_url":"https://open.spotify.com/track/4iV5W9uYEdYUVa79Axb7Rh"}),
            serde_json::json!({"type":"livestream","url":"https://example.com/live.m3u8","stream_type":"hls"}),
            serde_json::json!({"type":"web_page","url":"https://example.com/"}),
        ];
        for value in values {
            let parsed: MediaContent = serde_json::from_value(value.clone()).unwrap();
            assert_eq!(serde_json::to_value(parsed).unwrap(), value);
        }
    }

    #[test]
    fn pending_revision_is_optional_and_unknown_tags_are_stable() {
        let value = serde_json::json!({
            "id":"m1", "owner":"t1", "title":"Video",
            "content":{"type":"youtube","video_id":"dQw4w9WgXcQ","canonical_url":"https://www.youtube.com/watch?v=dQw4w9WgXcQ"}
        });
        let media: Media = serde_json::from_value(value).unwrap();
        assert!(media.pending_revision.is_none());
        assert!(!media.is_background);
        assert!(
            serde_json::from_value::<MediaContent>(serde_json::json!({"type":"future"})).is_err()
        );
    }

    #[test]
    fn uploaded_media_kind_parses() {
        for (raw, expected) in [
            ("image", UploadedMediaKind::Image),
            ("video", UploadedMediaKind::Video),
            ("audio", UploadedMediaKind::Audio),
            ("slide_deck", UploadedMediaKind::SlideDeck),
        ] {
            assert_eq!(UploadedMediaKind::parse(raw), Some(expected));
        }
    }

    #[test]
    fn background_filter_is_preserved_in_pagination_links() {
        let query = MediaListQuery {
            page: Some(0),
            page_size: Some(10),
            q: Some("sunset".into()),
            team: Some("team:1".into()),
            is_background: Some(true),
        };
        let link = query.query_string_for_page(1);
        assert!(link.contains("page=1"));
        assert!(link.contains("page_size=10"));
        assert!(link.contains("q=sunset"));
        assert!(link.contains("team=team:1"));
        assert!(link.contains("is_background=true"));
    }

    #[test]
    fn pending_revision_pages_default_and_commit_round_trip() {
        let pending: MediaPendingRevision = serde_json::from_value(serde_json::json!({
            "revision_id": "rev1",
            "pages": [{"id": "p1", "blob_id": "b1", "section_title": "Intro"}]
        }))
        .unwrap();
        assert_eq!(pending.pages[0].id, "p1");
        assert_eq!(pending.pages[0].section_title.as_deref(), Some("Intro"));
        let commit: CommitDeck = serde_json::from_value(serde_json::json!({
            "revision_id": "rev1",
            "page_ids": ["p1"]
        }))
        .unwrap();
        assert_eq!(commit.page_ids, vec!["p1"]);
    }
}
