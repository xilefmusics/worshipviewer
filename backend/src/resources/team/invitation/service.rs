use std::collections::BTreeMap;
use std::sync::Arc;

use uuid::Uuid;

use surrealdb::types::RecordId;

use shared::api::ListQuery;
use shared::team::{Team, TeamInvitation};
use tracing::instrument;

use crate::database::{Database, record_id_string};
use crate::error::AppError;

use crate::auth::AuthorizationContext;

use super::model::{invitation_thing, team_things_match};
use super::repository::TeamInvitationRepository;
use super::surreal_repo::SurrealTeamInvitationRepo;
use crate::resources::team::model::{
    DbTeamMember, effective_admin, is_public_resource, member_or_owner_readable,
    team_fetched_to_stored, team_resource_or_reject_public, thing_user_id, user_thing,
};
use crate::resources::team::repository::TeamRepository;
use crate::resources::team::surreal_repo::SurrealTeamRepo;

fn audit_invitation_accepted(team_id: &str, invitation_id: &str, user_id: &str) {
    crate::audit!(
        "audit.team.invitation.accepted",
        team_id = tracing::field::display(team_id),
        invitation_id = tracing::field::display(invitation_id),
        user_id = tracing::field::display(user_id)
        ; "invitation accepted"
    );
}

/// Application service for team invitation management.
#[derive(Clone)]
pub struct InvitationService<R, IR> {
    pub team_repo: R,
    pub inv_repo: IR,
}

impl<R, IR> InvitationService<R, IR> {
    pub fn new(team_repo: R, inv_repo: IR) -> Self {
        Self {
            team_repo,
            inv_repo,
        }
    }
}

impl<R: TeamRepository, IR: TeamInvitationRepository> InvitationService<R, IR> {
    #[instrument(level = "debug", err, skip(self, ctx))]
    pub async fn create_invitation_for_user(
        &self,
        ctx: &AuthorizationContext,
        team_id: &str,
    ) -> Result<TeamInvitation, AppError> {
        let team_thing = self
            .assert_team_admin_for_invitations(&ctx.user.id, team_id)
            .await?;
        let inv_id = Uuid::new_v4().to_string();
        self.inv_repo
            .create_invitation(team_thing, user_thing(&ctx.user.id), &inv_id)
            .await?;
        self.get_invitation_for_user(ctx, team_id, &inv_id).await
    }

    #[instrument(level = "debug", err, skip(self, ctx, pagination))]
    pub async fn list_invitations_for_user(
        &self,
        ctx: &AuthorizationContext,
        team_id: &str,
        pagination: ListQuery,
    ) -> Result<(Vec<TeamInvitation>, u64), AppError> {
        let team_thing = self
            .assert_team_admin_for_invitations(&ctx.user.id, team_id)
            .await?;
        let rows = self.inv_repo.list_invitations(team_thing).await?;
        let invitations: Vec<TeamInvitation> = rows
            .into_iter()
            .map(|r| r.into_invitation())
            .collect::<Result<Vec<_>, _>>()?;
        let (page, total) = ListQuery::paginate_vec(invitations, &pagination);
        Ok((page, total))
    }

    #[instrument(level = "debug", err, skip(self, ctx))]
    pub async fn get_invitation_for_user(
        &self,
        ctx: &AuthorizationContext,
        team_id: &str,
        invitation_id: &str,
    ) -> Result<TeamInvitation, AppError> {
        let team_thing = self
            .assert_team_admin_for_invitations(&ctx.user.id, team_id)
            .await?;
        let inv_thing = invitation_thing(invitation_id)?;
        let inv_id_key = record_id_string(&inv_thing);
        let row = self
            .inv_repo
            .get_invitation(&inv_id_key)
            .await?
            .ok_or_else(|| AppError::NotFound("invitation not found".into()))?;

        if !team_things_match(&row.team, &team_thing) {
            return Err(AppError::NotFound("invitation not found".into()));
        }

        row.into_invitation()
    }

    #[instrument(level = "debug", err, skip(self, ctx))]
    pub async fn delete_invitation_for_user(
        &self,
        ctx: &AuthorizationContext,
        team_id: &str,
        invitation_id: &str,
    ) -> Result<(), AppError> {
        let team_thing = self
            .assert_team_admin_for_invitations(&ctx.user.id, team_id)
            .await?;
        let inv_thing = invitation_thing(invitation_id)?;
        let inv_id_key = record_id_string(&inv_thing);
        let row = self
            .inv_repo
            .get_invitation(&inv_id_key)
            .await?
            .ok_or_else(|| AppError::NotFound("invitation not found".into()))?;

        if !team_things_match(&row.team, &team_thing) {
            return Err(AppError::NotFound("invitation not found".into()));
        }

        let deleted = self.inv_repo.delete_invitation(&inv_id_key).await?;
        if !deleted {
            return Err(AppError::NotFound("invitation not found".into()));
        }
        Ok(())
    }

