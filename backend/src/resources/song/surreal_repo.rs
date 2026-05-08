use std::cmp::Ordering;
use std::collections::{HashMap, HashSet};
use std::sync::Arc;

use async_trait::async_trait;
use serde::Deserialize;
use surrealdb::types::{RecordId, SurrealValue};

use shared::api::{SongListQuery, SongSort};
use shared::song::{CreateSong, Song};

use crate::database::Database;
use crate::database::record_id_string;
use crate::error::AppError;
use crate::resources::common::{belongs_to, blob_thing, resource_id};

use super::model::{LikeRecord, SongDataField, SongRecord, search_content_from_song_data};
use super::repository::{SongRepository, SongUpsertOutcome};

fn owner_thing(user_id: &str) -> RecordId {
    RecordId::new("user", user_id.to_owned())
}

/// Extra `AND ...` fragments for `lang` / `tag` filters and bound parameter names.
fn song_extra_filters(query: &SongListQuery) -> (String, Vec<(&'static str, String)>) {
    let mut s = String::new();
    let mut binds = Vec::new();
    if let Some(ref lang) = query.lang {
        let lang = lang.trim();
        if !lang.is_empty() {
            s.push_str(" AND data.languages != NONE AND array::contains(data.languages, $lang_f)");
            binds.push(("lang_f", lang.to_string()));
        }
    }
    if let Some(ref tag) = query.tag {
        let tag = tag.trim();
        if !tag.is_empty() {
            s.push_str(
                " AND string::contains(string::lowercase(to_string(data.tags ?? {})), string::lowercase($tag_f))",
            );
            binds.push(("tag_f", tag.to_string()));
        }
    }
    (s, binds)
}

fn song_order_clause(sort: SongSort, q_nonempty: bool) -> &'static str {
    match sort {
        SongSort::Relevance if q_nonempty => "ORDER BY score DESC",
        SongSort::Relevance => "ORDER BY id DESC",
        SongSort::IdDesc => "ORDER BY id DESC",
        SongSort::IdAsc => "ORDER BY id ASC",
        SongSort::TitleAsc => "ORDER BY data.titles[0] ASC",
        SongSort::TitleDesc => "ORDER BY data.titles[0] DESC",
    }
}

/// Per-field full-text hit with BM25 score (row shape is stable without `flatten` on nested `data`).
#[derive(Deserialize, SurrealValue)]
struct SongIdScoreRow {
    id: Option<RecordId>,
    #[serde(default)]
    rel_score: f64,
}

const FULLTEXT_FRAGMENTS: &[&str] = &[
    "data.titles @0@ $q",
    "data.artists @0@ $q",
    "search_content @0@ $q",
];

const FULLTEXT_WEIGHTS: &[f64] = &[100.0, 10.0, 1.0];

