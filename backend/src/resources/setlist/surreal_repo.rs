use std::sync::Arc;

use async_trait::async_trait;
use surrealdb::types::RecordId;

use serde::Deserialize;
use surrealdb::types::SurrealValue;

use shared::api::ListQuery;
use shared::setlist::{CreateSetlist, Setlist};
use shared::song::LinkOwned as SongLinkOwned;

use crate::database::Database;
use crate::error::AppError;

use crate::resources::common::{
    SongLinkListRow, SongLinkRecord, belongs_to, resource_id, song_links_to_owned,
};

use super::model::SetlistRecord;
use super::repository::SetlistRepository;

#[derive(Clone)]
pub struct SurrealSetlistRepo {
    db: Arc<Database>,
}

impl SurrealSetlistRepo {
    pub fn new(db: Arc<Database>) -> Self {
        Self { db }
    }

    fn inner(&self) -> &Database {
        &self.db
    }
}

#[async_trait]
impl SetlistRepository for SurrealSetlistRepo {
    async fn get_setlists(
        &self,
        read_teams: &[RecordId],
        pagination: ListQuery,
    ) -> Result<Vec<Setlist>, AppError> {
        let db = self.inner();
        let q_nonempty = pagination.q.as_ref().is_some_and(|q| !q.trim().is_empty());
        let mut query = if q_nonempty {
            String::from(
                "SELECT *, (search::score(0) ?? 0) AS score FROM setlist WHERE owner IN $teams",
            )
        } else {
            String::from("SELECT * FROM setlist WHERE owner IN $teams")
        };
        if q_nonempty {
            query.push_str(
                " AND (title @0@ $q OR string::contains(string::lowercase(title), string::lowercase($q))) ORDER BY score DESC",
            );
        }
        let (offset, limit) = pagination.effective_offset_limit();
        query.push_str(" LIMIT $limit START $start");

        let mut request = db.db.query(query).bind(("teams", read_teams.to_vec()));
        if let Some(ref q) = pagination.q
            && !q.trim().is_empty()
        {
            request = request.bind(("q", q.trim().to_string()));
        }
        request = request.bind(("limit", limit)).bind(("start", offset));

        let mut response = request.await?;
        Ok(response
            .take::<Vec<SetlistRecord>>(0)?
            .into_iter()
            .map(SetlistRecord::into_setlist)
            .collect())
    }

    async fn count_setlists(
        &self,
        read_teams: &[RecordId],
        q: Option<&str>,
    ) -> Result<u64, AppError> {
        #[derive(Deserialize, SurrealValue)]
        struct CountResult {
            count: u64,
        }
        let q_nonempty = q.is_some_and(|s| !s.trim().is_empty());
        let mut query = String::from("SELECT count() FROM setlist WHERE owner IN $teams");
        if q_nonempty {
            query.push_str(
                " AND (title @0@ $q OR string::contains(string::lowercase(title), string::lowercase($q)))",
            );
        }
        query.push_str(" GROUP ALL");

        let mut request = self
            .inner()
            .db
            .query(query)
            .bind(("teams", read_teams.to_vec()));
        if q_nonempty {
            request = request.bind(("q", q.unwrap().trim().to_string()));
        }
        let mut response = request.await?;
        Ok(response
            .take::<Vec<CountResult>>(0)?
            .into_iter()
            .next()
            .map(|r| r.count)
            .unwrap_or(0))
    }

    async fn get_setlist(&self, read_teams: &[RecordId], id: &str) -> Result<Setlist, AppError> {
        let db = self.inner();
        let record: Option<SetlistRecord> = db.db.select(resource_id("setlist", id)?).await?;
        match record {
            Some(r) if belongs_to(&r.owner, read_teams) => Ok(r.into_setlist()),
            _ => Err(AppError::NotFound("setlist not found".into())),
        }
    }