    #[instrument(level = "debug", err, skip(self, ctx))]
    pub async fn accept_invitation_for_user(
        &self,
        ctx: &AuthorizationContext,
        invitation_id: &str,
    ) -> Result<Team, AppError> {
        let inv_thing = invitation_thing(invitation_id)?;
        let row = self
            .inv_repo
            .get_invitation_with_team(&record_id_string(&inv_thing))
            .await?
            .ok_or_else(|| AppError::NotFound("invitation not found".into()))?;

        let team_row = row.team;
        let res = (
            team_row.id.table.to_string(),
            crate::database::record_id_string(&team_row.id),
        );
        if is_public_resource(&res) {
            return Err(AppError::NotFound("invitation not found".into()));
        }

        let stored = team_fetched_to_stored(&team_row)?;

        let team_id_str = crate::database::record_id_string(&team_row.id);
        let uid = ctx.user.id.clone();

        // Personal team owner is not listed in `members`; accept is idempotent (same as for admin).
        if let Some(ref o) = stored.owner
            && thing_user_id(o) == uid
        {
            let team = self.team_repo.load_team_display(&team_id_str).await?;
            audit_invitation_accepted(&team_id_str, invitation_id, &ctx.user.id);
            return Ok(team);
        }

        let mut map: BTreeMap<String, DbTeamMember> = BTreeMap::new();
        for m in &stored.members {
            map.insert(thing_user_id(&m.user), m.clone());
        }
        let needs_guest = match map.get(&uid).map(|m| m.role.as_str()) {
            Some("admin") | Some("content_maintainer") | Some("guest") => false,
            None => true,
            Some(_) => true,
        };

        if !needs_guest {
            let team = self.team_repo.load_team_display(&team_id_str).await?;
            audit_invitation_accepted(&team_id_str, invitation_id, &ctx.user.id);
            return Ok(team);
        }

        map.insert(
            uid.clone(),
            DbTeamMember {
                user: user_thing(&uid),
                role: "guest".to_owned(),
            },
        );
        let members: Vec<DbTeamMember> = map.into_values().collect();
        let resource = (
            team_row.id.table.to_string(),
            crate::database::record_id_string(&team_row.id),
        );
        self.team_repo
            .update_team_members(resource, members)
            .await?;

        let team = self.team_repo.load_team_display(&team_id_str).await?;
        audit_invitation_accepted(&team_id_str, invitation_id, &ctx.user.id);
        Ok(team)
    }

    /// Like [`accept_invitation_for_user`], but ensures the invitation belongs to `team_id`.
    #[instrument(level = "debug", err, skip(self, ctx))]
    pub async fn accept_invitation_for_user_on_team(
        &self,
        ctx: &AuthorizationContext,
        team_id: &str,
        invitation_id: &str,
    ) -> Result<Team, AppError> {
        let team = self.accept_invitation_for_user(ctx, invitation_id).await?;
        if team.id != team_id {
            return Err(AppError::NotFound("invitation not found".into()));
        }
        Ok(team)
    }

    /// Asserts that a team exists (not the public catalog team), and the user may manage
    /// invitations: [`effective_admin`] — shared-team **admin** member, or **owner** of a personal team.
    /// Returns the team `RecordId` for binding into queries.
    async fn assert_team_admin_for_invitations(
        &self,
        user_id: &str,
        team_id: &str,
    ) -> Result<RecordId, AppError> {
        let resource = team_resource_or_reject_public(team_id)?;
        let team_thing = RecordId::new(resource.0, resource.1);
        let row = self
            .team_repo
            .fetch_team(team_id)
            .await?
            .ok_or_else(|| AppError::NotFound("team not found".into()))?;

        let stored = team_fetched_to_stored(&row)?;
        if !member_or_owner_readable(user_id, &stored) {
            return Err(AppError::NotFound("team not found".into()));
        }
        if !effective_admin(user_id, &stored) {
            return Err(AppError::forbidden());
        }
        Ok(team_thing)
    }
}

/// Production type alias used in HTTP wiring.
pub type InvitationServiceHandle = InvitationService<SurrealTeamRepo, SurrealTeamInvitationRepo>;

impl InvitationServiceHandle {
    pub fn build(db: Arc<Database>) -> Self {
        InvitationService::new(
            SurrealTeamRepo::new(db.clone()),
            SurrealTeamInvitationRepo::new(db.clone()),
        )
    }
}

#[cfg(test)]
mod tests {
    use std::sync::{Arc, Mutex};

    use async_trait::async_trait;
    use surrealdb::types::{Datetime, RecordId};

    use shared::api::ListQuery;
    use shared::team::Team;
    use shared::user::User;

    use crate::error::AppError;
    use crate::resources::team::model::{
        DbTeamMember, TeamCreatePayload, TeamFetched, TeamMemberFetched,
    };
    use crate::resources::team::repository::TeamRepository;
    use crate::resources::user::UserRecord;

    use super::super::model::{InvitationAcceptRow, InvitationRow};
    use super::super::repository::TeamInvitationRepository;
    use super::InvitationService;

    // ── Test data helpers ─────────────────────────────────────────────────────

    fn make_user(id: &str) -> User {
        let mut u = User::new("test@example.com");
        u.id = id.to_owned();
        u
    }

    fn team_thing(id: &str) -> RecordId {
        RecordId::new("team", id)
    }

    fn inv_thing(id: &str) -> RecordId {
        RecordId::new("team_invitation", id)
    }

    fn member_fetched(user_id: &str, role: &str) -> TeamMemberFetched {
        TeamMemberFetched {
            user: UserRecord::from_user(make_user(user_id)),
            role: role.to_owned(),
        }
    }

    fn shared_team(team_id: &str, members: Vec<TeamMemberFetched>) -> TeamFetched {
        TeamFetched {
            id: team_thing(team_id),
            name: "Shared Team".to_owned(),
            owner: None,
            members,
        }
    }

    fn personal_team(team_id: &str, owner_id: &str) -> TeamFetched {
        TeamFetched {
            id: team_thing(team_id),
            name: "Personal".to_owned(),
            owner: Some(UserRecord::from_user(make_user(owner_id))),
            members: vec![],
        }
    }

    fn public_team_fetched() -> TeamFetched {
        TeamFetched {
            id: RecordId::new("team", "public"),
            name: "Public".to_owned(),
            owner: None,
            members: vec![],
        }
    }

    fn team_display() -> Team {
        Team {
            id: "t1".to_owned(),
            owner: None,
            name: "Shared Team".to_owned(),
            members: vec![],
        }
    }

    fn inv_row(inv_id: &str, for_team_id: &str) -> InvitationRow {
        InvitationRow {
            id: inv_thing(inv_id),
            team: team_thing(for_team_id),
            created_by: UserRecord::from_user(make_user("creator")),
            created_at: Datetime::default(),
        }
    }

    fn inv_accept_row(_inv_id: &str, team: TeamFetched) -> InvitationAcceptRow {
        InvitationAcceptRow { team }
    }

    // ── MockTeamRepo ──────────────────────────────────────────────────────────

