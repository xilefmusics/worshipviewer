use std::sync::Arc;

use async_trait::async_trait;
use serde::Deserialize;
use surrealdb::types::{RecordId, SurrealValue};

use shared::media::{Media, MediaListQuery};

use crate::database::Database;
use crate::error::AppError;
use crate::resources::common::{belongs_to, resource_id};

use super::model::{MediaRecord, MediaWrite};
use super::repository::MediaRepository;

#[derive(Clone)]
pub struct SurrealMediaRepo {
    db: Arc<Database>,
}

impl SurrealMediaRepo {
    pub fn new(db: Arc<Database>) -> Self {
        Self { db }
    }
}

fn records(rows: Vec<MediaRecord>) -> Result<Vec<Media>, AppError> {
    rows.into_iter().map(MediaRecord::into_media).collect()
}

#[async_trait]
impl MediaRepository for SurrealMediaRepo {
    async fn list(
        &self,
        read_teams: &[RecordId],
        query: MediaListQuery,
    ) -> Result<Vec<Media>, AppError> {
        let searched = query.q.as_ref().is_some_and(|q| !q.trim().is_empty());
        let background_filter = query.is_background.is_some();
        let mut statement = if searched {
            "SELECT *, (search::score(0) ?? 0) AS score FROM media WHERE owner IN $teams AND (title @0@ $q OR string::contains(string::lowercase(title), string::lowercase($q)))".to_owned()
        } else {
            "SELECT * FROM media WHERE owner IN $teams".to_owned()
        };
        if background_filter {
            statement.push_str(" AND is_background = $is_background");
        }
        if searched {
            statement.push_str(" ORDER BY score DESC, title ASC, id ASC");
        } else {
            statement.push_str(" ORDER BY title ASC, id ASC");
        }
        statement.push_str(" LIMIT $limit START $start");
        let (start, limit) = query.effective_offset_limit();
        let mut request = self
            .db
            .db
            .query(statement)
            .bind(("teams", read_teams.to_vec()))
            .bind(("limit", limit))
            .bind(("start", start));
        if searched {
            request = request.bind(("q", query.q.unwrap().trim().to_owned()));
        }
        if let Some(is_background) = query.is_background {
            request = request.bind(("is_background", is_background));
        }
        let mut response = request.await?;
        records(response.take(0)?)
    }

    async fn count(
        &self,
        read_teams: &[RecordId],
        query: &MediaListQuery,
    ) -> Result<u64, AppError> {
        #[derive(Deserialize, SurrealValue)]
        struct Count {
            count: u64,
        }
        let searched = query.q.as_ref().is_some_and(|v| !v.trim().is_empty());
        let mut statement = "SELECT count() FROM media WHERE owner IN $teams".to_owned();
        if searched {
            statement.push_str(" AND (title @0@ $q OR string::contains(string::lowercase(title), string::lowercase($q)))");
        }
        if query.is_background.is_some() {
            statement.push_str(" AND is_background = $is_background");
        }
        statement.push_str(" GROUP ALL");
        let mut request = self
            .db
            .db
            .query(statement)
            .bind(("teams", read_teams.to_vec()));
        if searched {
            request = request.bind(("q", query.q.as_ref().unwrap().trim().to_owned()));
        }
        if let Some(is_background) = query.is_background {
            request = request.bind(("is_background", is_background));
        }
        let mut response = request.await?;
        Ok(response
            .take::<Vec<Count>>(0)?
            .first()
            .map(|v| v.count)
            .unwrap_or(0))
    }

    async fn get(&self, read_teams: &[RecordId], id: &str) -> Result<Media, AppError> {
        let row: Option<MediaRecord> = self.db.db.select(resource_id("media", id)?).await?;
        match row {
            Some(row) if belongs_to(&row.owner, read_teams) => row.into_media(),
            _ => Err(AppError::NotFound("media not found".into())),
        }
    }

    async fn create(&self, owner: RecordId, value: MediaWrite) -> Result<Media, AppError> {
        let record = MediaRecord::from_write(None, Some(owner), value)?;
        let created: Option<MediaRecord> = self.db.db.create("media").content(record).await?;
        created
            .ok_or_else(|| AppError::database("failed to create media"))?
            .into_media()
    }

