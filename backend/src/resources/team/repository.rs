use async_trait::async_trait;
use surrealdb::types::RecordId;

use shared::api::ListQuery;
use shared::team::Team;

use crate::error::AppError;

use super::model::{DbTeamMember, TeamCreatePayload, TeamFetched};

/// Pure team data access — no authorization. Callers are responsible for ACL checks.
#[async_trait]
pub trait TeamRepository: Send + Sync {
    /// Fetch all non-public teams, with owner and member user records populated via FETCH.
    async fn fetch_all_teams(&self) -> Result<Vec<TeamFetched>, AppError>;

    /// Fetch teams visible to a user: all non-public teams for admins, or only teams where the
    /// user is the owner or a member for regular users. Filtering is pushed to the database.
    async fn fetch_teams_for_user(
        &self,
        user_id: &str,
        is_admin: bool,
    ) -> Result<Vec<TeamFetched>, AppError>;

    /// Count teams visible to the user matching `q_trimmed` (full-text name + substring on id and related user emails).
    async fn count_teams_for_user_search(
        &self,
        user_id: &str,
        is_admin: bool,
        q_trimmed: &str,
    ) -> Result<u64, AppError>;

    /// Search teams visible to the user; `q_trimmed` must be non-empty. Paging via `pagination`.
    async fn fetch_teams_for_user_search(
        &self,
        user_id: &str,
        is_admin: bool,
        pagination: &ListQuery,
        q_trimmed: &str,
    ) -> Result<Vec<TeamFetched>, AppError>;

    /// Fetch a single team by ID (accepts plain ID or `team:id` format), with FETCHed users.
    async fn fetch_team(&self, id: &str) -> Result<Option<TeamFetched>, AppError>;

    /// Insert a new team record; returns the created record ID string.
    async fn create_team(&self, payload: TeamCreatePayload) -> Result<String, AppError>;

    /// Update only the name field of a team.
    async fn update_team_name(
        &self,
        resource: (String, String),
        name: &str,
    ) -> Result<(), AppError>;

    /// Replace the member list of a team.
    async fn update_team_members(
        &self,
        resource: (String, String),
        members: Vec<DbTeamMember>,
    ) -> Result<(), AppError>;

    /// Delete a team record. Does NOT reassign content.
    async fn delete_team_record(&self, resource: (String, String)) -> Result<(), AppError>;

    /// Reassign all content (`blob`, `song`, `collection`, `setlist`) owned by `from` to `to`.
    async fn reassign_content(&self, from: RecordId, to: RecordId) -> Result<(), AppError>;

    /// Fetch the full `Team` DTO for a known team (for post-mutation returns).
    async fn load_team_display(&self, id: &str) -> Result<Team, AppError>;
}