    async fn get_setlist_songs(
        &self,
        read_teams: &[RecordId],
        id: &str,
    ) -> Result<Vec<SongLinkOwned>, AppError> {
        let db = self.inner();
        let (tb, sid) = resource_id("setlist", id)?;
        let mut response = db
            .db
            .query("SELECT owner, songs FROM type::record($tb, $sid)")
            .bind(("tb", tb))
            .bind(("sid", sid))
            .await?;

        let record = response
            .take::<Option<SongLinkListRow>>(0)?
            .ok_or_else(|| AppError::NotFound("setlist not found".into()))?;

        if !belongs_to(&record.owner, read_teams) {
            return Err(AppError::NotFound("setlist not found".into()));
        }

        song_links_to_owned(&db.db, record.songs).await
    }

    async fn create_setlist(
        &self,
        owner: RecordId,
        setlist: CreateSetlist,
    ) -> Result<Setlist, AppError> {
        let db = self.inner();
        db.db
            .create("setlist")
            .content(SetlistRecord::from_payload(None, Some(owner), setlist))
            .await?
            .map(SetlistRecord::into_setlist)
            .ok_or_else(|| AppError::database("failed to create setlist"))
    }

    async fn update_setlist(
        &self,
        write_teams: &[RecordId],
        id: &str,
        setlist: CreateSetlist,
        owner: Option<RecordId>,
    ) -> Result<Setlist, AppError> {
        let db = self.inner();
        let (tb, sid) = resource_id("setlist", id)?;
        let songs: Vec<SongLinkRecord> = setlist.songs.into_iter().map(Into::into).collect();
        let title = setlist.title;

        let mut response = if let Some(ref owner_rid) = owner {
            db.db
                .query(
                    "UPDATE type::record($tb, $sid) SET title = $title, songs = $songs, owner = $owner \
                     WHERE owner IN $teams RETURN AFTER",
                )
                .bind(("tb", tb))
                .bind(("sid", sid))
                .bind(("title", title))
                .bind(("songs", songs))
                .bind(("owner", owner_rid.clone()))
                .bind(("teams", write_teams.to_vec()))
                .await?
        } else {
            db.db
                .query(
                    "UPDATE type::record($tb, $sid) SET title = $title, songs = $songs \
                     WHERE owner IN $teams RETURN AFTER",
                )
                .bind(("tb", tb))
                .bind(("sid", sid))
                .bind(("title", title))
                .bind(("songs", songs))
                .bind(("teams", write_teams.to_vec()))
                .await?
        };

        let rows: Vec<SetlistRecord> = response.take(0)?;
        rows.into_iter()
            .next()
            .map(SetlistRecord::into_setlist)
            .ok_or_else(|| AppError::NotFound("setlist not found".into()))
    }

    async fn delete_setlist(
        &self,
        write_teams: &[RecordId],
        id: &str,
    ) -> Result<Setlist, AppError> {
        let db = self.inner();
        let (tb, sid) = resource_id("setlist", id)?;
        let mut response = db
            .db
            .query("DELETE FROM type::record($tb, $sid) WHERE owner IN $teams RETURN BEFORE")
            .bind(("tb", tb))
            .bind(("sid", sid))
            .bind(("teams", write_teams.to_vec()))
            .await?;

        let rows: Vec<SetlistRecord> = response.take(0)?;
        rows.into_iter()
            .next()
            .map(SetlistRecord::into_setlist)
            .ok_or_else(|| AppError::NotFound("setlist not found".into()))
    }

    async fn move_setlist_owner(
        &self,
        write_teams: &[RecordId],
        id: &str,
        new_owner: RecordId,
    ) -> Result<Setlist, AppError> {
        let db = self.inner();
        let (tb, sid) = resource_id("setlist", id)?;
        let mut response = db
            .db
            .query(
                "UPDATE type::record($tb, $sid) SET owner = $new_owner WHERE owner IN $teams RETURN AFTER",
            )
            .bind(("tb", tb))
            .bind(("sid", sid))
            .bind(("new_owner", new_owner))
            .bind(("teams", write_teams.to_vec()))
            .await?;

        let rows: Vec<SetlistRecord> = response.take(0)?;
        rows.into_iter()
            .next()
            .map(SetlistRecord::into_setlist)
            .ok_or_else(|| AppError::NotFound("setlist not found".into()))
    }
}
