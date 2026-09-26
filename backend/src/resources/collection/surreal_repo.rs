use std::collections::HashSet;
use std::sync::Arc;

use async_trait::async_trait;
use serde::Deserialize;
use surrealdb::engine::any::Any;
use surrealdb::method::Transaction;
use surrealdb::types::RecordId;
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
use crate::resources::team::thing_record_key;

use super::model::CollectionRecord;
use super::repository::CollectionRepository;

#[derive(Deserialize, SurrealValue)]
struct CollectionMembershipLockRecord {
    revision: i64,
}

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

fn unique_song_record_ids(links: &[SongLink]) -> Vec<RecordId> {
    let mut seen = HashSet::new();
    links
        .iter()
        .filter_map(|link| {
            let id = song_thing(&link.id);
            seen.insert(thing_record_key(&id)).then_some(id)
        })
        .collect()
}

fn new_song_record_ids(current: &[SongLink], proposed: &[SongLink]) -> Vec<RecordId> {
    let current_ids: HashSet<String> = unique_song_record_ids(current)
        .iter()
        .map(thing_record_key)
        .collect();
    unique_song_record_ids(proposed)
        .into_iter()
        .filter(|id| !current_ids.contains(&thing_record_key(id)))
        .collect()
}

async fn song_links_exist_elsewhere(
    transaction: &Transaction<Any>,
    song_ids: &[RecordId],
    except_collection: Option<RecordId>,
) -> Result<bool, AppError> {
    if song_ids.is_empty() {
        return Ok(false);
    }

    let mut sql = String::from(
        "SELECT VALUE id FROM collection WHERE array::len(array::intersect($song_ids, array::map(songs, |$entry: any| $entry.id))) > 0",
    );
    if except_collection.is_some() {
        sql.push_str(" AND id != $except_collection");
    }
    sql.push_str(" LIMIT 1");

    let mut request = transaction.query(sql).bind(("song_ids", song_ids.to_vec()));
    if let Some(except_collection) = except_collection {
        request = request.bind(("except_collection", except_collection));
    }
    let mut response = request.await?;
    surreal_take_errors("collection.song_membership.check", &mut response)?;
    let conflicts = response.take::<Vec<RecordId>>(0)?;
    Ok(!conflicts.is_empty())
}

async fn serialize_song_membership_write(transaction: &Transaction<Any>) -> Result<(), AppError> {
    let mut response = transaction
        .query("UPDATE collection_membership_lock:global SET revision += 1 RETURN AFTER")
        .await?;
    surreal_take_errors("collection.song_membership.lock", &mut response)?;
    let lock_rows = response.take::<Vec<CollectionMembershipLockRecord>>(0)?;
    if lock_rows.is_empty() {
        return Err(AppError::database(
            "collection membership lock was not initialized",
        ));
    }
    let _revision = lock_rows[0].revision;
    Ok(())
}

async fn finish_transaction<T>(
    transaction: Transaction<Any>,
    result: Result<T, AppError>,
) -> Result<T, AppError> {
    match result {
        Ok(value) => {
            transaction.commit().await?;
            Ok(value)
        }
        Err(error) => {
            transaction.cancel().await?;
            Err(error)
        }
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
        let transaction = db.db.clone().begin().await?;
        let result = async {
            let song_ids = unique_song_record_ids(&collection.songs);
            if !song_ids.is_empty() {
                serialize_song_membership_write(&transaction).await?;
            }
            if song_links_exist_elsewhere(&transaction, &song_ids, None).await? {
                return Err(AppError::conflict(
                    "a song can belong to only one collection at a time",
                ));
            }

            let created: Option<CollectionRecord> = transaction
                .create("collection")
                .content(CollectionRecord::from_payload(
                    None,
                    Some(owner),
                    collection,
                ))
                .await?;
            created
                .map(CollectionRecord::into_collection)
                .ok_or_else(|| AppError::database("failed to create collection"))
        }
        .await;
        finish_transaction(transaction, result).await
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
        let collection_rid = RecordId::new(tb.clone(), sid.clone());
        let transaction = db.db.clone().begin().await?;
        let result = async {
            let mut current_response = transaction
                .query("SELECT * FROM type::record($tb, $sid) WHERE owner IN $teams")
                .bind(("tb", tb.clone()))
                .bind(("sid", sid.clone()))
                .bind(("teams", write_teams.to_vec()))
                .await?;
            surreal_take_errors("collection.update.current", &mut current_response)?;
            let current = current_response
                .take::<Vec<CollectionRecord>>(0)?
                .into_iter()
                .next()
                .map(CollectionRecord::into_collection)
                .ok_or_else(|| AppError::NotFound("collection not found".into()))?;

            let new_song_ids = new_song_record_ids(&current.songs, &collection.songs);
            if !new_song_ids.is_empty() {
                serialize_song_membership_write(&transaction).await?;
            }
            if song_links_exist_elsewhere(
                &transaction,
                &new_song_ids,
                Some(collection_rid.clone()),
            )
            .await?
            {
                return Err(AppError::conflict(
                    "a song can belong to only one collection at a time",
                ));
            }

            let songs: Vec<SongLinkRecord> = collection.songs.into_iter().map(Into::into).collect();
            let cover = blob_thing(&collection.cover);
            let title = collection.title;
            let mut response = if let Some(ref owner_rid) = owner {
                transaction
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
                transaction
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
            surreal_take_errors("collection.update", &mut response)?;

            response
                .take::<Vec<CollectionRecord>>(0)?
                .into_iter()
                .next()
                .map(CollectionRecord::into_collection)
                .ok_or_else(|| AppError::NotFound("collection not found".into()))
        }
        .await;
        finish_transaction(transaction, result).await
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
        let target_id = RecordId::new("collection", id.to_owned());
        let transaction = db.db.clone().begin().await?;
        let result = async {
            serialize_song_membership_write(&transaction).await?;
            if song_links_exist_elsewhere(
                &transaction,
                &[song_thing(&song_link.id)],
                Some(target_id),
            )
            .await?
            {
                return Err(AppError::conflict(
                    "a song can belong to only one collection at a time",
                ));
            }

            let mut response = transaction
                .query(
                    r#"UPDATE type::record("collection", $id) SET songs = array::append(songs, $song) WHERE owner IN $teams RETURN AFTER;"#,
                )
                .bind(("id", id.to_owned()))
                .bind(("teams", write_teams.to_vec()))
                .bind(("song", SongLinkRecord::from(song_link)))
                .await?;

            surreal_take_errors("collection.add_song_to_collection", &mut response)?;
            let rows: Vec<CollectionRecord> = response.take(0)?;
            if rows.is_empty() {
                return Err(AppError::NotFound("collection not found".into()));
            }
            Ok(())
        }
        .await;
        finish_transaction(transaction, result).await
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
        let source_rid = RecordId::new("collection", source_id.to_owned());
        let link_record = SongLinkRecord::from(link);
        let teams = write_teams.to_vec();

        let transaction = db.db.clone().begin().await?;
        let result = async {
            serialize_song_membership_write(&transaction).await?;
            if song_links_exist_elsewhere(
                &transaction,
                std::slice::from_ref(&song_rid),
                Some(source_rid),
            )
            .await?
            {
                return Err(AppError::conflict(
                    "a song can belong to only one collection at a time",
                ));
            }

            let mut response = transaction
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
        .await;
        finish_transaction(transaction, result).await
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
