use crate::blob::BlobLink;
use crate::patch::Patch;
use chordlib::inputs::chord_pro;
use chordlib::outputs::{FormatChordPro, FormatHTML};
use chordlib::types::{ChordRepresentation, Section, SimpleChord, Song as ChordSong};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::convert::TryFrom;

#[cfg(feature = "backend")]
#[allow(unused_imports)]
use serde_json::json;
#[cfg(feature = "backend")]
use utoipa::ToSchema;

#[cfg(feature = "backend")]
#[allow(unused_imports)]
use super::song_data_schema::{SectionSchema, SimpleChordSchema, SongDataSchema};

#[derive(Serialize, Deserialize, Debug, Default, PartialEq, Clone)]
#[cfg_attr(feature = "backend", derive(ToSchema))]
pub struct SongUserSpecificAddons {
    pub liked: bool,
}

#[derive(Serialize, Deserialize, Debug, Default, PartialEq, Clone)]
#[cfg_attr(feature = "backend", derive(ToSchema))]
pub struct Song {
    pub id: String,
    pub owner: String,
    /// When true, this record is not treated as a musical song (e.g. scripture or spoken content).
    pub not_a_song: bool,
    /// Linked blob assets (`id` is the blob resource identifier).
    pub blobs: Vec<BlobLink>,
    /// ChordPro-derived payload (sections, lyrics, metadata); see `SongDataSchema` in the OpenAPI components.
    #[cfg_attr(feature = "backend", schema(value_type = SongDataSchema))]
    pub data: ChordSong,
    /// Per-request flags such as whether the current user liked this song.
    pub user_specific_addons: SongUserSpecificAddons,
}

#[derive(Serialize, Deserialize, Debug, Default, PartialEq, Clone)]
#[serde(deny_unknown_fields)]
#[cfg_attr(feature = "backend", derive(ToSchema))]
#[cfg_attr(
    feature = "backend",
    schema(example = json!({
        "not_a_song": false,
        "blobs": [],
        "data": { "titles": ["Example Hymn"], "sections": [] },
        "owner": "team_example_id"
    }))
)]
pub struct CreateSong {
    /// Owning team id (same format as `Song.owner` in responses). Omit to create under the caller's personal team (and apply default-collection rules).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub owner: Option<String>,
    pub not_a_song: bool,
    pub blobs: Vec<BlobLink>,
    #[cfg_attr(feature = "backend", schema(value_type = SongDataSchema))]
    pub data: ChordSong,
}

/// Full replacement body for `PUT /api/v1/songs/{id}` (same fields as [`CreateSong`]; server-owned `id` is path-only).
#[derive(Serialize, Deserialize, Debug, Default, PartialEq, Clone)]
#[serde(deny_unknown_fields)]
#[cfg_attr(feature = "backend", derive(ToSchema))]
#[cfg_attr(
    feature = "backend",
    schema(example = json!({
        "not_a_song": false,
        "blobs": [],
        "data": { "titles": ["Example Hymn"], "sections": [] }
    }))
)]
pub struct UpdateSong {
    pub not_a_song: bool,
    pub blobs: Vec<BlobLink>,
    #[cfg_attr(feature = "backend", schema(value_type = SongDataSchema))]
    pub data: ChordSong,
    /// Target team id for the song's `owner`; omit or `null` to keep the current owner.
    #[serde(default)]
    pub owner: Option<String>,
}

impl From<UpdateSong> for CreateSong {
    fn from(value: UpdateSong) -> Self {
        Self {
            owner: None,
            not_a_song: value.not_a_song,
            blobs: value.blobs,
            data: value.data,
        }
    }
}

impl From<CreateSong> for UpdateSong {
    fn from(value: CreateSong) -> Self {
        Self {
            not_a_song: value.not_a_song,
            blobs: value.blobs,
            data: value.data,
            owner: None,
        }
    }
}

impl UpdateSong {
    pub fn validate(&self) -> Result<(), String> {
        CreateSong::from(self.clone()).validate()
    }
}

/// Partial update for a song. Absent fields are left unchanged.
#[derive(Deserialize, Debug, Default, PartialEq, Clone)]
#[serde(deny_unknown_fields)]
#[cfg_attr(feature = "backend", derive(ToSchema))]
#[cfg_attr(
    feature = "backend",
    schema(example = json!({ "not_a_song": false }))
)]
pub struct PatchSong {
    pub not_a_song: Option<bool>,
    pub blobs: Option<Vec<BlobLink>>,
    #[cfg_attr(feature = "backend", schema(value_type = PatchSongData))]
    pub data: Option<PatchSongData>,
    /// Set the song's owning team id; omit to leave unchanged.
    #[serde(default)]
    pub owner: Option<String>,
}

