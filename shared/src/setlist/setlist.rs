use chordlib::types::SongFlowItem;
use serde::{Deserialize, Serialize};

#[cfg(feature = "backend")]
use crate::song::SongFlowItemSchema;
#[cfg(feature = "backend")]
#[allow(unused_imports)]
use serde_json::json;
#[cfg(feature = "backend")]
use utoipa::ToSchema;

#[derive(Serialize, Deserialize, Debug, Default, PartialEq, Clone)]
#[cfg_attr(feature = "backend", derive(ToSchema))]
#[cfg_attr(
    feature = "backend",
    schema(example = json!({
        "id": "set_example",
        "owner": "usr_example",
        "title": "Easter Sunday",
        "songs": [{ "id": "song_example", "nr": "1", "key": null, "flow": null }]
    }))
)]
pub struct Setlist {
    pub id: String,
    pub owner: String,
    pub title: String,
    pub songs: Vec<SongLink>,
}

#[derive(Serialize, Deserialize, Debug, Default, PartialEq, Clone)]
#[cfg_attr(feature = "backend", derive(ToSchema))]
#[cfg_attr(feature = "backend", schema(as = SetlistSongLink))]
pub struct SongLink {
    /// Song record id.
    pub id: String,
    /// Optional display position in the parent list (e.g. `1`, `2a`).
    pub nr: Option<String>,
    /// Transposition key for this slot (same `{ "level": … }` object as `Song.data.key`).
    #[cfg_attr(feature = "backend", schema(value_type = Option<crate::song::SimpleChordSchema>))]
    pub key: Option<chordlib::types::SimpleChord>,
    /// Tempo override in BPM for this slot; `None` inherits the song's `data.tempo`.
    pub tempo: Option<u32>,
    /// Language override for this slot; `None` inherits the song's default language.
    pub language: Option<String>,
    /// Custom section order and repeats for this setlist slot.
    #[cfg_attr(feature = "backend", schema(value_type = Option<Vec<SongFlowItemSchema>>))]
    pub flow: Option<Vec<SongFlowItem>>,
}

#[derive(Serialize, Deserialize, Debug, Default, PartialEq, Clone)]
#[serde(deny_unknown_fields)]
#[cfg_attr(feature = "backend", derive(ToSchema))]
#[cfg_attr(
    feature = "backend",
    schema(example = json!({
        "title": "Easter Sunday",
        "songs": [{ "id": "song_example", "nr": "1", "key": null, "flow": null }],
        "owner": "team_example_id"
    }))
)]
pub struct CreateSetlist {
    /// Owning team id (same format as `Setlist.owner` in responses). Omit to create under the caller's personal team.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub owner: Option<String>,
    pub title: String,
    pub songs: Vec<SongLink>,
}

/// Full replacement body for `PUT /api/v1/setlists/{id}`.
#[derive(Serialize, Deserialize, Debug, Default, PartialEq, Clone)]
#[serde(deny_unknown_fields)]
#[cfg_attr(feature = "backend", derive(ToSchema))]
pub struct UpdateSetlist {
    pub title: String,
    pub songs: Vec<SongLink>,
    /// Target team id for the setlist's `owner`; omit or `null` to keep the current owner.
    #[serde(default)]
    pub owner: Option<String>,
}

impl From<CreateSetlist> for UpdateSetlist {
    fn from(value: CreateSetlist) -> Self {
        Self {
            title: value.title,
            songs: value.songs,
            owner: None,
        }
    }
}

impl From<UpdateSetlist> for CreateSetlist {
    fn from(value: UpdateSetlist) -> Self {
        Self {
            owner: None,
            title: value.title,
            songs: value.songs,
        }
    }
}

/// Partial update for a setlist. Absent fields are left unchanged.
#[derive(Deserialize, Debug, Default, PartialEq, Clone)]
#[serde(deny_unknown_fields)]
#[cfg_attr(feature = "backend", derive(ToSchema))]
pub struct PatchSetlist {
    pub title: Option<String>,
    pub songs: Option<Vec<SongLink>>,
    #[serde(default)]
    pub owner: Option<String>,
}

impl From<Setlist> for CreateSetlist {
    fn from(value: Setlist) -> Self {
        Self {
            owner: None,
            title: value.title,
            songs: value.songs,
        }
    }
}