    struct MockTeamRepo {
        team: Option<TeamFetched>,
        display: Team,
        update_members_called: Arc<Mutex<bool>>,
    }

    impl MockTeamRepo {
        fn with(team: TeamFetched) -> Self {
            Self {
                team: Some(team),
                display: team_display(),
                update_members_called: Arc::new(Mutex::new(false)),
            }
        }

        fn missing() -> Self {
            Self {
                team: None,
                display: team_display(),
                update_members_called: Arc::new(Mutex::new(false)),
            }
        }
    }

    #[async_trait]
    impl TeamRepository for MockTeamRepo {
        async fn fetch_team(&self, _id: &str) -> Result<Option<TeamFetched>, AppError> {
            Ok(self.team.clone())
        }

        async fn load_team_display(&self, _id: &str) -> Result<Team, AppError> {
            Ok(self.display.clone())
        }

        async fn update_team_members(
            &self,
            _resource: (String, String),
            _members: Vec<DbTeamMember>,
        ) -> Result<(), AppError> {
            *self.update_members_called.lock().unwrap() = true;
            Ok(())
        }

        async fn create_team(&self, _payload: TeamCreatePayload) -> Result<String, AppError> {
            unreachable!("not used in invitation tests")
        }

        async fn fetch_all_teams(&self) -> Result<Vec<TeamFetched>, AppError> {
            unreachable!("not used in invitation tests")
        }

        async fn fetch_teams_for_user(
            &self,
            _user_id: &str,
            _is_admin: bool,
        ) -> Result<Vec<TeamFetched>, AppError> {
            unreachable!("not used in invitation tests")
        }

        async fn count_teams_for_user_search(
            &self,
            _user_id: &str,
            _is_admin: bool,
            _q_trimmed: &str,
        ) -> Result<u64, AppError> {
            unreachable!("not used in invitation tests")
        }

        async fn fetch_teams_for_user_search(
            &self,
            _user_id: &str,
            _is_admin: bool,
            _pagination: &shared::api::ListQuery,
            _q_trimmed: &str,
        ) -> Result<Vec<TeamFetched>, AppError> {
            unreachable!("not used in invitation tests")
        }

        async fn update_team_name(
            &self,
            _resource: (String, String),
            _name: &str,
        ) -> Result<(), AppError> {
            unreachable!("not used in invitation tests")
        }

        async fn delete_team_record(&self, _resource: (String, String)) -> Result<(), AppError> {
            unreachable!("not used in invitation tests")
        }

        async fn reassign_content(&self, _from: RecordId, _to: RecordId) -> Result<(), AppError> {
            unreachable!("not used in invitation tests")
        }
    }

    // ── MockInvRepo ───────────────────────────────────────────────────────────

    struct MockInvRepo {
        invitation: Option<InvitationRow>,
        inv_with_team: Option<InvitationAcceptRow>,
        delete_ok: bool,
        list: Vec<InvitationRow>,
    }

    impl MockInvRepo {
        fn empty() -> Self {
            Self {
                invitation: None,
                inv_with_team: None,
                delete_ok: false,
                list: vec![],
            }
        }

        fn with_inv(row: InvitationRow) -> Self {
            Self {
                invitation: Some(row),
                inv_with_team: None,
                delete_ok: true,
                list: vec![],
            }
        }

        fn with_accept(row: InvitationAcceptRow) -> Self {
            Self {
                invitation: None,
                inv_with_team: Some(row),
                delete_ok: false,
                list: vec![],
            }
        }

        fn with_list(rows: Vec<InvitationRow>) -> Self {
            Self {
                invitation: None,
                inv_with_team: None,
                delete_ok: false,
                list: rows,
            }
        }
    }

    #[async_trait]
    impl TeamInvitationRepository for MockInvRepo {
        async fn create_invitation(
            &self,
            _team: RecordId,
            _created_by: RecordId,
            _inv_id: &str,
        ) -> Result<(), AppError> {
            Ok(())
        }

        async fn list_invitations(&self, _team: RecordId) -> Result<Vec<InvitationRow>, AppError> {
            Ok(self.list.clone())
        }

        async fn get_invitation(&self, _inv_id: &str) -> Result<Option<InvitationRow>, AppError> {
            Ok(self.invitation.clone())
        }

        async fn delete_invitation(&self, _inv_id: &str) -> Result<bool, AppError> {
            Ok(self.delete_ok)
        }

        async fn get_invitation_with_team(
            &self,
            _inv_id: &str,
        ) -> Result<Option<InvitationAcceptRow>, AppError> {
            Ok(self.inv_with_team.clone())
        }
    }

    fn make_svc(
        team: MockTeamRepo,
        inv: MockInvRepo,
    ) -> InvitationService<MockTeamRepo, MockInvRepo> {
        InvitationService::new(team, inv)
    }

    // ── Slice 2B: CRUD access control ─────────────────────────────────────────

    /// BLC-TINV-001, BLC-TINV-007: creating an invitation for a shared team as admin succeeds.
    #[tokio::test]
    async fn blc_tinv_001_create_shared_team_admin_ok() {
        let user = make_user("u1");
        let team = shared_team("t1", vec![member_fetched("u1", "admin")]);
        let svc = make_svc(
            MockTeamRepo::with(team),
            MockInvRepo::with_inv(inv_row("any", "t1")),
        );
        let r = svc
            .create_invitation_for_user(
                &crate::test_helpers::auth_ctx_test_personal_team(&user),
                "t1",
            )
            .await;
        assert!(r.is_ok());
    }

    /// BLC-TINV-001, BLC-TINV-007: personal team owner can create an invitation.
    #[tokio::test]
    async fn blc_tinv_001_create_personal_team_owner_ok() {
        let user = make_user("u1");
        let team = personal_team("t1", "u1");
        let svc = make_svc(
            MockTeamRepo::with(team),
            MockInvRepo::with_inv(inv_row("any", "t1")),
        );
        let r = svc
            .create_invitation_for_user(
                &crate::test_helpers::auth_ctx_test_personal_team(&user),
                "t1",
            )
            .await;
        assert!(r.is_ok());
    }

