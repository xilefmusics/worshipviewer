use std::sync::Arc;

use async_trait::async_trait;
use surrealdb::types::RecordId;

use serde::Deserialize;
use surrealdb::types::SurrealValue;

use shared::api::ListQuery;
use shared::collection::{Collection, CreateCollection};
use shared::song::{Link as SongLink, LinkOwned as SongLinkOwned};

use crate::database::{Database, surreal_take_errors};
use crate::error::AppError;
use crate::resources::common::{
    SongLinkListRow, SongLinkRecord, belongs_to, blob_thing, resource_id, song_links_to_owned,
    song_thing,
};

use super::model::CollectionRecord;
use super::repository::CollectionRepository;

#[derive(Clone)]
pub struct SurrealCollectionRepo {
    db: Arc<Database>,
}

impl SurrealCollectionRepo {
    pub fn new(db: Arc<Database>) -> Self {
        Self { db }
    }

    fn inner(&self) -> &Database {
        &self.db
    }
}

#[async_trait]
impl CollectionRepository for SurrealCollectionRepo {
    async fn get_collections(
        &self,
        read_teams: &[RecordId],
        pagination: ListQuery,
    ) -> Result<Vec<Collection>, AppError> {
        let db = self.inner();
        let q_nonempty = pagination.q.as_ref().is_some_and(|q| !q.trim().is_empty());
        let mut query = if q_nonempty {
            String::from(
                "SELECT *, (search::score(0) ?? 0) AS score FROM collection WHERE owner IN $teams",
            )
        } else {
            String::from("SELECT * FROM collection WHERE owner IN $teams")
        };
        if q_nonempty {
            query.push_str(" AND title @0@ $q ORDER BY score DESC");
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
            .take::<Vec<CollectionRecord>>(0)?
            .into_iter()
            .map(CollectionRecord::into_collection)
            .collect())
    }

