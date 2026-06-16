use serde::{Deserialize, Serialize};
use surrealdb::types::{RecordId, SurrealValue};

use shared::setlist::{CreateSetlist, Setlist};

use crate::database::record_id_string;
use crate::resources::common::SongLinkRecord;

#[derive(Clone, Debug, Serialize, Deserialize, Default, SurrealValue)]
pub struct SetlistRecord {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    id: Option<RecordId>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub owner: Option<RecordId>,
    title: String,
    #[serde(default)]
    songs: Vec<SongLinkRecord>,
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
    use shared::song::Link as SongLink;

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
