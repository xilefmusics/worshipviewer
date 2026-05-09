use std::sync::Arc;

use async_trait::async_trait;
use serde::Deserialize;
use surrealdb::types::{RecordId, SurrealValue};

use shared::api::ListQuery;
use shared::team::Team;

use crate::database::Database;
use crate::error::AppError;

use super::model::{
    DbTeamMember, TeamCreatePayload, TeamFetched, TeamIdRow, team_resource_or_reject_public,
    user_thing,
};
use super::repository::TeamRepository;

/// Match `q` against name (full-text), id, personal owner email, or any member email.
const TEAM_SEARCH_PREDICATE: &str = "(
    name @0@ $q
    OR string::contains(string::lowercase(type::string(id)), $needle)
    OR (owner != NONE AND string::contains(string::lowercase((SELECT VALUE email FROM ONLY $this.owner)), $needle))
    OR array::len(members[WHERE string::contains(string::lowercase((SELECT VALUE email FROM ONLY $this.user)), $needle)]) > 0
)";

#[derive(Clone)]
pub struct SurrealTeamRepo {
    db: Arc<Database>,
}

impl SurrealTeamRepo {
    pub fn new(db: Arc<Database>) -> Self {
        Self { db }
    }

    fn inner(&self) -> &Database {
        &self.db
    }
}

#[async_trait]
impl TeamRepository for SurrealTeamRepo {
    async fn fetch_all_teams(&self) -> Result<Vec<TeamFetched>, AppError> {
        let public_thing = super::model::public_team_thing();
        Ok(self
            .inner()
            .db
            .query("SELECT * FROM team WHERE id != $public FETCH owner, members.user")
            .bind(("public", public_thing))
            .await?
            .take::<Vec<TeamFetched>>(0)?)
    }

    async fn fetch_teams_for_user(
        &self,
        user_id: &str,
        is_admin: bool,
    ) -> Result<Vec<TeamFetched>, AppError> {
        let public_thing = super::model::public_team_thing();
        let db = self.inner();
        if is_admin {
            Ok(db
                .db
                .query("SELECT * FROM team WHERE id != $public FETCH owner, members.user")
                .bind(("public", public_thing))
                .await?
                .take::<Vec<TeamFetched>>(0)?)
        } else {
            let ut = user_thing(user_id);
            Ok(db
                .db
                .query(
                    "SELECT * FROM team WHERE id != $public \
                     AND (owner = $user OR array::len(members[WHERE user = $user]) > 0) \
                     FETCH owner, members.user",
                )
                .bind(("public", public_thing))
                .bind(("user", ut))
                .await?
                .take::<Vec<TeamFetched>>(0)?)
        }
    }

    async fn count_teams_for_user_search(
        &self,
        user_id: &str,
        is_admin: bool,
        q_trimmed: &str,
    ) -> Result<u64, AppError> {
        #[derive(Deserialize, SurrealValue)]
        struct CountResult {
            count: u64,
        }

        let public_thing = super::model::public_team_thing();
        let db = self.inner();

        let mut sql = String::from("SELECT count() FROM team WHERE ");
        if is_admin {
            sql.push_str("id != $public AND ");
        } else {
            let ut = user_thing(user_id);
            sql.push_str(
                "id != $public AND (owner = $user OR array::len(members[WHERE user = $user]) > 0) AND ",
            );
            sql.push_str(TEAM_SEARCH_PREDICATE);
            sql.push_str(" GROUP ALL");
            let mut response = db
                .db
                .query(&sql)
                .bind(("public", public_thing))
                .bind(("user", ut))
                .bind(("q", q_trimmed.to_owned()))
                .bind(("needle", q_trimmed.to_lowercase()))
                .await?;
            crate::database::surreal_take_errors(
                "team.count_teams_for_user_search",
                &mut response,
            )?;
            return Ok(response
                .take::<Vec<CountResult>>(0)?
                .into_iter()
                .next()
                .map(|r| r.count)
                .unwrap_or(0));
        }
        sql.push_str(TEAM_SEARCH_PREDICATE);
        sql.push_str(" GROUP ALL");
        let mut response = db
            .db
            .query(&sql)
            .bind(("public", public_thing))
            .bind(("q", q_trimmed.to_owned()))
            .bind(("needle", q_trimmed.to_lowercase()))
            .await?;
        crate::database::surreal_take_errors("team.count_teams_for_user_search", &mut response)?;
        Ok(response
            .take::<Vec<CountResult>>(0)?
            .into_iter()
            .next()
            .map(|r| r.count)
            .unwrap_or(0))
    }

