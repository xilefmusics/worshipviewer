use serde::{Deserialize, Serialize};
use surrealdb::types::{Kind, RecordId, SurrealValue, Value, kind};

use chordlib::types::Song as SongData;
use shared::blob::BlobLink;
use shared::song::{CreateSong, Song, SongUserSpecificAddons};

use crate::database::record_id_string;
use crate::resources::common::blob_thing;

/// Newtype so [`SongData`] can round-trip through SurrealDB 3.x `SurrealValue` query results.
#[derive(Clone, Debug, Serialize, Deserialize, Default)]
#[serde(transparent)]
pub struct SongDataField(pub SongData);

impl std::ops::Deref for SongDataField {
    type Target = SongData;
    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

impl std::ops::DerefMut for SongDataField {
    fn deref_mut(&mut self) -> &mut Self::Target {
        &mut self.0
    }
}

impl SurrealValue for SongDataField {
    fn kind_of() -> Kind {
        kind!(any)
    }

    fn is_value(_value: &Value) -> bool {
        true
    }

    fn into_value(self) -> Value {
        let j = serde_json::to_value(self.0).unwrap_or(serde_json::Value::Null);
        json_strip_nulls(j).into_value()
    }

    fn from_value(value: Value) -> surrealdb::Result<Self> {
        let j = serde_json::Value::from_value(value)?;
        serde_json::from_value(j)
            .map(SongDataField)
            .map_err(|e| surrealdb::Error::internal(e.to_string()))
    }
}

/// SurrealDB 3 `SCHEMAFULL` maps JSON `null` to `NULL`, which does not satisfy `none | T` fields; omit keys instead.
fn json_strip_nulls(value: serde_json::Value) -> serde_json::Value {
    match value {
        serde_json::Value::Object(map) => {
            let mut out = serde_json::Map::with_capacity(map.len());
            for (k, v) in map {
                if v.is_null() {
                    continue;
                }
                out.insert(k, json_strip_nulls(v));
            }
            serde_json::Value::Object(out)
        }
        serde_json::Value::Array(items) => {
            serde_json::Value::Array(items.into_iter().map(json_strip_nulls).collect())
        }
        other => other,
    }
}

#[derive(Clone, Debug, Serialize, Deserialize, Default, SurrealValue)]
pub struct SongRecord {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub id: Option<RecordId>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub owner: Option<RecordId>,
    #[serde(default)]
    pub not_a_song: bool,
    #[serde(default)]
    pub blobs: Vec<RecordId>,
    pub data: SongDataField,
    #[serde(default)]
    pub search_content: String,
}

impl SongRecord {
    pub fn into_song(self) -> Song {
        Song {
            id: self.id.map(id_from_record).unwrap_or_default(),
            owner: self.owner.map(id_from_record).unwrap_or_default(),
            not_a_song: self.not_a_song,
            blobs: self
                .blobs
                .into_iter()
                .map(|t| BlobLink {
                    id: id_from_record(t),
                })
                .collect(),
            data: self.data.0,
            user_specific_addons: SongUserSpecificAddons::default(),
        }
    }

    pub fn from_payload(id: Option<RecordId>, owner: Option<RecordId>, song: CreateSong) -> Self {
        let CreateSong {
            not_a_song,
            blobs,
            data,
            ..
        } = song;
        let search_content = search_content_from_song_data(&data);
        Self {
            id,
            owner,
            not_a_song,
            blobs: blobs.into_iter().map(|blob| blob_thing(&blob.id)).collect(),
            data: SongDataField(data),
            search_content,
        }
    }
}

pub fn search_content_from_song_data(data: &SongData) -> String {
    let mut pieces: Vec<String> = Vec::new();
    for section in &data.sections {
        for line in &section.lines {
            for part in &line.parts {
                for text in &part.languages {
                    if !text.is_empty() {
                        pieces.push(text.clone());
                    }
                }
            }
        }
    }
    pieces.join(" ")
}

pub fn id_from_record(rid: RecordId) -> String {
    record_id_string(&rid)
}

#[derive(Clone, Debug, Serialize, Deserialize, SurrealValue)]
pub struct LikeRecord {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub id: Option<RecordId>,
    pub owner: RecordId,
    pub song: RecordId,
}

impl LikeRecord {
    pub fn new(owner: RecordId, song: RecordId) -> Self {
        Self {
            id: None,
            owner,
            song,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn song_record_into_song_maps_string_ids() {
        let record = SongRecord {
            id: Some(RecordId::new("song", "s1")),
            owner: Some(RecordId::new("team", "t9")),
            not_a_song: true,
            blobs: vec![RecordId::new("blob", "b1")],
            data: SongDataField(SongData::default()),
            search_content: String::new(),
        };
        let song = record.into_song();
        assert_eq!(song.id, "s1");
        assert_eq!(song.owner, "t9");
        assert!(song.not_a_song);
        assert_eq!(
            song.blobs,
            vec![BlobLink {
                id: "b1".to_string()
            }]
        );
    }

    #[test]
    fn song_record_from_payload_sets_search_content_and_blob_things() {
        let data: SongData = serde_json::from_str(
            r#"{
                "titles": ["T"],
                "sections": [{
                    "title": "V",
                    "lines": [{
                        "parts": [{
                            "languages": ["Hello", "world"],
                            "comment": false
                        }]
                    }]
                }]
            }"#,
        )
        .expect("song data json");
        let create = CreateSong {
            collection: "coll1".into(),
            not_a_song: false,
            blobs: vec![
                BlobLink {
                    id: "blob:bb".into(),
                },
                BlobLink {
                    id: "rawblob".into(),
                },
            ],
            data,
        };
        let record = SongRecord::from_payload(None, None, create);
        assert_eq!(record.blobs.len(), 2);
        assert_eq!(record.blobs[0].table.as_str(), "blob");
        assert_eq!(record.blobs[1].table.as_str(), "blob");
        assert_eq!(record.search_content, "Hello world");
    }

    #[test]
    fn search_content_from_song_data_empty() {
        assert_eq!(search_content_from_song_data(&SongData::default()), "");
    }

    #[test]
    fn search_content_from_song_data_joins_non_empty_languages() {
        let data: SongData = serde_json::from_str(
            r#"{
                "titles": ["T"],
                "sections": [{
                    "title": "V",
                    "lines": [{
                        "parts": [{
                            "languages": ["one", "two"],
                            "comment": false
                        }]
                    }]
                }]
            }"#,
        )
        .expect("song data json");
        assert_eq!(search_content_from_song_data(&data), "one two");
    }
}