    /// BLC-TINV-001: creating an invitation for team:public is rejected before DB fetch.
    #[tokio::test]
    async fn blc_tinv_001_create_public_team_rejected() {
        let user = make_user("u1");
        let svc = make_svc(MockTeamRepo::missing(), MockInvRepo::empty());
        let r = svc
            .create_invitation_for_user(
                &crate::test_helpers::auth_ctx_test_personal_team(&user),
                "public",
            )
            .await;
        assert!(matches!(r, Err(AppError::NotFound(_))));
    }

    /// BLC-TINV-002: content_maintainer cannot create an invitation.
    #[tokio::test]
    async fn blc_tinv_002_create_content_maintainer_forbidden() {
        let user = make_user("u1");
        let team = shared_team("t1", vec![member_fetched("u1", "content_maintainer")]);
        let svc = make_svc(MockTeamRepo::with(team), MockInvRepo::empty());
        let r = svc
            .create_invitation_for_user(
                &crate::test_helpers::auth_ctx_test_personal_team(&user),
                "t1",
            )
            .await;
        assert!(matches!(r, Err(AppError::Forbidden)));
    }

    /// BLC-TINV-002: guest cannot create an invitation.
    #[tokio::test]
    async fn blc_tinv_002_create_guest_forbidden() {
        let user = make_user("u1");
        let team = shared_team("t1", vec![member_fetched("u1", "guest")]);
        let svc = make_svc(MockTeamRepo::with(team), MockInvRepo::empty());
        let r = svc
            .create_invitation_for_user(
                &crate::test_helpers::auth_ctx_test_personal_team(&user),
                "t1",
            )
            .await;
        assert!(matches!(r, Err(AppError::Forbidden)));
    }

    /// BLC-TINV-002: non-member gets not found.
    #[tokio::test]
    async fn blc_tinv_002_create_non_member_not_found() {
        let user = make_user("u1");
        let team = shared_team("t1", vec![member_fetched("u2", "admin")]);
        let svc = make_svc(MockTeamRepo::with(team), MockInvRepo::empty());
        let r = svc
            .create_invitation_for_user(
                &crate::test_helpers::auth_ctx_test_personal_team(&user),
                "t1",
            )
            .await;
        assert!(matches!(r, Err(AppError::NotFound(_))));
    }

    /// BLC-TINV-002, BLC-TINV-008: admin can list invitations for their team.
    #[tokio::test]
    async fn blc_tinv_002_list_admin_ok() {
        let user = make_user("u1");
        let team = shared_team("t1", vec![member_fetched("u1", "admin")]);
        let svc = make_svc(
            MockTeamRepo::with(team),
            MockInvRepo::with_list(vec![inv_row("inv1", "t1")]),
        );
        let r = svc
            .list_invitations_for_user(
                &crate::test_helpers::auth_ctx_test_personal_team(&user),
                "t1",
                ListQuery::default(),
            )
            .await;
        assert!(r.is_ok());
        assert_eq!(r.unwrap().0.len(), 1);
    }

    /// BLC-TINV-002: non-admin (guest) cannot list invitations.
    #[tokio::test]
    async fn blc_tinv_002_list_non_admin_forbidden() {
        let user = make_user("u1");
        let team = shared_team("t1", vec![member_fetched("u1", "guest")]);
        let svc = make_svc(MockTeamRepo::with(team), MockInvRepo::empty());
        let r = svc
            .list_invitations_for_user(
                &crate::test_helpers::auth_ctx_test_personal_team(&user),
                "t1",
                ListQuery::default(),
            )
            .await;
        assert!(matches!(r, Err(AppError::Forbidden)));
    }

    /// BLC-TINV-008: admin can get an invitation by id when team matches.
    #[tokio::test]
    async fn blc_tinv_008_get_admin_correct_team_ok() {
        let user = make_user("u1");
        let team = shared_team("t1", vec![member_fetched("u1", "admin")]);
        let svc = make_svc(
            MockTeamRepo::with(team),
            MockInvRepo::with_inv(inv_row("inv1", "t1")),
        );
        let r = svc
            .get_invitation_for_user(
                &crate::test_helpers::auth_ctx_test_personal_team(&user),
                "t1",
                "inv1",
            )
            .await;
        assert!(r.is_ok());
    }

    /// BLC-TINV-008: invitation belonging to a different team returns not found.
    #[tokio::test]
    async fn blc_tinv_008_get_admin_wrong_team_not_found() {
        let user = make_user("u1");
        let team = shared_team("t1", vec![member_fetched("u1", "admin")]);
        let svc = make_svc(
            MockTeamRepo::with(team),
            MockInvRepo::with_inv(inv_row("inv1", "t2")),
        );
        let r = svc
            .get_invitation_for_user(
                &crate::test_helpers::auth_ctx_test_personal_team(&user),
                "t1",
                "inv1",
            )
            .await;
        assert!(matches!(r, Err(AppError::NotFound(_))));
    }

    /// BLC-TINV-008: non-existent invitation id returns not found.
    #[tokio::test]
    async fn blc_tinv_008_get_nonexistent_not_found() {
        let user = make_user("u1");
        let team = shared_team("t1", vec![member_fetched("u1", "admin")]);
        let svc = make_svc(MockTeamRepo::with(team), MockInvRepo::empty());
        let r = svc
            .get_invitation_for_user(
                &crate::test_helpers::auth_ctx_test_personal_team(&user),
                "t1",
                "inv1",
            )
            .await;
        assert!(matches!(r, Err(AppError::NotFound(_))));
    }