    async fn fetch_teams_for_user_search(
        &self,
        user_id: &str,
        is_admin: bool,
        pagination: &ListQuery,
        q_trimmed: &str,
    ) -> Result<Vec<TeamFetched>, AppError> {
        let public_thing = super::model::public_team_thing();
        let db = self.inner();
        let (offset, limit) = pagination.effective_offset_limit();

        let mut sql = String::from("SELECT *, (search::score(0) ?? 0) AS score FROM team WHERE ");
        if is_admin {
            sql.push_str("id != $public AND ");
        } else {
            let ut = user_thing(user_id);
            sql.push_str(
                "id != $public AND (owner = $user OR array::len(members[WHERE user = $user]) > 0) AND ",
            );
            sql.push_str(TEAM_SEARCH_PREDICATE);
            sql.push_str(
                " ORDER BY score DESC, id ASC LIMIT $limit START $start FETCH owner, members.user",
            );
            return Ok(db
                .db
                .query(&sql)
                .bind(("public", public_thing))
                .bind(("user", ut))
                .bind(("q", q_trimmed.to_owned()))
                .bind(("needle", q_trimmed.to_lowercase()))
                .bind(("limit", limit))
                .bind(("start", offset))
                .await?
                .take::<Vec<TeamFetched>>(0)?);
        }
        sql.push_str(TEAM_SEARCH_PREDICATE);
        sql.push_str(
            " ORDER BY score DESC, id ASC LIMIT $limit START $start FETCH owner, members.user",
        );
        Ok(db
            .db
            .query(&sql)
            .bind(("public", public_thing))
            .bind(("q", q_trimmed.to_owned()))
            .bind(("needle", q_trimmed.to_lowercase()))
            .bind(("limit", limit))
            .bind(("start", offset))
            .await?
            .take::<Vec<TeamFetched>>(0)?)
    }

    async fn fetch_team(&self, id: &str) -> Result<Option<TeamFetched>, AppError> {
        let resource = team_resource_or_reject_public(id)?;
        Ok(self
            .inner()
            .db
            .query("SELECT * FROM $tid FETCH owner, members.user")
            .bind(("tid", RecordId::new(resource.0, resource.1)))
            .await?
            .take::<Option<TeamFetched>>(0)?)
    }

    async fn create_team(&self, payload: TeamCreatePayload) -> Result<String, AppError> {
        let created: Option<TeamIdRow> = self.inner().db.create("team").content(payload).await?;
        created
            .ok_or_else(|| AppError::database("failed to create team"))
            .map(|row| crate::database::record_id_string(&row.id))
    }

    async fn update_team_name(
        &self,
        resource: (String, String),
        name: &str,
    ) -> Result<(), AppError> {
        let mut response = self
            .inner()
            .db
            .query("UPDATE $tid SET name = $name")
            .bind(("tid", RecordId::new(resource.0, resource.1)))
            .bind(("name", name.to_owned()))
            .await?;
        crate::database::surreal_take_errors("team.update_team_name", &mut response)?;
        let _ = response.check().map_err(|e| {
            crate::log_and_convert!(AppError::database, "team.update_team_name.check", e)
        })?;
        Ok(())
    }

    async fn update_team_members(
        &self,
        resource: (String, String),
        members: Vec<DbTeamMember>,
    ) -> Result<(), AppError> {
        let mut response = self
            .inner()
            .db
            .query("UPDATE $tid SET members = $members")
            .bind(("tid", RecordId::new(resource.0, resource.1)))
            .bind(("members", members))
            .await?;
        crate::database::surreal_take_errors("team.update_team_members", &mut response)?;
        let _ = response.check().map_err(|e| {
            crate::log_and_convert!(AppError::database, "team.update_team_members.check", e)
        })?;
        Ok(())
    }

    async fn delete_team_record(&self, resource: (String, String)) -> Result<(), AppError> {
        let tid = RecordId::new(resource.0, resource.1);
        let mut response = self
            .inner()
            .db
            .query("DELETE $tid")
            .bind(("tid", tid))
            .await?;
        crate::database::surreal_take_errors("team.delete_team_record", &mut response)?;
        let _ = response.check().map_err(|e| {
            crate::log_and_convert!(AppError::database, "team.delete_team_record.check", e)
        })?;
        Ok(())
    }

    async fn reassign_content(&self, from: RecordId, to: RecordId) -> Result<(), AppError> {
        for table in ["blob", "song", "collection", "setlist"] {
            let q = format!("UPDATE {table} SET owner = $to WHERE owner = $from");
            let mut response = self
                .inner()
                .db
                .query(&q)
                .bind(("to", to.clone()))
                .bind(("from", from.clone()))
                .await?;
            crate::database::surreal_take_errors("team.reassign_content", &mut response)?;
            let _ = response.check().map_err(|e| {
                crate::log_and_convert!(AppError::database, "team.reassign_content.check", e)
            })?;
        }
        Ok(())
    }

    async fn load_team_display(&self, id: &str) -> Result<Team, AppError> {
        let resource = team_resource_or_reject_public(id)?;
        let row = self
            .inner()
            .db
            .query("SELECT * FROM $tid FETCH owner, members.user")
            .bind(("tid", RecordId::new(resource.0, resource.1)))
            .await?
            .take::<Option<TeamFetched>>(0)?
            .ok_or_else(|| AppError::NotFound("team not found".into()))?;
        row.into_team()
    }
}