async fn song_fulltext_combined_scores(
    db: &Database,
    read_teams: &[RecordId],
    extra_where: &str,
    extra_binds: &[(&'static str, String)],
    q_trimmed: &str,
) -> Result<HashMap<String, f64>, AppError> {
    let mut scores: HashMap<String, f64> = HashMap::new();
    for (&fragment, &weight) in FULLTEXT_FRAGMENTS.iter().zip(FULLTEXT_WEIGHTS.iter()) {
        let sql = format!(
            "SELECT id, (search::score(0) ?? 0) AS rel_score FROM song WHERE owner IN $teams{extra_where} AND {fragment}",
        );
        let mut request = db
            .db
            .query(sql)
            .bind(("teams", read_teams.to_vec()))
            .bind(("q", q_trimmed.to_string()));
        for &(k, ref v) in extra_binds {
            request = request.bind((k, v.clone()));
        }
        let mut response = request.await?;
        let rows: Vec<SongIdScoreRow> = response.take(0)?;
        for row in rows {
            let Some(ref rid) = row.id else {
                continue;
            };
            let id = record_id_string(rid);
            if id.is_empty() {
                continue;
            }
            *scores.entry(id).or_insert(0.0) += row.rel_score * weight;
        }
    }
    Ok(scores)
}

async fn songs_by_ids(
    db: &Database,
    ids: Vec<RecordId>,
) -> Result<HashMap<String, SongRecord>, AppError> {
    if ids.is_empty() {
        return Ok(HashMap::new());
    }
    let mut response = db
        .db
        .query("SELECT * FROM $ids")
        .bind(("ids", ids))
        .await?;
    let records: Vec<SongRecord> = response.take(0)?;
    let mut by_id = HashMap::with_capacity(records.len());
    for r in records {
        let Some(ref rid) = r.id else {
            continue;
        };
        by_id.insert(record_id_string(rid), r);
    }
    Ok(by_id)
}

fn sort_merged_song_rows(
    items: &mut [(String, SongRecord, f64)],
    sort: SongSort,
    q_nonempty: bool,
) {
    match sort {
        SongSort::Relevance if q_nonempty => {
            items.sort_by(|a, b| {
                b.2.partial_cmp(&a.2)
                    .unwrap_or(Ordering::Equal)
                    .then_with(|| b.0.cmp(&a.0))
            });
        }
        SongSort::Relevance => {
            items.sort_by(|a, b| b.0.cmp(&a.0));
        }
        SongSort::IdDesc => items.sort_by(|a, b| b.0.cmp(&a.0)),
        SongSort::IdAsc => items.sort_by(|a, b| a.0.cmp(&b.0)),
        SongSort::TitleAsc => items.sort_by(|a, b| {
            let ta = a.1.data.titles.first().map(String::as_str).unwrap_or("");
            let tb = b.1.data.titles.first().map(String::as_str).unwrap_or("");
            ta.cmp(tb).then_with(|| a.0.cmp(&b.0))
        }),
        SongSort::TitleDesc => items.sort_by(|a, b| {
            let ta = a.1.data.titles.first().map(String::as_str).unwrap_or("");
            let tb = b.1.data.titles.first().map(String::as_str).unwrap_or("");
            tb.cmp(ta).then_with(|| a.0.cmp(&b.0))
        }),
    }
}

#[derive(Clone)]
pub struct SurrealSongRepo {
    db: Arc<Database>,
}

impl SurrealSongRepo {
    pub fn new(db: Arc<Database>) -> Self {
        Self { db }
    }

    fn inner(&self) -> &Database {
        &self.db
    }
}

#[async_trait]
impl SongRepository for SurrealSongRepo {
    async fn get_songs(
        &self,
        read_teams: &[RecordId],
        query: SongListQuery,
    ) -> Result<Vec<Song>, AppError> {
        let db = self.inner();
        let sort = query.effective_sort();
        let (extra_where, extra_binds) = song_extra_filters(&query);
        let pagination = query.list_query();
        let q_nonempty = pagination.q.as_ref().is_some_and(|q| !q.trim().is_empty());

        if q_nonempty {
            let q_trimmed = pagination
                .q
                .as_ref()
                .map(|s| s.trim().to_string())
                .unwrap_or_default();
            let scores = song_fulltext_combined_scores(
                db,
                read_teams,
                &extra_where,
                &extra_binds,
                &q_trimmed,
            )
            .await?;
            let ids: Vec<RecordId> = scores
                .keys()
                .map(|id| RecordId::new("song", id.as_str()))
                .collect();
            let mut by_id = songs_by_ids(db, ids).await?;
            let mut items: Vec<(String, SongRecord, f64)> = scores
                .into_iter()
                .filter_map(|(id, score)| by_id.remove(&id).map(|rec| (id, rec, score)))
                .collect();
            sort_merged_song_rows(&mut items, sort, true);
            let (offset, limit) = pagination.effective_offset_limit();
            return Ok(items
                .into_iter()
                .skip(offset as usize)
                .take(limit as usize)
                .map(|(_, rec, _)| rec.into_song())
                .collect());
        }

        let mut sql = format!("SELECT * FROM song WHERE owner IN $teams{extra_where}");
        sql.push(' ');
        sql.push_str(song_order_clause(sort, false));
        let (offset, limit) = pagination.effective_offset_limit();
        sql.push_str(" LIMIT $limit START $start");

        let mut request = db.db.query(sql).bind(("teams", read_teams.to_vec()));
        for (k, v) in extra_binds {
            request = request.bind((k, v));
        }
        request = request.bind(("limit", limit)).bind(("start", offset));

        let mut response = request.await?;

        Ok(response
            .take::<Vec<SongRecord>>(0)?
            .into_iter()
            .map(SongRecord::into_song)
            .collect())
    }

    async fn get_song(&self, read_teams: &[RecordId], id: &str) -> Result<Song, AppError> {
        let db = self.inner();
        let record: Option<SongRecord> = db.db.select(resource_id("song", id)?).await?;
        match record {
            Some(r) if belongs_to(&r.owner, read_teams) => Ok(r.into_song()),
            _ => Err(AppError::NotFound("song not found".into())),
        }
    }

    async fn count_songs(
        &self,
        read_teams: &[RecordId],
        query: &SongListQuery,
    ) -> Result<u64, AppError> {
        let db = self.inner();
        let q_nonempty = query.q.as_ref().is_some_and(|s| !s.trim().is_empty());
        let (extra_where, extra_binds) = song_extra_filters(query);

        if q_nonempty {
            let q_trimmed = query
                .q
                .as_ref()
                .map(|s| s.trim().to_string())
                .unwrap_or_default();
            let scores = song_fulltext_combined_scores(
                db,
                read_teams,
                &extra_where,
                &extra_binds,
                &q_trimmed,
            )
            .await?;
            return Ok(scores.len() as u64);
        }

        let query_s =
            format!("SELECT count() FROM song WHERE owner IN $teams{extra_where} GROUP ALL");

        let mut request = db.db.query(query_s).bind(("teams", read_teams.to_vec()));
        for (k, v) in extra_binds {
            request = request.bind((k, v));
        }

        #[derive(Deserialize, SurrealValue)]
        struct CountResult {
            count: u64,
        }

        let mut response = request.await?;
        Ok(response
            .take::<Vec<CountResult>>(0)?
            .into_iter()
            .next()
            .map(|r| r.count)
            .unwrap_or(0))
    }

    async fn create_song(&self, owner: RecordId, song: CreateSong) -> Result<Song, AppError> {
        let db = self.inner();
        db.db
            .create("song")
            .content(SongRecord::from_payload(None, Some(owner), song))
            .await?
            .map(SongRecord::into_song)
            .ok_or_else(|| AppError::database("failed to create song"))
    }

    /// Three-step upsert:
    /// 1. `UPDATE ... WHERE owner IN $teams` -- fast-path for existing songs the caller owns.
    /// 2. If empty: `SELECT` by ID -- if it exists the caller has no permission (`NotFound`).
    /// 3. If missing: `CREATE` with the given ID under the actor's personal team.
    async fn update_song(
        &self,
        write_teams: &[RecordId],
        actor_user_id: &str,
        id: &str,
        song: CreateSong,
        owner: Option<RecordId>,
    ) -> Result<SongUpsertOutcome, AppError> {
        let db = self.inner();
        let resource = resource_id("song", id)?;
        let (tb, sid) = resource.clone();
        let search_content = search_content_from_song_data(&song.data);
        let blobs: Vec<RecordId> = song.blobs.iter().map(|b| blob_thing(&b.id)).collect();

        let mut response = if let Some(ref owner_rid) = owner {
            db.db
                .query(
                    "UPDATE type::record($tb, $sid) SET not_a_song = $not_a_song, blobs = $blobs, \
                     data = $data, search_content = $search_content, owner = $owner \
                     WHERE owner IN $teams RETURN AFTER",
                )
                .bind(("tb", tb.clone()))
                .bind(("sid", sid.clone()))
                .bind(("not_a_song", song.not_a_song))
                .bind(("blobs", blobs.clone()))
                .bind(("data", SongDataField(song.data.clone())))
                .bind(("search_content", search_content.clone()))
                .bind(("owner", owner_rid.clone()))
                .bind(("teams", write_teams.to_vec()))
                .await?
        } else {
            db.db
                .query(
                    "UPDATE type::record($tb, $sid) SET not_a_song = $not_a_song, blobs = $blobs, \
                     data = $data, search_content = $search_content WHERE owner IN $teams RETURN AFTER",
                )
                .bind(("tb", tb.clone()))
                .bind(("sid", sid.clone()))
                .bind(("not_a_song", song.not_a_song))
                .bind(("blobs", blobs.clone()))
                .bind(("data", SongDataField(song.data.clone())))
                .bind(("search_content", search_content.clone()))
                .bind(("teams", write_teams.to_vec()))
                .await?
        };

        let rows: Vec<SongRecord> = response.take(0)?;
        if let Some(updated) = rows.into_iter().next() {
            return Ok(SongUpsertOutcome::Updated(updated.into_song()));
        }

        let existing: Option<SongRecord> = db.db.select(resource.clone()).await?;
        if existing.is_some() {
            return Err(AppError::NotFound("song not found".into()));
        }

        let owner_team = if let Some(o) = owner {
            o
        } else {
            db.personal_team_thing_for_user(actor_user_id).await?
        };
        if !write_teams.contains(&owner_team) {
            return Err(AppError::NotFound("song not found".into()));
        }
        let record_id = RecordId::new(resource.0.clone(), resource.1.clone());
        let record = SongRecord::from_payload(Some(record_id), Some(owner_team), song);
        let created = db
            .db
            .create(resource)
            .content(record)
            .await?
            .map(SongRecord::into_song)
            .ok_or_else(|| AppError::database("failed to upsert song"))?;
        Ok(SongUpsertOutcome::Created(created))
    }

    async fn delete_song(&self, write_teams: &[RecordId], id: &str) -> Result<Song, AppError> {
        let db = self.inner();
        let (tb, sid) = resource_id("song", id)?;
        let mut response = db
            .db
            .query("DELETE FROM type::record($tb, $sid) WHERE owner IN $teams RETURN BEFORE")
            .bind(("tb", tb))
            .bind(("sid", sid))
            .bind(("teams", write_teams.to_vec()))
            .await?;

        let rows: Vec<SongRecord> = response.take(0)?;
        rows.into_iter()
            .next()
            .map(SongRecord::into_song)
            .ok_or_else(|| AppError::NotFound("song not found".into()))
    }

    async fn move_song_owner(
        &self,
        write_teams: &[RecordId],
        id: &str,
        new_owner: RecordId,
    ) -> Result<Song, AppError> {
        let db = self.inner();
        let (tb, sid) = resource_id("song", id)?;
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

        let rows: Vec<SongRecord> = response.take(0)?;
        rows.into_iter()
            .next()
            .map(SongRecord::into_song)
            .ok_or_else(|| AppError::NotFound("song not found".into()))
    }

    async fn get_song_like(
        &self,
        read_teams: &[RecordId],
        user_id: &str,
        id: &str,
    ) -> Result<bool, AppError> {
        let db = self.inner();
        let resource = resource_id("song", id)?;
        let existing: SongRecord = db
            .db
            .select(resource.clone())
            .await?
            .ok_or_else(|| AppError::NotFound("song not found".into()))?;

        if !belongs_to(&existing.owner, read_teams) {
            return Err(AppError::NotFound("song not found".into()));
        }

        let owner = owner_thing(user_id);
        let song = RecordId::new(resource.0, resource.1);

        let mut response = db
            .db
            .query("SELECT * FROM like WHERE owner = $owner AND song = $song LIMIT 1")
            .bind(("owner", owner))
            .bind(("song", song))
            .await?;

        let likes: Vec<LikeRecord> = response.take(0)?;
        Ok(!likes.is_empty())
    }

    async fn set_song_like(
        &self,
        read_teams: &[RecordId],
        user_id: &str,
        id: &str,
        liked: bool,
    ) -> Result<bool, AppError> {
        let db = self.inner();
        let resource = resource_id("song", id)?;
        let existing: SongRecord = db
            .db
            .select(resource.clone())
            .await?
            .ok_or_else(|| AppError::NotFound("song not found".into()))?;

        if !belongs_to(&existing.owner, read_teams) {
            return Err(AppError::NotFound("song not found".into()));
        }

        let owner = owner_thing(user_id);
        let song = RecordId::new(resource.0, resource.1);

        let mut response = db
            .db
            .query("SELECT * FROM like WHERE owner = $owner AND song = $song LIMIT 1")
            .bind(("owner", owner.clone()))
            .bind(("song", song.clone()))
            .await?;

        let mut likes: Vec<LikeRecord> = response.take(0)?;
        let existing_like = likes.pop();

        if liked {
            if existing_like.is_none() {
                let _: Option<LikeRecord> = db
                    .db
                    .create("like")
                    .content(LikeRecord::new(owner, song))
                    .await?;
            }
            Ok(true)
        } else if let Some(record) = existing_like.and_then(|like| like.id) {
            let _: Option<LikeRecord> = db.db.delete(record).await?;
            Ok(false)
        } else {
            Ok(false)
        }
    }

    async fn get_liked_set(&self, user_id: &str) -> Result<HashSet<String>, AppError> {
        let db = self.inner();
        let mut response = db
            .db
            .query("SELECT * FROM like WHERE owner = $owner")
            .bind(("owner", owner_thing(user_id)))
            .await?;

        let likes: Vec<LikeRecord> = response.take(0)?;
        Ok(likes
            .into_iter()
            .map(|like| crate::database::record_id_string(&like.song))
            .collect())
    }
}