    /// BLC-TINV-009: admin can delete an invitation.
    #[tokio::test]
    async fn blc_tinv_009_delete_admin_ok() {
        let user = make_user("u1");
        let team = shared_team("t1", vec![member_fetched("u1", "admin")]);
        let svc = make_svc(
            MockTeamRepo::with(team),
            MockInvRepo::with_inv(inv_row("inv1", "t1")),
        );
        let r = svc
            .delete_invitation_for_user(
                &crate::test_helpers::auth_ctx_test_personal_team(&user),
                "t1",
                "inv1",
            )
            .await;
        assert!(r.is_ok());
    }

    /// BLC-TINV-009: deleting a non-existent invitation returns not found.
    #[tokio::test]
    async fn blc_tinv_009_delete_nonexistent_not_found() {
        let user = make_user("u1");
        let team = shared_team("t1", vec![member_fetched("u1", "admin")]);
        let svc = make_svc(MockTeamRepo::with(team), MockInvRepo::empty());
        let r = svc
            .delete_invitation_for_user(
                &crate::test_helpers::auth_ctx_test_personal_team(&user),
                "t1",
                "inv1",
            )
            .await;
        assert!(matches!(r, Err(AppError::NotFound(_))));
    }

    /// BLC-TINV-009: non-admin (guest) cannot delete an invitation.
    #[tokio::test]
    async fn blc_tinv_009_delete_non_admin_forbidden() {
        let user = make_user("u1");
        let team = shared_team("t1", vec![member_fetched("u1", "guest")]);
        let svc = make_svc(MockTeamRepo::with(team), MockInvRepo::empty());
        let r = svc
            .delete_invitation_for_user(
                &crate::test_helpers::auth_ctx_test_personal_team(&user),
                "t1",
                "inv1",
            )
            .await;
        assert!(matches!(r, Err(AppError::Forbidden)));
    }

    // ── Slice 2C: accept flow ─────────────────────────────────────────────────

    /// BLC-TINV-010: accepting an invitation adds the user as a guest member.
    #[tokio::test]
    async fn blc_tinv_010_accept_new_user_becomes_guest() {
        let user = make_user("u1");
        // u1 is not a member — should be added as guest
        let team = shared_team("t1", vec![member_fetched("u2", "admin")]);
        let accept_row = inv_accept_row("inv1", team);
        let mock_team = MockTeamRepo::with(shared_team("t1", vec![member_fetched("u2", "admin")]));
        let update_called = mock_team.update_members_called.clone();
        let svc = make_svc(mock_team, MockInvRepo::with_accept(accept_row));
        let r = svc
            .accept_invitation_for_user(
                &crate::test_helpers::auth_ctx_test_personal_team(&user),
                "inv1",
            )
            .await;
        assert!(r.is_ok());
        assert!(
            *update_called.lock().unwrap(),
            "update_team_members must be called to add guest"
        );
    }

    /// BLC-TINV-001: accepting an invitation for team:public returns not found.
    #[tokio::test]
    async fn blc_tinv_001_accept_public_team_not_found() {
        let user = make_user("u1");
        let accept_row = inv_accept_row("inv1", public_team_fetched());
        let svc = make_svc(
            MockTeamRepo::missing(),
            MockInvRepo::with_accept(accept_row),
        );
        let r = svc
            .accept_invitation_for_user(
                &crate::test_helpers::auth_ctx_test_personal_team(&user),
                "inv1",
            )
            .await;
        assert!(matches!(r, Err(AppError::NotFound(_))));
    }

    /// BLC-TINV-010: accepting an invitation for a personal team adds the user as guest.
    #[tokio::test]
    async fn blc_tinv_010_accept_personal_team_adds_guest() {
        let user = make_user("u1");
        let team = personal_team("t1", "owner1");
        let accept_row = inv_accept_row("inv1", team.clone());
        let mock_team = MockTeamRepo::with(personal_team("t1", "owner1"));
        let update_called = mock_team.update_members_called.clone();
        let svc = make_svc(mock_team, MockInvRepo::with_accept(accept_row));
        let r = svc
            .accept_invitation_for_user(
                &crate::test_helpers::auth_ctx_test_personal_team(&user),
                "inv1",
            )
            .await;
        assert!(r.is_ok());
        assert!(
            *update_called.lock().unwrap(),
            "update_team_members must be called to add guest to personal team"
        );
    }

    /// BLC-TINV-010: personal team owner accepting an invitation does not add owner to members.
    #[tokio::test]
    async fn blc_tinv_010_accept_personal_team_owner_idempotent() {
        let user = make_user("owner1");
        let team = personal_team("t1", "owner1");
        let accept_row = inv_accept_row("inv1", team.clone());
        let mock_team = MockTeamRepo::with(team);
        let update_called = mock_team.update_members_called.clone();
        let svc = make_svc(mock_team, MockInvRepo::with_accept(accept_row));
        let r = svc
            .accept_invitation_for_user(
                &crate::test_helpers::auth_ctx_test_personal_team(&user),
                "inv1",
            )
            .await;
        assert!(r.is_ok());
        assert!(
            !*update_called.lock().unwrap(),
            "owner must not be inserted into members list"
        );
    }

    /// BLC-TINV-011: accepting when already content_maintainer does not downgrade the role.
    #[tokio::test]
    async fn blc_tinv_011_accept_content_maintainer_not_downgraded() {
        let user = make_user("u1");
        let team = shared_team(
            "t1",
            vec![
                member_fetched("u2", "admin"),
                member_fetched("u1", "content_maintainer"),
            ],
        );
        let accept_row = inv_accept_row("inv1", team);
        let mock_team = MockTeamRepo::with(shared_team("t1", vec![member_fetched("u2", "admin")]));
        let update_called = mock_team.update_members_called.clone();
        let svc = make_svc(mock_team, MockInvRepo::with_accept(accept_row));
        let r = svc
            .accept_invitation_for_user(
                &crate::test_helpers::auth_ctx_test_personal_team(&user),
                "inv1",
            )
            .await;
        assert!(r.is_ok());
        assert!(
            !*update_called.lock().unwrap(),
            "update_team_members must not downgrade content_maintainer to guest"
        );
    }

