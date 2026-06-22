use serde::{Deserialize, Serialize};
use surrealdb::types::{RecordId, SurrealValue};

use shared::setlist::{CreateSetlist, Setlist};

use crate::database::record_id_string;
use crate::resources::common::SetlistSongLinkRecord;

#[derive(Clone, Debug, Serialize, Deserialize, Default, SurrealValue)]
pub struct SetlistRecord {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    id: Option<RecordId>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub owner: Option<RecordId>,
    title: String,
    #[serde(default)]
    songs: Vec<SetlistSongLinkRecord>,
}

impl SetlistRecord {
    pub fn into_setlist(self) -> Setlist {
        Setlist {
            id: self.id.map(|r| record_id_string(&r)).unwrap_or_default(),
            owner: self.owner.map(|r| record_id_string(&r)).unwrap_or_default(),
            title: self.title,
            songs: self.songs.into_iter().map(Into::into).collect(),
        }
    }

    pub fn from_payload(
        id: Option<RecordId>,
        owner: Option<RecordId>,
        setlist: CreateSetlist,
    ) -> Self {
        let CreateSetlist { title, songs, .. } = setlist;
        Self {
            id,
            owner,
            title,
            songs: songs.into_iter().map(Into::into).collect(),
        }
    }
}

#[cfg(test)]
mod tests {
    use shared::setlist::SongLink;

    use super::*;

    #[test]
    fn setlist_record_from_payload_into_setlist() {
        let id = RecordId::new("setlist", "sl1");
        let owner = RecordId::new("team", "tm");
        let record = SetlistRecord::from_payload(
            Some(id.clone()),
            Some(owner.clone()),
            CreateSetlist {
                owner: None,
                title: "Sunday".into(),
                songs: vec![SongLink {
                    id: "s1".into(),
                    nr: Some("1".into()),
                    key: None,
                    tempo: None,
                    language: Some("de".into()),
                    flow: None,
                }],
            },
        );
        let setlist = record.into_setlist();
        assert_eq!(setlist.id, "sl1");
        assert_eq!(setlist.owner, "tm");
        assert_eq!(setlist.title, "Sunday");
        assert_eq!(setlist.songs.len(), 1);
        assert_eq!(setlist.songs[0].id, "s1");
        assert_eq!(setlist.songs[0].language.as_deref(), Some("de"));
    }

    #[test]
    fn setlist_record_song_flow_roundtrips_omitted_null_and_value() {
        let omitted = SetlistRecord::from_payload(
            Some(RecordId::new("setlist", "sl1")),
            Some(RecordId::new("team", "tm")),
            CreateSetlist {
                owner: None,
                title: "Sunday".into(),
                songs: vec![SongLink {
                    id: "s1".into(),
                    nr: Some("1".into()),
                    key: None,
                    tempo: None,
                    language: None,
                    flow: None,
                }],
            },
        );
        let omitted_json = serde_json::to_value(&omitted).expect("omit serialize");
        assert!(omitted_json["songs"][0]["flow"].is_null());
        let omitted_roundtrip: SetlistRecord =
            serde_json::from_value(omitted_json).expect("omit roundtrip");
        assert_eq!(omitted_roundtrip.title, "Sunday");

        let mut null_json = serde_json::to_value(&omitted).expect("null base");
        null_json["songs"][0]["flow"] = serde_json::Value::Null;
        let null_roundtrip: SetlistRecord =
            serde_json::from_value(null_json).expect("null roundtrip");
        let null_serialized = serde_json::to_value(&null_roundtrip).expect("null serialize");
        assert!(null_serialized["songs"][0]["flow"].is_null());

        let value_flow = SetlistRecord::from_payload(
            Some(RecordId::new("setlist", "sl1")),
            Some(RecordId::new("team", "tm")),
            CreateSetlist {
                owner: None,
                title: "Sunday".into(),
                songs: vec![SongLink {
                    id: "s1".into(),
                    nr: Some("1".into()),
                    key: None,
                    tempo: None,
                    language: None,
                    flow: Some(vec![chordlib::types::SongFlowItem {
                        title: "Verse".into(),
                        occurrence_index: 0,
                        repeats: 1,
                    }]),
                }],
            },
        );
        let value_json = serde_json::to_value(&value_flow).expect("value serialize");
        assert_eq!(value_json["songs"][0]["flow"][0]["title"], "Verse");
        let value_roundtrip: SetlistRecord =
            serde_json::from_value(value_json).expect("value roundtrip");
        assert_eq!(value_roundtrip.title, "Sunday");
    }

    #[tokio::test]
    async fn smoke_create_and_read_setlist() {
        use crate::resources::setlist::{SetlistService, SurrealSetlistRepo};
        use crate::test_helpers::{auth_ctx_for_user, seed_user, test_db};

        let db = test_db().await.expect("test db");
        let svc = SetlistService::new(SurrealSetlistRepo::new(db.clone()), db.clone());
        let user = seed_user(&db).await.expect("seed user");
        let ctx = auth_ctx_for_user(&db, &user).await.expect("auth ctx");
        let created = svc
            .create_setlist_for_user(
                &ctx,
                CreateSetlist {
                    owner: None,
                    title: "Smoke".to_string(),
                    songs: vec![],
                },
            )
            .await
            .expect("create setlist");
        let fetched = svc
            .get_setlist_for_user(&ctx, &created.id)
            .await
            .expect("get setlist");
        assert_eq!(fetched.title, "Smoke");
        assert_eq!(fetched.id, created.id);
        assert!(fetched.songs.is_empty());
    }
}