    async fn count_collections(
        &self,
        read_teams: &[RecordId],
        q: Option<&str>,
    ) -> Result<u64, AppError> {
        #[derive(Deserialize, SurrealValue)]
        struct CountResult {
            count: u64,
        }
        let q_nonempty = q.is_some_and(|s| !s.trim().is_empty());
        let mut query = String::from("SELECT count() FROM collection WHERE owner IN $teams");
        if q_nonempty {
            query.push_str(" AND title @0@ $q");
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

    async fn get_collection(
        &self,
        read_teams: &[RecordId],
        id: &str,
    ) -> Result<Collection, AppError> {
        let db = self.inner();
        let record: Option<CollectionRecord> = db.db.select(resource_id("collection", id)?).await?;
        match record {
            Some(r) if belongs_to(&r.owner, read_teams) => Ok(r.into_collection()),
            _ => Err(AppError::NotFound("collection not found".into())),
        }
    }

    async fn get_collection_songs(
        &self,
        read_teams: &[RecordId],
        id: &str,
    ) -> Result<Vec<SongLinkOwned>, AppError> {
        let db = self.inner();
        let (tb, sid) = resource_id("collection", id)?;
        let mut response = db
            .db
            .query("SELECT owner, songs FROM type::record($tb, $sid)")
            .bind(("tb", tb))
            .bind(("sid", sid))
            .await?;

        let record = response
            .take::<Option<SongLinkListRow>>(0)?
            .ok_or_else(|| AppError::NotFound("collection not found".into()))?;

        if !belongs_to(&record.owner, read_teams) {
            return Err(AppError::NotFound("collection not found".into()));
        }

        song_links_to_owned(&db.db, record.songs).await
    }

    async fn create_collection(
        &self,
        owner: RecordId,
        collection: CreateCollection,
    ) -> Result<Collection, AppError> {
        let db = self.inner();
        db.db
            .create("collection")
            .content(CollectionRecord::from_payload(
                None,
                Some(owner),
                collection,
            ))
            .await?
            .map(CollectionRecord::into_collection)
            .ok_or_else(|| AppError::database("failed to create collection"))
    }

    async fn update_collection(
        &self,
        write_teams: &[RecordId],
        id: &str,
        collection: CreateCollection,
        owner: Option<RecordId>,
    ) -> Result<Collection, AppError> {
        let db = self.inner();
        let (tb, sid) = resource_id("collection", id)?;
        let songs: Vec<SongLinkRecord> = collection.songs.into_iter().map(Into::into).collect();
        let cover = blob_thing(&collection.cover);
        let title = collection.title;

        let mut response = if let Some(ref owner_rid) = owner {
            db.db
                .query(
                    "UPDATE type::record($tb, $sid) SET title = $title, cover = $cover, songs = $songs, \
                     owner = $owner WHERE owner IN $teams RETURN AFTER",
                )
                .bind(("tb", tb))
                .bind(("sid", sid))
                .bind(("title", title))
                .bind(("cover", cover))
                .bind(("songs", songs))
                .bind(("owner", owner_rid.clone()))
                .bind(("teams", write_teams.to_vec()))
                .await?
        } else {
            db.db
                .query(
                    "UPDATE type::record($tb, $sid) SET title = $title, cover = $cover, songs = $songs \
                     WHERE owner IN $teams RETURN AFTER",
                )
                .bind(("tb", tb))
                .bind(("sid", sid))
                .bind(("title", title))
                .bind(("cover", cover))
                .bind(("songs", songs))
                .bind(("teams", write_teams.to_vec()))
                .await?
        };

        let rows: Vec<CollectionRecord> = response.take(0)?;
        rows.into_iter()
            .next()
            .map(CollectionRecord::into_collection)
            .ok_or_else(|| AppError::NotFound("collection not found".into()))
    }

    async fn delete_collection(
        &self,
        write_teams: &[RecordId],
        id: &str,
    ) -> Result<Collection, AppError> {
        let db = self.inner();
        let (tb, sid) = resource_id("collection", id)?;
        let mut response = db
            .db
            .query("DELETE FROM type::record($tb, $sid) WHERE owner IN $teams RETURN BEFORE")
            .bind(("tb", tb))
            .bind(("sid", sid))
            .bind(("teams", write_teams.to_vec()))
            .await?;

        let rows: Vec<CollectionRecord> = response.take(0)?;
        rows.into_iter()
            .next()
            .map(CollectionRecord::into_collection)
            .ok_or_else(|| AppError::NotFound("collection not found".into()))
    }

    async fn move_collection_owner(
        &self,
        write_teams: &[RecordId],
        id: &str,
        new_owner: RecordId,
    ) -> Result<Collection, AppError> {
        let db = self.inner();
        let (tb, sid) = resource_id("collection", id)?;
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

        let rows: Vec<CollectionRecord> = response.take(0)?;
        rows.into_iter()
            .next()
            .map(CollectionRecord::into_collection)
            .ok_or_else(|| AppError::NotFound("collection not found".into()))
    }

    async fn add_song_to_collection(
        &self,
        write_teams: &[RecordId],
        id: &str,
        song_link: SongLink,
    ) -> Result<(), AppError> {
        let db = self.inner();
        let mut response = db
            .db
            .query(
                r#"UPDATE type::record("collection", $id) SET songs = array::append(songs, $song) WHERE owner IN $teams;"#,
            )
            .bind(("id", id.to_owned()))
            .bind(("teams", write_teams.to_vec()))
            .bind(("song", SongLinkRecord::from(song_link)))
            .await?;

        surreal_take_errors("collection.add_song_to_collection", &mut response)?;
        let _ = response.check().map_err(|e| {
            crate::log_and_convert!(
                AppError::database,
                "collection.add_song_to_collection.check",
                e
            )
        })?;

        Ok(())
    }

    async fn transfer_song_link_between_collections(
        &self,
        write_teams: &[RecordId],
        source_id: &str,
        target_id: &str,
        song_id: &str,
        link: SongLink,
    ) -> Result<(Collection, Collection), AppError> {
        let db = self.inner();
        let song_rid = song_thing(song_id);
        let link_record = SongLinkRecord::from(link);
        let teams = write_teams.to_vec();

        let mut response = db
            .db
            .query(
                r#"UPDATE type::record("collection", $source_id)
  SET songs = fn::song_link_array_without_song(songs, $song_rid)
  WHERE owner IN $teams AND $song_rid INSIDE array::map(songs, |$e| $e.id)
  RETURN AFTER;
UPDATE type::record("collection", $target_id)
  SET songs = array::append(songs, $link)
  WHERE owner IN $teams AND NOT ($song_rid INSIDE array::map(songs, |$e| $e.id))
  RETURN AFTER;"#,
            )
            .bind(("source_id", source_id.to_owned()))
            .bind(("target_id", target_id.to_owned()))
            .bind(("song_rid", song_rid))
            .bind(("link", link_record))
            .bind(("teams", teams))
            .await?;

        surreal_take_errors(
            "collection.transfer_song_link_between_collections",
            &mut response,
        )?;

        let source_rows: Vec<CollectionRecord> = response.take(0)?;
        let target_rows: Vec<CollectionRecord> = response.take(1)?;

        let source = source_rows
            .into_iter()
            .next()
            .map(CollectionRecord::into_collection)
            .ok_or_else(|| {
                AppError::NotFound(
                    "song not found in source collection or collection not writable".into(),
                )
            })?;
        let target = target_rows
            .into_iter()
            .next()
            .map(CollectionRecord::into_collection)
            .ok_or_else(|| {
                AppError::NotFound(
                    "target collection not found, not writable, or song already present".into(),
                )
            })?;

        Ok((source, target))
    }

    async fn remove_song_link_from_collection(
        &self,
        write_teams: &[RecordId],
        source_id: &str,
        song_id: &str,
    ) -> Result<Collection, AppError> {
        let db = self.inner();
        let song_rid = song_thing(song_id);
        let mut response = db
            .db
            .query(
                r#"UPDATE type::record("collection", $source_id)
  SET songs = fn::song_link_array_without_song(songs, $song_rid)
  WHERE owner IN $teams AND $song_rid INSIDE array::map(songs, |$e| $e.id)
  RETURN AFTER;"#,
            )
            .bind(("source_id", source_id.to_owned()))
            .bind(("song_rid", song_rid))
            .bind(("teams", write_teams.to_vec()))
            .await?;

        surreal_take_errors("collection.remove_song_link_from_collection", &mut response)?;

        let rows: Vec<CollectionRecord> = response.take(0)?;
        rows.into_iter()
            .next()
            .map(CollectionRecord::into_collection)
            .ok_or_else(|| {
                AppError::NotFound(
                    "song not found in source collection or collection not writable".into(),
                )
            })
    }
}