    /// BLC-TINV-011: accepting when already admin does not downgrade the role.
    #[tokio::test]
    async fn blc_tinv_011_accept_admin_not_downgraded() {
        let user = make_user("u1");
        let team = shared_team("t1", vec![member_fetched("u1", "admin")]);
        let accept_row = inv_accept_row("inv1", team);
        let mock_team = MockTeamRepo::with(shared_team("t1", vec![member_fetched("u1", "admin")]));
        let update_called = mock_team.update_members_called.clone();
        let svc = make_svc(mock_team, MockInvRepo::with_accept(accept_row));
        let r = svc
            .accept_invitation_for_user(
                &crate::test_helpers::auth_ctx_test_personal_team(&user),
                "inv1",
            )
            .await;
        assert!(r.is_ok());
        assert!(
            !*update_called.lock().unwrap(),
            "update_team_members must not downgrade admin to guest"
        );
    }

    /// BLC-TINV-012: accepting when already a guest does not create a duplicate member entry.
    #[tokio::test]
    async fn blc_tinv_012_accept_existing_guest_no_duplicate() {
        let user = make_user("u1");
        let team = shared_team(
            "t1",
            vec![member_fetched("u2", "admin"), member_fetched("u1", "guest")],
        );
        let accept_row = inv_accept_row("inv1", team);
        let mock_team = MockTeamRepo::with(shared_team("t1", vec![member_fetched("u2", "admin")]));
        let update_called = mock_team.update_members_called.clone();
        let svc = make_svc(mock_team, MockInvRepo::with_accept(accept_row));
        let r = svc
            .accept_invitation_for_user(
                &crate::test_helpers::auth_ctx_test_personal_team(&user),
                "inv1",
            )
            .await;
        assert!(r.is_ok());
        assert!(
            !*update_called.lock().unwrap(),
            "update_team_members must not be called when user is already a guest"
        );
    }

    /// BLC-TINV-014: accepting a non-existent invitation returns not found.
    #[tokio::test]
    async fn blc_tinv_014_accept_nonexistent_not_found() {
        let user = make_user("u1");
        let svc = make_svc(MockTeamRepo::missing(), MockInvRepo::empty());
        let r = svc
            .accept_invitation_for_user(
                &crate::test_helpers::auth_ctx_test_personal_team(&user),
                "inv1",
            )
            .await;
        assert!(matches!(r, Err(AppError::NotFound(_))));
    }

    mod integration {
        use crate::error::AppError;
        use crate::test_helpers::{
            TeamFixture, create_user, invitation_service, team_service, test_db,
        };
        use shared::api::ListQuery;

        /// BLC-TINV-001, BLC-TINV-006, BLC-TINV-007: admin creates invitation; id is non-empty UUID.
        #[tokio::test]
        async fn blc_tinv_001_create_shared_team_admin_ok_integration() {
            let db = test_db().await.expect("db");
            let fx = TeamFixture::build(&db).await.expect("fixture");
            let svc = invitation_service(&db);
            let inv = svc
                .create_invitation_for_user(
                    &crate::test_helpers::auth_ctx_for_user(&db, &fx.admin_user)
                        .await
                        .expect("auth"),
                    &fx.shared_team_id,
                )
                .await
                .expect("create");
            assert!(!inv.id.is_empty());
            assert!(inv.id.len() >= 32, "invitation id must be UUID-length");
        }

        /// BLC-TINV-001: personal team owner can create invitation.
        #[tokio::test]
        async fn blc_tinv_001_personal_team_owner_create_ok_integration() {
            let db = test_db().await.expect("db");
            let fx = TeamFixture::build(&db).await.expect("fixture");
            let svc = invitation_service(&db);
            let inv = svc
                .create_invitation_for_user(
                    &crate::test_helpers::auth_ctx_for_user(&db, &fx.owner)
                        .await
                        .expect("auth"),
                    &fx.personal_team_id,
                )
                .await
                .expect("create");
            assert_eq!(inv.team_id, fx.personal_team_id);
        }

        /// BLC-TINV-010: guest accepts invitation to owner's personal team.
        #[tokio::test]
        async fn blc_tinv_010_accept_personal_team_guest_integration() {
            let db = test_db().await.expect("db");
            let fx = TeamFixture::build(&db).await.expect("fixture");
            let svc = invitation_service(&db);
            let inv = svc
                .create_invitation_for_user(
                    &crate::test_helpers::auth_ctx_for_user(&db, &fx.owner)
                        .await
                        .expect("auth"),
                    &fx.personal_team_id,
                )
                .await
                .expect("create");
            let team = svc
                .accept_invitation_for_user(
                    &crate::test_helpers::auth_ctx_for_user(&db, &fx.guest)
                        .await
                        .expect("auth"),
                    &inv.id,
                )
                .await
                .expect("accept");
            assert_eq!(team.id, fx.personal_team_id);
            let is_guest = team
                .members
                .iter()
                .any(|m| m.user.id == fx.guest.id && m.role == shared::team::TeamRole::Guest);
            assert!(is_guest, "accepted user must be a guest member");
        }

        /// BLC-TINV-002: content_maintainer cannot create invitation.
        #[tokio::test]
        async fn blc_tinv_002_content_maintainer_forbidden_integration() {
            let db = test_db().await.expect("db");
            let fx = TeamFixture::build(&db).await.expect("fixture");
            let svc = invitation_service(&db);
            let r = svc
                .create_invitation_for_user(
                    &crate::test_helpers::auth_ctx_for_user(&db, &fx.writer)
                        .await
                        .expect("auth"),
                    &fx.shared_team_id,
                )
                .await;
            assert!(matches!(r, Err(AppError::Forbidden)));
        }