    async fn create_with_id(
        &self,
        id: &str,
        owner: RecordId,
        value: MediaWrite,
    ) -> Result<Media, AppError> {
        let record = MediaRecord::from_write(None, Some(owner), value)?;
        let created: Option<MediaRecord> = self
            .db
            .db
            .create(resource_id("media", id)?)
            .content(record)
            .await?;
        created
            .ok_or_else(|| AppError::database("failed to create media"))?
            .into_media()
    }

    async fn update_if_current(
        &self,
        write_teams: &[RecordId],
        id: &str,
        current: &Media,
        owner: Option<RecordId>,
        value: MediaWrite,
    ) -> Result<Media, AppError> {
        let (tb, sid) = resource_id("media", id)?;
        let record = MediaRecord::from_write(None, owner.clone(), value)?;
        let expected_content_json = serde_json::to_string(&current.content)
            .map_err(|e| AppError::internal_from_err("media.repo.expected_content", e))?;
        let expected_pending_revision_json = current
            .pending_revision
            .as_ref()
            .map(serde_json::to_string)
            .transpose()
            .map_err(|e| AppError::internal_from_err("media.repo.expected_revision", e))?;
        let mut response = self
            .db
            .db
            .query(
                "UPDATE type::record($tb, $sid) SET title = $title, content_json = $content_json, pending_revision_json = $pending_revision_json, is_background = $is_background, owner = $owner ?? owner \
                 WHERE owner IN $teams AND title = $expected_title AND content_json = $expected_content_json \
                 AND pending_revision_json = $expected_pending_revision_json AND is_background = $expected_is_background RETURN AFTER",
            )
            .bind(("tb", tb))
            .bind(("sid", sid))
            .bind(("title", record.title))
            .bind(("content_json", record.content_json))
            .bind(("pending_revision_json", record.pending_revision_json))
            .bind(("is_background", record.is_background))
            .bind(("owner", owner))
            .bind(("teams", write_teams.to_vec()))
            .bind(("expected_title", current.title.clone()))
            .bind(("expected_content_json", expected_content_json))
            .bind((
                "expected_pending_revision_json",
                expected_pending_revision_json,
            ))
            .bind(("expected_is_background", current.is_background))
            .await?;
        response
            .take::<Vec<MediaRecord>>(0)?
            .into_iter()
            .next()
            .ok_or_else(|| AppError::conflict("media changed during the operation"))?
            .into_media()
    }

    async fn move_owner(
        &self,
        write_teams: &[RecordId],
        id: &str,
        owner: RecordId,
    ) -> Result<Media, AppError> {
        let (tb, sid) = resource_id("media", id)?;
        let mut response = self.db.db.query("UPDATE type::record($tb, $sid) SET owner = $owner WHERE owner IN $teams RETURN AFTER").bind(("tb", tb)).bind(("sid", sid)).bind(("owner", owner)).bind(("teams", write_teams.to_vec())).await?;
        response
            .take::<Vec<MediaRecord>>(0)?
            .into_iter()
            .next()
            .ok_or_else(|| AppError::NotFound("media not found".into()))?
            .into_media()
    }

    async fn delete_if_current(
        &self,
        write_teams: &[RecordId],
        id: &str,
        current: &Media,
    ) -> Result<Media, AppError> {
        let (tb, sid) = resource_id("media", id)?;
        let expected_content_json = serde_json::to_string(&current.content)
            .map_err(|e| AppError::internal_from_err("media.repo.expected_content", e))?;
        let expected_pending_revision_json = current
            .pending_revision
            .as_ref()
            .map(serde_json::to_string)
            .transpose()
            .map_err(|e| AppError::internal_from_err("media.repo.expected_revision", e))?;
        let mut response = self
            .db
            .db
            .query(
                "DELETE FROM type::record($tb, $sid) WHERE owner IN $teams AND title = $expected_title \
                 AND content_json = $expected_content_json AND pending_revision_json = $expected_pending_revision_json AND is_background = $expected_is_background RETURN BEFORE",
            )
            .bind(("tb", tb))
            .bind(("sid", sid))
            .bind(("teams", write_teams.to_vec()))
            .bind(("expected_title", current.title.clone()))
            .bind(("expected_content_json", expected_content_json))
            .bind((
                "expected_pending_revision_json",
                expected_pending_revision_json,
            ))
            .bind(("expected_is_background", current.is_background))
            .await?;
        response
            .take::<Vec<MediaRecord>>(0)?
            .into_iter()
            .next()
            .ok_or_else(|| AppError::conflict("media changed during the operation"))?
            .into_media()
    }
}