/// Partial update for song metadata.
///
/// `Patch<T>` fields preserve 3-state behavior for nullable members:
/// - `Missing`: keep existing value
/// - `Null`: clear the value
/// - `Value(v)`: set a new value
#[derive(Deserialize, Debug, Default, PartialEq, Clone)]
#[serde(deny_unknown_fields)]
#[cfg_attr(feature = "backend", derive(ToSchema))]
pub struct PatchSongData {
    pub titles: Option<Vec<String>>,
    #[serde(default)]
    #[cfg_attr(feature = "backend", schema(value_type = Option<String>))]
    pub subtitle: Patch<String>,
    #[serde(default)]
    #[cfg_attr(feature = "backend", schema(value_type = Option<String>))]
    pub copyright: Patch<String>,
    #[serde(default)]
    #[cfg_attr(feature = "backend", schema(value_type = Option<SimpleChordSchema>))]
    pub key: Patch<SimpleChord>,
    pub artists: Option<Vec<String>>,
    /// BCP 47 language tags (e.g. `en`, `de-CH`).
    pub languages: Option<Vec<String>>,
    /// Tempo in BPM (beats per minute).
    #[serde(default)]
    #[cfg_attr(feature = "backend", schema(value_type = Option<u32>))]
    pub tempo: Patch<u32>,
    #[serde(default)]
    #[cfg_attr(feature = "backend", schema(value_type = Option<[u32; 2]>))]
    pub time: Patch<(u32, u32)>,
    #[cfg_attr(feature = "backend", schema(value_type = Option<Object>, additional_properties = true))]
    pub tags: Option<BTreeMap<String, String>>,
    #[cfg_attr(feature = "backend", schema(value_type = Option<Vec<SectionSchema>>))]
    pub sections: Option<Vec<Section>>,
}

impl TryFrom<&str> for CreateSong {
    type Error = chordlib::Error;

    fn try_from(s: &str) -> Result<Self, Self::Error> {
        Ok(Self {
            owner: None,
            not_a_song: false,
            blobs: vec![],
            data: chord_pro::load_string(s)?,
        })
    }
}

impl TryFrom<&str> for Song {
    type Error = chordlib::Error;

    fn try_from(s: &str) -> Result<Self, Self::Error> {
        CreateSong::try_from(s).map(Into::into)
    }
}

impl CreateSong {
    pub fn format_chord_pro(
        &self,
        representation: Option<&ChordRepresentation>,
        key: Option<&SimpleChord>,
        language: Option<usize>,
        worship_pro_features: bool,
    ) -> String {
        (&self.data).format_chord_pro(key, representation, language, worship_pro_features)
    }

    pub fn format_html(
        &self,
        key: Option<&SimpleChord>,
        representation: Option<&ChordRepresentation>,
        language: Option<usize>,
        scale: Option<f32>,
    ) -> (String, String) {
        (&self.data).format_html_page(key, representation, language, scale)
    }

    /// Reject oversized blob reference lists before hitting the service layer.
    pub fn validate(&self) -> Result<(), String> {
        use crate::validation_limits::MAX_BLOBS_PER_SONG;
        if let Some(ref o) = self.owner {
            if o.trim().is_empty() {
                return Err("owner must not be empty or whitespace-only".to_owned());
            }
        }
        if self.blobs.len() > MAX_BLOBS_PER_SONG {
            return Err(format!(
                "too many blob references (max {MAX_BLOBS_PER_SONG})"
            ));
        }
        Ok(())
    }
}

impl Song {
    pub fn format_chord_pro(
        &self,
        representation: Option<&ChordRepresentation>,
        key: Option<&SimpleChord>,
        language: Option<usize>,
        worship_pro_features: bool,
    ) -> String {
        (&self.data).format_chord_pro(key, representation, language, worship_pro_features)
    }

    pub fn format_html(
        &self,
        key: Option<&SimpleChord>,
        representation: Option<&ChordRepresentation>,
        language: Option<usize>,
        scale: Option<f32>,
    ) -> (String, String) {
        (&self.data).format_html_page(key, representation, language, scale)
    }
}

impl From<CreateSong> for Song {
    fn from(value: CreateSong) -> Self {
        Self {
            id: String::new(),
            owner: String::new(),
            not_a_song: value.not_a_song,
            blobs: value.blobs,
            data: value.data,
            user_specific_addons: SongUserSpecificAddons::default(),
        }
    }
}

impl From<Song> for CreateSong {
    fn from(value: Song) -> Self {
        Self {
            owner: None,
            not_a_song: value.not_a_song,
            blobs: value.blobs,
            data: value.data,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn create_song_json_uses_metadata_vectors() {
        let json = r#"{"not_a_song":false,"blobs":[],"data":{"titles":["Hello"],"artists":["A"],"languages":["en"],"sections":[]}}"#;
        let s: CreateSong = serde_json::from_str(json).unwrap();
        assert_eq!(s.data.title(), "Hello");
        assert_eq!(s.data.artist(), "A");
        assert_eq!(s.data.language(), "en");
    }

    #[test]
    fn create_song_validate_rejects_too_many_blobs() {
        use crate::validation_limits::MAX_BLOBS_PER_SONG;
        let mut s = CreateSong {
            owner: None,
            not_a_song: false,
            blobs: vec![],
            data: chordlib::types::Song::default(),
        };
        s.blobs = (0..=MAX_BLOBS_PER_SONG)
            .map(|i| BlobLink {
                id: format!("b{i}"),
            })
            .collect();
        assert!(s.validate().is_err());
        s.blobs.pop();
        assert!(s.validate().is_ok());
    }
}