        /// BLC-TINV-008: admin can list invitations.
        #[tokio::test]
        async fn blc_tinv_008_admin_list_ok_integration() {
            let db = test_db().await.expect("db");
            let fx = TeamFixture::build(&db).await.expect("fixture");
            let svc = invitation_service(&db);
            svc.create_invitation_for_user(
                &crate::test_helpers::auth_ctx_for_user(&db, &fx.admin_user)
                    .await
                    .expect("auth"),
                &fx.shared_team_id,
            )
            .await
            .expect("create");
            let (list, _) = svc
                .list_invitations_for_user(
                    &crate::test_helpers::auth_ctx_for_user(&db, &fx.admin_user)
                        .await
                        .expect("auth"),
                    &fx.shared_team_id,
                    ListQuery::default(),
                )
                .await
                .expect("list");
            assert_eq!(list.len(), 1);
        }

        /// BLC-TINV-008: admin can get invitation by id.
        #[tokio::test]
        async fn blc_tinv_008_admin_get_by_id_integration() {
            let db = test_db().await.expect("db");
            let fx = TeamFixture::build(&db).await.expect("fixture");
            let svc = invitation_service(&db);
            let inv = svc
                .create_invitation_for_user(
                    &crate::test_helpers::auth_ctx_for_user(&db, &fx.admin_user)
                        .await
                        .expect("auth"),
                    &fx.shared_team_id,
                )
                .await
                .expect("create");
            let fetched = svc
                .get_invitation_for_user(
                    &crate::test_helpers::auth_ctx_for_user(&db, &fx.admin_user)
                        .await
                        .expect("auth"),
                    &fx.shared_team_id,
                    &inv.id,
                )
                .await
                .expect("get");
            assert_eq!(fetched.id, inv.id);
        }

        /// BLC-TINV-008: admin GET invitation belonging to different team returns NotFound.
        #[tokio::test]
        async fn blc_tinv_008_wrong_team_not_found_integration() {
            let db = test_db().await.expect("db");
            let fx = TeamFixture::build(&db).await.expect("fixture");
            let svc = invitation_service(&db);
            let inv = svc
                .create_invitation_for_user(
                    &crate::test_helpers::auth_ctx_for_user(&db, &fx.admin_user)
                        .await
                        .expect("auth"),
                    &fx.shared_team_id,
                )
                .await
                .expect("create");
            let team_svc = team_service(&db);
            let other_team = team_svc
                .create_shared_team_for_user(
                    &fx.admin_user,
                    shared::team::CreateTeam {
                        name: "Other".into(),
                        members: vec![],
                    },
                )
                .await
                .expect("other team");
            let r = svc
                .get_invitation_for_user(
                    &crate::test_helpers::auth_ctx_for_user(&db, &fx.admin_user)
                        .await
                        .expect("auth"),
                    &other_team.id,
                    &inv.id,
                )
                .await;
            assert!(matches!(r, Err(AppError::NotFound(_))));
        }

        /// BLC-TINV-004, BLC-TINV-009: admin deletes invitation; subsequent GET returns NotFound.
        #[tokio::test]
        async fn blc_tinv_004_delete_removes_invitation() {
            let db = test_db().await.expect("db");
            let fx = TeamFixture::build(&db).await.expect("fixture");
            let svc = invitation_service(&db);
            let inv = svc
                .create_invitation_for_user(
                    &crate::test_helpers::auth_ctx_for_user(&db, &fx.admin_user)
                        .await
                        .expect("auth"),
                    &fx.shared_team_id,
                )
                .await
                .expect("create");
            svc.delete_invitation_for_user(
                &crate::test_helpers::auth_ctx_for_user(&db, &fx.admin_user)
                    .await
                    .expect("auth"),
                &fx.shared_team_id,
                &inv.id,
            )
            .await
            .expect("delete");
            let r = svc
                .get_invitation_for_user(
                    &crate::test_helpers::auth_ctx_for_user(&db, &fx.admin_user)
                        .await
                        .expect("auth"),
                    &fx.shared_team_id,
                    &inv.id,
                )
                .await;
            assert!(matches!(r, Err(AppError::NotFound(_))));
        }

        /// BLC-TINV-004: deleted invitation cannot be accepted.
        #[tokio::test]
        async fn blc_tinv_004_deleted_invitation_accept_not_found() {
            let db = test_db().await.expect("db");
            let fx = TeamFixture::build(&db).await.expect("fixture");
            let svc = invitation_service(&db);
            let inv = svc
                .create_invitation_for_user(
                    &crate::test_helpers::auth_ctx_for_user(&db, &fx.admin_user)
                        .await
                        .expect("auth"),
                    &fx.shared_team_id,
                )
                .await
                .expect("create");
            svc.delete_invitation_for_user(
                &crate::test_helpers::auth_ctx_for_user(&db, &fx.admin_user)
                    .await
                    .expect("auth"),
                &fx.shared_team_id,
                &inv.id,
            )
            .await
            .expect("delete");
            let new_user = create_user(&db, "tinv004accept@test.local")
                .await
                .expect("u");
            let r = svc
                .accept_invitation_for_user(
                    &crate::test_helpers::auth_ctx_for_user(&db, &new_user)
                        .await
                        .expect("auth"),
                    &inv.id,
                )
                .await;
            assert!(matches!(r, Err(AppError::NotFound(_))));
        }

        /// BLC-TINV-010: new user accepts invitation and becomes a guest member.
        #[tokio::test]
        async fn blc_tinv_010_accept_new_user_becomes_guest_integration() {
            let db = test_db().await.expect("db");
            let fx = TeamFixture::build(&db).await.expect("fixture");
            let svc = invitation_service(&db);
            let new_user = create_user(&db, "tinv010@test.local").await.expect("u");
            let inv = svc
                .create_invitation_for_user(
                    &crate::test_helpers::auth_ctx_for_user(&db, &fx.admin_user)
                        .await
                        .expect("auth"),
                    &fx.shared_team_id,
                )
                .await
                .expect("create");
            let team = svc
                .accept_invitation_for_user(
                    &crate::test_helpers::auth_ctx_for_user(&db, &new_user)
                        .await
                        .expect("auth"),
                    &inv.id,
                )
                .await
                .expect("accept");
            let is_guest = team
                .members
                .iter()
                .any(|m| m.user.id == new_user.id && m.role == shared::team::TeamRole::Guest);
            assert!(is_guest, "accepted user must be a guest member");
        }

