use crate::song::Link as SongLink;
use chordlib::types::SimpleChord;
use serde::{Deserialize, Serialize};

#[cfg(feature = "backend")]
use crate::song::SimpleChordSchema;

#[cfg(feature = "backend")]
#[allow(unused_imports)]
use serde_json::json;
#[cfg(feature = "backend")]
use utoipa::ToSchema;

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Default)]
#[cfg_attr(feature = "backend", derive(ToSchema))]
#[cfg_attr(
    feature = "backend",
    schema(example = json!({
        "id": "col_example",
        "owner": "usr_example",
        "title": "Sunday worship",
        "cover": "",
        "songs": [{ "id": "song_example", "nr": null, "key": null }]
    }))
)]
pub struct Collection {
    pub id: String,
    pub owner: String,
    pub title: String,
    /// Cover art reference (client-resolved blob id or URL).
    pub cover: String,
    pub songs: Vec<SongLink>,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Default)]
#[serde(deny_unknown_fields)]
#[cfg_attr(feature = "backend", derive(ToSchema))]
#[cfg_attr(
    feature = "backend",
    schema(example = json!({
        "title": "Sunday worship",
        "cover": "",
        "songs": [{ "id": "song_example", "nr": null, "key": null }],
        "owner": "team_example_id"
    }))
)]
pub struct CreateCollection {
    /// Owning team id (`team` record id, same format as `Collection.owner` in responses). Omit to create under the caller's personal team.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub owner: Option<String>,
    pub title: String,
    pub cover: String,
    pub songs: Vec<SongLink>,
}

/// Full replacement body for `PUT /api/v1/collections/{id}`.
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Default)]
#[serde(deny_unknown_fields)]
#[cfg_attr(feature = "backend", derive(ToSchema))]
pub struct UpdateCollection {
    pub title: String,
    pub cover: String,
    pub songs: Vec<SongLink>,
    /// Target team id for the collection's `owner`; omit or `null` to keep the current owner.
    #[serde(default)]
    pub owner: Option<String>,
}

impl From<UpdateCollection> for CreateCollection {
    fn from(value: UpdateCollection) -> Self {
        Self {
            owner: None,
            title: value.title,
            cover: value.cover,
            songs: value.songs,
        }
    }
}

/// Partial update for a collection. Absent fields are left unchanged.
#[derive(Deserialize, Debug, Clone, PartialEq, Default)]
#[serde(deny_unknown_fields)]
#[cfg_attr(feature = "backend", derive(ToSchema))]
pub struct PatchCollection {
    pub title: Option<String>,
    pub cover: Option<String>,
    pub songs: Option<Vec<SongLink>>,
    #[serde(default)]
    pub owner: Option<String>,
}

impl From<Collection> for CreateCollection {
    fn from(value: Collection) -> Self {
        Self {
            owner: None,
            title: value.title,
            cover: value.cover,
            songs: value.songs,
        }
    }
}

/// Move a song link from this collection into another (`POST …/collections/{id}/songs/{song_id}/transfer`).
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Default)]
#[serde(deny_unknown_fields)]
#[cfg_attr(feature = "backend", derive(ToSchema))]
#[cfg_attr(
    feature = "backend",
    schema(example = json!({
        "target": "col_target",
        "key": { "level": 3 },
        "nr": "3"
    }))
)]
pub struct TransferCollectionSong {
    /// Destination collection id.
    pub target: String,
    /// Optional slot key override from the editor row.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[cfg_attr(feature = "backend", schema(value_type = Option<SimpleChordSchema>))]
    pub key: Option<SimpleChord>,
    /// Optional slot number override from the editor row.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub nr: Option<String>,
}

/// Updated source and target collections after a successful transfer.
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
#[cfg_attr(feature = "backend", derive(ToSchema))]
pub struct TransferCollectionSongResult {
    pub source: Collection,
    pub target: Collection,
}
