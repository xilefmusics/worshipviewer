use serde::{Deserialize, Serialize};
use surrealdb::types::{RecordId, SurrealValue};

use shared::collection::{Collection, CreateCollection};

use crate::database::record_id_string;
use crate::resources::common::{SongLinkRecord, blob_thing};

#[derive(Clone, Debug, Serialize, Deserialize, Default, SurrealValue)]
pub struct CollectionRecord {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub id: Option<RecordId>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub owner: Option<RecordId>,
    pub title: String,
    pub cover: Option<RecordId>,
    #[serde(default)]
    pub songs: Vec<SongLinkRecord>,
}

impl CollectionRecord {
    pub fn into_collection(self) -> Collection {
        Collection {
            id: self.id.map(|r| record_id_string(&r)).unwrap_or_default(),
            owner: self.owner.map(|r| record_id_string(&r)).unwrap_or_default(),
            title: self.title,
            cover: self.cover.map(|r| record_id_string(&r)).unwrap_or_default(),
            songs: self.songs.into_iter().map(Into::into).collect(),
        }
    }

    pub fn from_payload(
        id: Option<RecordId>,
        owner: Option<RecordId>,
        collection: CreateCollection,
    ) -> Self {
        let CreateCollection {
            title,
            cover,
            songs,
            ..
        } = collection;
        Self {
            id,
            owner,
            title,
            cover: Some(blob_thing(&cover)),
            songs: songs.into_iter().map(Into::into).collect(),
        }
    }
}

#[cfg(test)]
mod tests {
    use shared::song::Link as SongLink;

    use super::*;

    #[test]
    fn collection_record_from_payload_into_collection() {
        let id = RecordId::new("collection", "c1");
        let owner = RecordId::new("team", "tm");
        let record = CollectionRecord::from_payload(
            Some(id.clone()),
            Some(owner.clone()),
            CreateCollection {
                owner: None,
                title: "Hits".into(),
                cover: "blob:cover1".into(),
                songs: vec![SongLink {
                    id: "s1".into(),
                    nr: None,
                    key: None,
                    tempo: None,
                    language: None,
                }],
            },
        );
        let c = record.into_collection();
        assert_eq!(c.id, "c1");
        assert_eq!(c.owner, "tm");
        assert_eq!(c.title, "Hits");
        assert_eq!(c.cover, "cover1");
        assert_eq!(c.songs.len(), 1);
        assert_eq!(c.songs[0].id, "s1");
    }
}