        /// BLC-TINV-005: invitation still exists after being accepted.
        #[tokio::test]
        async fn blc_tinv_005_invitation_survives_accept() {
            let db = test_db().await.expect("db");
            let fx = TeamFixture::build(&db).await.expect("fixture");
            let svc = invitation_service(&db);
            let new_user = create_user(&db, "tinv005@test.local").await.expect("u");
            let inv = svc
                .create_invitation_for_user(
                    &crate::test_helpers::auth_ctx_for_user(&db, &fx.admin_user)
                        .await
                        .expect("auth"),
                    &fx.shared_team_id,
                )
                .await
                .expect("create");
            svc.accept_invitation_for_user(
                &crate::test_helpers::auth_ctx_for_user(&db, &new_user)
                    .await
                    .expect("auth"),
                &inv.id,
            )
            .await
            .expect("accept");
            let fetched = svc
                .get_invitation_for_user(
                    &crate::test_helpers::auth_ctx_for_user(&db, &fx.admin_user)
                        .await
                        .expect("auth"),
                    &fx.shared_team_id,
                    &inv.id,
                )
                .await
                .expect("still exists");
            assert_eq!(fetched.id, inv.id);
        }

        /// BLC-TINV-011: accepting when already content_maintainer keeps the existing role.
        #[tokio::test]
        async fn blc_tinv_011_content_maintainer_role_unchanged_integration() {
            let db = test_db().await.expect("db");
            let fx = TeamFixture::build(&db).await.expect("fixture");
            let svc = invitation_service(&db);
            let inv = svc
                .create_invitation_for_user(
                    &crate::test_helpers::auth_ctx_for_user(&db, &fx.admin_user)
                        .await
                        .expect("auth"),
                    &fx.shared_team_id,
                )
                .await
                .expect("create");
            let team = svc
                .accept_invitation_for_user(
                    &crate::test_helpers::auth_ctx_for_user(&db, &fx.writer)
                        .await
                        .expect("auth"),
                    &inv.id,
                )
                .await
                .expect("accept");
            let role = team
                .members
                .iter()
                .find(|m| m.user.id == fx.writer.id)
                .map(|m| m.role.clone());
            assert_eq!(
                role,
                Some(shared::team::TeamRole::ContentMaintainer),
                "content_maintainer must not be downgraded to guest"
            );
        }

        /// BLC-TINV-012: guest accepting the same invitation twice results in exactly one entry.
        #[tokio::test]
        async fn blc_tinv_012_accept_twice_no_duplicate() {
            let db = test_db().await.expect("db");
            let fx = TeamFixture::build(&db).await.expect("fixture");
            let svc = invitation_service(&db);
            let new_user = create_user(&db, "tinv012@test.local").await.expect("u");
            let inv = svc
                .create_invitation_for_user(
                    &crate::test_helpers::auth_ctx_for_user(&db, &fx.admin_user)
                        .await
                        .expect("auth"),
                    &fx.shared_team_id,
                )
                .await
                .expect("create");
            svc.accept_invitation_for_user(
                &crate::test_helpers::auth_ctx_for_user(&db, &new_user)
                    .await
                    .expect("auth"),
                &inv.id,
            )
            .await
            .expect("accept 1");
            let team = svc
                .accept_invitation_for_user(
                    &crate::test_helpers::auth_ctx_for_user(&db, &new_user)
                        .await
                        .expect("auth"),
                    &inv.id,
                )
                .await
                .expect("accept 2");
            let count = team
                .members
                .iter()
                .filter(|m| m.user.id == new_user.id)
                .count();
            assert_eq!(count, 1, "must not create duplicate member entries");
        }

        /// BLC-TINV-013: two different users can accept the same invitation; both become members.
        #[tokio::test]
        async fn blc_tinv_013_multiple_users_accept_same_invitation() {
            let db = test_db().await.expect("db");
            let fx = TeamFixture::build(&db).await.expect("fixture");
            let svc = invitation_service(&db);
            let user_a = create_user(&db, "tinv013a@test.local").await.expect("a");
            let user_b = create_user(&db, "tinv013b@test.local").await.expect("b");
            let inv = svc
                .create_invitation_for_user(
                    &crate::test_helpers::auth_ctx_for_user(&db, &fx.admin_user)
                        .await
                        .expect("auth"),
                    &fx.shared_team_id,
                )
                .await
                .expect("create");
            svc.accept_invitation_for_user(
                &crate::test_helpers::auth_ctx_for_user(&db, &user_a)
                    .await
                    .expect("auth"),
                &inv.id,
            )
            .await
            .expect("a accept");
            let team = svc
                .accept_invitation_for_user(
                    &crate::test_helpers::auth_ctx_for_user(&db, &user_b)
                        .await
                        .expect("auth"),
                    &inv.id,
                )
                .await
                .expect("b accept");
            assert!(team.members.iter().any(|m| m.user.id == user_a.id));
            assert!(team.members.iter().any(|m| m.user.id == user_b.id));
        }

        /// BLC-TINV-006: two invitations for the same team get different IDs.
        #[tokio::test]
        async fn blc_tinv_006_two_invitations_different_ids() {
            let db = test_db().await.expect("db");
            let fx = TeamFixture::build(&db).await.expect("fixture");
            let svc = invitation_service(&db);
            let inv1 = svc
                .create_invitation_for_user(
                    &crate::test_helpers::auth_ctx_for_user(&db, &fx.admin_user)
                        .await
                        .expect("auth"),
                    &fx.shared_team_id,
                )
                .await
                .expect("inv1");
            let inv2 = svc
                .create_invitation_for_user(
                    &crate::test_helpers::auth_ctx_for_user(&db, &fx.admin_user)
                        .await
                        .expect("auth"),
                    &fx.shared_team_id,
                )
                .await
                .expect("inv2");
            assert_ne!(inv1.id, inv2.id);
        }
    }
}
