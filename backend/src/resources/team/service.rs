use std::collections::BTreeMap;

use std::sync::Arc;

use surrealdb::types::RecordId;

use shared::api::ListQuery;
use shared::patch::Patch;
use shared::team::{CreateTeam, PatchTeam, Team, UpdateTeam};
use shared::user::User;
use tracing::instrument;

use crate::auth::AuthorizationContext;
use crate::database::Database;
use crate::error::AppError;

use super::model::{
    DbTeamMember, TeamCreatePayload, build_create_shared_members, can_read_team, effective_admin,
    ensure_shared_team_has_admin_after_update, inputs_to_db_members, member_or_owner_readable,
    member_self_leave_payload, team_fetched_to_stored, team_resource_or_reject_public,
    thing_user_id, validate_personal_members_not_owner,
};
use super::repository::TeamRepository;
use super::surreal_repo::SurrealTeamRepo;

fn audit_team_member_role_changes(
    team_id: &str,
    actor_user_id: &str,
    before: &[DbTeamMember],
    after: &[DbTeamMember],
) {
    let old_map: BTreeMap<String, &str> = before
        .iter()
        .map(|m| (thing_user_id(&m.user), m.role.as_str()))
        .collect();
    for m in after {
        let uid = thing_user_id(&m.user);
        let old = old_map.get(&uid).copied().unwrap_or("");
        let new = m.role.as_str();
        if old != new {
            crate::audit!(
                "audit.team.role.changed",
                team_id = tracing::field::display(team_id),
                target_user_id = tracing::field::display(&uid),
                old_role = tracing::field::display(old),
                new_role = tracing::field::display(new),
                actor_user_id = tracing::field::display(actor_user_id)
                ; "team member role changed"
            );
        }
    }
}

/// Application service: authorization and orchestration for teams.
#[derive(Clone)]
pub struct TeamService<R> {
    pub repo: R,
}

impl<R> TeamService<R> {
    pub fn new(repo: R) -> Self {
        Self { repo }
    }
}

impl<R: TeamRepository> TeamService<R> {
    #[instrument(level = "debug", err, skip(self, user))]
    pub async fn list_teams_for_user(&self, user: &User) -> Result<Vec<Team>, AppError> {
        let rows = self.repo.fetch_teams_for_user(&user.id, false).await?;
        let mut by_id: BTreeMap<String, Team> = BTreeMap::new();
        for row in rows {
            let team = row.into_team()?;
            by_id.insert(team.id.clone(), team);
        }
        let mut list: Vec<Team> = by_id.into_values().collect();
        list.sort_by(|a, b| match (a.owner.is_some(), b.owner.is_some()) {
            (true, false) => std::cmp::Ordering::Less,
            (false, true) => std::cmp::Ordering::Greater,
            _ => a.id.cmp(&b.id),
        });
        Ok(list)
    }

    /// `q_trimmed` must be non-empty. Uses database search and pagination (see [`TeamRepository::fetch_teams_for_user_search`]).
    #[instrument(level = "debug", err, skip(self, user, pagination))]
    pub async fn list_teams_for_user_search(
        &self,
        user: &User,
        pagination: &ListQuery,
        q_trimmed: &str,
    ) -> Result<Vec<Team>, AppError> {
        let rows = self
            .repo
            .fetch_teams_for_user_search(&user.id, false, pagination, q_trimmed)
            .await?;
        let mut list = Vec::with_capacity(rows.len());
        for row in rows {
            list.push(row.into_team()?);
        }
        Ok(list)
    }

    #[instrument(level = "debug", err, skip(self, user))]
    pub async fn count_teams_for_user_search(
        &self,
        user: &User,
        q_trimmed: &str,
    ) -> Result<u64, AppError> {
        self.repo
            .count_teams_for_user_search(&user.id, false, q_trimmed)
            .await
    }

    #[instrument(level = "debug", err, skip(self, user))]
    pub async fn get_team_for_user(&self, user: &User, id: &str) -> Result<Team, AppError> {
        let row = self
            .repo
            .fetch_team(id)
            .await?
            .ok_or_else(|| AppError::NotFound("team not found".into()))?;
        let stored = team_fetched_to_stored(&row)?;
        if !can_read_team(&user.id, &stored, false) {
            return Err(AppError::NotFound("team not found".into()));
        }
        row.into_team()
    }

    #[instrument(level = "debug", err, skip(self, user, payload))]
    pub async fn create_shared_team_for_user(
        &self,
        user: &User,
        payload: CreateTeam,
    ) -> Result<Team, AppError> {
        let name = payload.name.trim().to_owned();
        if name.is_empty() {
            return Err(AppError::invalid_request("team name must not be empty"));
        }
        if name.len() > 256 {
            return Err(AppError::invalid_request(
                "team name is too long (max 256 characters)",
            ));
        }
        let members = build_create_shared_members(&user.id, &payload.members)?;
        let id = self
            .repo
            .create_team(TeamCreatePayload {
                name,
                owner: None,
                members,
            })
            .await?;
        self.repo.load_team_display(&id).await
    }

    #[instrument(level = "debug", err, skip(self, user, payload))]
    pub async fn update_team_for_user(
        &self,
        user: &User,
        id: &str,
        payload: UpdateTeam,
    ) -> Result<Team, AppError> {
        let resource = team_resource_or_reject_public(id)?;
        let name_trim = payload.name.trim().to_owned();
        if name_trim.is_empty() {
            return Err(AppError::invalid_request("team name must not be empty"));
        }
        if name_trim.len() > 256 {
            return Err(AppError::invalid_request(
                "team name is too long (max 256 characters)",
            ));
        }

        let row = self
            .repo
            .fetch_team(id)
            .await?
            .ok_or_else(|| AppError::NotFound("team not found".into()))?;

        let current_name = row.name.trim().to_owned();
        let stored = team_fetched_to_stored(&row)?;
        if !member_or_owner_readable(&user.id, &stored) {
            return Err(AppError::NotFound("team not found".into()));
        }

        let admin = effective_admin(&user.id, &stored);

        if !admin {
            let Some(ref inputs) = payload.members else {
                return Err(AppError::forbidden());
            };
            let new_members = inputs_to_db_members(inputs)?;
            if !member_self_leave_payload(
                &stored,
                &user.id,
                &current_name,
                &name_trim,
                &new_members,
            ) {
                return Err(AppError::forbidden());
            }
            if stored.owner.is_some() {
                let owner_id = stored
                    .owner
                    .as_ref()
                    .map(thing_user_id)
                    .ok_or_else(|| AppError::database("personal team missing owner"))?;
                validate_personal_members_not_owner(&owner_id, &new_members)?;
            } else {
                ensure_shared_team_has_admin_after_update(&new_members)?;
            }
            audit_team_member_role_changes(id, &user.id, &stored.members, &new_members);
            self.repo.update_team_members(resource, new_members).await?;
            return self.repo.load_team_display(id).await;
        }

        self.repo
            .update_team_name(resource.clone(), &name_trim)
            .await?;

        if let Some(inputs) = payload.members {
            let new_members = inputs_to_db_members(&inputs)?;
            if stored.owner.is_some() {
                let owner_id = stored
                    .owner
                    .as_ref()
                    .map(thing_user_id)
                    .ok_or_else(|| AppError::database("personal team missing owner"))?;
                validate_personal_members_not_owner(&owner_id, &new_members)?;
            } else {
                ensure_shared_team_has_admin_after_update(&new_members)?;
            }
            audit_team_member_role_changes(id, &user.id, &stored.members, &new_members);
            self.repo.update_team_members(resource, new_members).await?;
        }

        self.repo.load_team_display(id).await
    }

    #[instrument(level = "debug", err, skip(self, user, patch))]
    pub async fn patch_team_for_user(
        &self,
        user: &User,
        id: &str,
        patch: PatchTeam,
    ) -> Result<Team, AppError> {
        let current = self.get_team_for_user(user, id).await?;
        let name = patch.name.unwrap_or(current.name);
        let members = match patch.members {
            Patch::Missing => None,
            Patch::Null => {
                return Err(AppError::invalid_request(
                    "members cannot be set to null; omit the field to leave them unchanged",
                ));
            }
            Patch::Value(v) => Some(v),
        };
        self.update_team_for_user(user, id, UpdateTeam { name, members })
            .await
    }

    #[instrument(level = "debug", err, skip(self, ctx))]
    pub async fn delete_team_for_user(
        &self,
        ctx: &AuthorizationContext,
        id: &str,
    ) -> Result<Team, AppError> {
        let resource = team_resource_or_reject_public(id)?;

        let row = self
            .repo
            .fetch_team(id)
            .await?
            .ok_or_else(|| AppError::NotFound("team not found".into()))?;

        let stored = team_fetched_to_stored(&row)?;
        if stored.owner.is_some() {
            return Err(AppError::forbidden());
        }
        if !effective_admin(&ctx.user.id, &stored) {
            return Err(AppError::forbidden());
        }

        let team = row.into_team()?;
        let personal = ctx.personal_team()?;
        let from = RecordId::new(resource.0.clone(), resource.1.clone());
        self.repo.reassign_content(from, personal).await?;
        self.repo.delete_team_record(resource).await?;

        Ok(team)
    }
}

/// Production type alias used in HTTP wiring.
pub type TeamServiceHandle = TeamService<SurrealTeamRepo>;

impl TeamServiceHandle {
    pub fn build(db: Arc<Database>) -> Self {
        TeamService::new(SurrealTeamRepo::new(db.clone()))
    }
}

#[cfg(test)]
mod tests {
    use shared::api::ListQuery;
    use shared::team::{CreateTeam, TeamMemberInput, TeamRole, TeamUserRef, UpdateTeam};

    use crate::error::AppError;
    use crate::test_helpers::{
        TeamFixture, auth_ctx_for_user, collection_service, create_song_with_title, create_user,
        personal_team_id, team_service as mk_team_svc, test_db,
    };

    use super::*;

    fn team_service(db: &std::sync::Arc<crate::database::Database>) -> TeamServiceHandle {
        crate::test_helpers::team_service(db)
    }

    #[tokio::test]
    async fn blc_team_shared_create_and_list() {
        let db = test_db().await.expect("db");
        let u = create_user(&db, "team-creator@test.local")
            .await
            .expect("u");
        let svc = team_service(&db);
        let t = svc
            .create_shared_team_for_user(
                &u,
                CreateTeam {
                    name: "Band".into(),
                    members: vec![],
                },
            )
            .await
            .expect("shared team");

        assert!(!t.id.is_empty());
        assert_eq!(t.name, "Band");

        let teams = svc.list_teams_for_user(&u).await.expect("teams");
        assert!(teams.iter().any(|x| x.id == t.id));
    }

    #[tokio::test]
    async fn blc_team_personal_cannot_delete() {
        let db = test_db().await.expect("db");
        let u = create_user(&db, "team-personal@test.local")
            .await
            .expect("u");
        let svc = team_service(&db);
        let teams = svc.list_teams_for_user(&u).await.expect("teams");
        let personal = teams
            .iter()
            .find(|t| t.owner.as_ref().map(|o| o.id == u.id).unwrap_or(false))
            .expect("personal");
        let ctx = auth_ctx_for_user(&db, &u).await.expect("auth");
        let err = svc.delete_team_for_user(&ctx, &personal.id).await;
        assert!(matches!(err, Err(AppError::Forbidden)));
    }

    #[tokio::test]
    async fn blc_team_delete_shared_empty_team() {
        let db = test_db().await.expect("db");
        let u = create_user(&db, "team-del@test.local").await.expect("u");
        let svc = team_service(&db);
        let shared = svc
            .create_shared_team_for_user(
                &u,
                CreateTeam {
                    name: "ToRemove".into(),
                    members: vec![],
                },
            )
            .await
            .expect("shared");
        let ctx = auth_ctx_for_user(&db, &u).await.expect("auth");
        svc.delete_team_for_user(&ctx, &shared.id)
            .await
            .expect("delete");
    }

    /// BLC-TEAM-004: two shared teams with the same name can both be created.
    #[tokio::test]
    async fn blc_team_004_duplicate_names_allowed() {
        let db = test_db().await.expect("db");
        let u = create_user(&db, "team004@test.local").await.expect("u");
        let svc = team_service(&db);
        let t1 = svc
            .create_shared_team_for_user(
                &u,
                CreateTeam {
                    name: "Band".into(),
                    members: vec![],
                },
            )
            .await
            .expect("t1");
        let t2 = svc
            .create_shared_team_for_user(
                &u,
                CreateTeam {
                    name: "Band".into(),
                    members: vec![],
                },
            )
            .await
            .expect("t2");
        assert_ne!(t1.id, t2.id, "each team must get a distinct id");
        assert_eq!(t1.name, t2.name);
    }

    /// BLC-TEAM-007: member sees their own teams; non-member does not see the shared team.
    #[tokio::test]
    async fn blc_team_007_member_visible_nonmember_hidden() {
        let db = test_db().await.expect("db");
        let fx = TeamFixture::build(&db).await.expect("fixture");
        let svc = team_service(&db);

        let admin_teams: Vec<String> = svc
            .list_teams_for_user(&fx.admin_user)
            .await
            .expect("list admin")
            .into_iter()
            .map(|t| t.id)
            .collect();
        assert!(
            admin_teams.contains(&fx.shared_team_id),
            "admin member must see the shared team"
        );

        let nonmember_teams: Vec<String> = svc
            .list_teams_for_user(&fx.non_member)
            .await
            .expect("list non-member")
            .into_iter()
            .map(|t| t.id)
            .collect();
        assert!(
            !nonmember_teams.contains(&fx.shared_team_id),
            "non-member must not see the shared team"
        );
    }

    #[tokio::test]
    async fn blc_team_007_platform_admin_without_membership_sees_only_own_teams() {
        let db = test_db().await.expect("db");
        let fx = TeamFixture::build(&db).await.expect("fixture");
        let svc = team_service(&db);

        let admin_teams: Vec<String> = svc
            .list_teams_for_user(&fx.platform_admin)
            .await
            .expect("list platform admin")
            .into_iter()
            .map(|t| t.id)
            .collect();
        assert!(
            !admin_teams.contains(&fx.shared_team_id),
            "platform admin must not see teams they are not a member of"
        );
        assert!(
            !admin_teams.iter().any(|id| id == "public"),
            "team:public must never appear in the list"
        );
    }

    /// BLC-TEAM-007: get_team_for_user with the literal "public" id returns NotFound.
    #[tokio::test]
    async fn blc_team_007_get_public_not_found() {
        let db = test_db().await.expect("db");
        let u = create_user(&db, "team007pub@test.local").await.expect("u");
        let svc = team_service(&db);
        let r = svc.get_team_for_user(&u, "public").await;
        assert!(matches!(r, Err(AppError::NotFound(_))));
    }

    /// BLC-TEAM-010: guest member can read the shared team.
    #[tokio::test]
    async fn blc_team_010_guest_can_read() {
        let db = test_db().await.expect("db");
        let fx = TeamFixture::build(&db).await.expect("fixture");
        let svc = team_service(&db);
        svc.get_team_for_user(&fx.guest, &fx.shared_team_id)
            .await
            .expect("guest read");
    }

    /// BLC-TEAM-010: content_maintainer member can read the shared team.
    #[tokio::test]
    async fn blc_team_010_content_maintainer_can_read() {
        let db = test_db().await.expect("db");
        let fx = TeamFixture::build(&db).await.expect("fixture");
        let svc = team_service(&db);
        svc.get_team_for_user(&fx.writer, &fx.shared_team_id)
            .await
            .expect("writer read");
    }

    /// BLC-TEAM-010: non-member cannot read the shared team.
    #[tokio::test]
    async fn blc_team_010_non_member_not_found() {
        let db = test_db().await.expect("db");
        let fx = TeamFixture::build(&db).await.expect("fixture");
        let svc = team_service(&db);
        let r = svc
            .get_team_for_user(&fx.non_member, &fx.shared_team_id)
            .await;
        assert!(matches!(r, Err(AppError::NotFound(_))));
    }

    /// BLC-TEAM-012: team admin can change the shared team name.
    #[tokio::test]
    async fn blc_team_012_admin_changes_name() {
        let db = test_db().await.expect("db");
        let fx = TeamFixture::build(&db).await.expect("fixture");
        let svc = team_service(&db);
        let updated = svc
            .update_team_for_user(
                &fx.admin_user,
                &fx.shared_team_id,
                UpdateTeam {
                    name: "Renamed".into(),
                    members: None,
                },
            )
            .await
            .expect("rename");
        assert_eq!(updated.name, "Renamed");
    }

    /// BLC-TEAM-012: personal team owner can rename their personal team.
    #[tokio::test]
    async fn blc_team_012_personal_owner_changes_name() {
        let db = test_db().await.expect("db");
        let owner = create_user(&db, "team012personal@test.local")
            .await
            .expect("u");
        let tid = personal_team_id(&db, &owner).await.expect("tid");
        let svc = team_service(&db);
        let updated = svc
            .update_team_for_user(
                &owner,
                &tid,
                UpdateTeam {
                    name: "My Songs".into(),
                    members: None,
                },
            )
            .await
            .expect("rename");
        assert_eq!(updated.name, "My Songs");
    }

    /// BLC-TEAM-012: admin can update the member list.
    #[tokio::test]
    async fn blc_team_012_admin_changes_members() {
        let db = test_db().await.expect("db");
        let fx = TeamFixture::build(&db).await.expect("fixture");
        let new_user = create_user(&db, "team012new@test.local").await.expect("nu");
        let svc = team_service(&db);
        let updated = svc
            .update_team_for_user(
                &fx.admin_user,
                &fx.shared_team_id,
                UpdateTeam {
                    name: "Fixture Shared Team".into(),
                    members: Some(vec![
                        TeamMemberInput {
                            user: TeamUserRef {
                                id: fx.admin_user.id.clone(),
                            },
                            role: TeamRole::Admin,
                        },
                        TeamMemberInput {
                            user: TeamUserRef {
                                id: new_user.id.clone(),
                            },
                            role: TeamRole::Guest,
                        },
                    ]),
                },
            )
            .await
            .expect("update members");
        assert!(updated.members.iter().any(|m| m.user.id == new_user.id));
    }

    /// BLC-TEAM-011, BLC-TEAM-015: PUT that removes all admins returns Conflict.
    #[tokio::test]
    async fn blc_team_011_remove_all_admins_conflict() {
        let db = test_db().await.expect("db");
        let fx = TeamFixture::build(&db).await.expect("fixture");
        let svc = team_service(&db);
        // Replace member list with only a guest — no admin remains.
        let r = svc
            .update_team_for_user(
                &fx.admin_user,
                &fx.shared_team_id,
                UpdateTeam {
                    name: "Fixture Shared Team".into(),
                    members: Some(vec![TeamMemberInput {
                        user: TeamUserRef {
                            id: fx.guest.id.clone(),
                        },
                        role: TeamRole::Guest,
                    }]),
                },
            )
            .await;
        assert!(
            matches!(r, Err(AppError::Conflict(_))),
            "expected Conflict, got {r:?}"
        );
    }

    /// BLC-TEAM-013: guest performs a valid self-leave (name unchanged, removes only self).
    #[tokio::test]
    async fn blc_team_013_guest_self_leave_ok() {
        let db = test_db().await.expect("db");
        let fx = TeamFixture::build(&db).await.expect("fixture");
        let svc = team_service(&db);
        // Guest leaves: keep admin + writer, remove themselves.
        svc.update_team_for_user(
            &fx.guest,
            &fx.shared_team_id,
            UpdateTeam {
                name: "Fixture Shared Team".into(),
                members: Some(vec![
                    TeamMemberInput {
                        user: TeamUserRef {
                            id: fx.admin_user.id.clone(),
                        },
                        role: TeamRole::Admin,
                    },
                    TeamMemberInput {
                        user: TeamUserRef {
                            id: fx.writer.id.clone(),
                        },
                        role: TeamRole::ContentMaintainer,
                    },
                ]),
            },
        )
        .await
        .expect("self-leave");
        // Guest should no longer see the team.
        let r = svc.get_team_for_user(&fx.guest, &fx.shared_team_id).await;
        assert!(matches!(r, Err(AppError::NotFound(_))));
    }

    /// BLC-TEAM-013: guest cannot change the team name.
    #[tokio::test]
    async fn blc_team_013_guest_change_name_forbidden() {
        let db = test_db().await.expect("db");
        let fx = TeamFixture::build(&db).await.expect("fixture");
        let svc = team_service(&db);
        let r = svc
            .update_team_for_user(
                &fx.guest,
                &fx.shared_team_id,
                UpdateTeam {
                    name: "Hacked Name".into(),
                    members: Some(vec![
                        TeamMemberInput {
                            user: TeamUserRef {
                                id: fx.admin_user.id.clone(),
                            },
                            role: TeamRole::Admin,
                        },
                        TeamMemberInput {
                            user: TeamUserRef {
                                id: fx.writer.id.clone(),
                            },
                            role: TeamRole::ContentMaintainer,
                        },
                    ]),
                },
            )
            .await;
        assert!(matches!(r, Err(AppError::Forbidden)));
    }

    /// BLC-TEAM-013: guest cannot remove another member.
    #[tokio::test]
    async fn blc_team_013_guest_remove_other_member_forbidden() {
        let db = test_db().await.expect("db");
        let fx = TeamFixture::build(&db).await.expect("fixture");
        let svc = team_service(&db);
        // Guest tries to remove the writer but keep themselves.
        let r = svc
            .update_team_for_user(
                &fx.guest,
                &fx.shared_team_id,
                UpdateTeam {
                    name: "Fixture Shared Team".into(),
                    members: Some(vec![
                        TeamMemberInput {
                            user: TeamUserRef {
                                id: fx.admin_user.id.clone(),
                            },
                            role: TeamRole::Admin,
                        },
                        TeamMemberInput {
                            user: TeamUserRef {
                                id: fx.guest.id.clone(),
                            },
                            role: TeamRole::Guest,
                        },
                    ]),
                },
            )
            .await;
        assert!(matches!(r, Err(AppError::Forbidden)));
    }

    /// BLC-TEAM-013: content_maintainer can self-leave the shared team.
    #[tokio::test]
    async fn blc_team_013_content_maintainer_self_leave() {
        let db = test_db().await.expect("db");
        let fx = TeamFixture::build(&db).await.expect("fixture");
        let svc = team_service(&db);
        svc.update_team_for_user(
            &fx.writer,
            &fx.shared_team_id,
            UpdateTeam {
                name: "Fixture Shared Team".into(),
                members: Some(vec![
                    TeamMemberInput {
                        user: TeamUserRef {
                            id: fx.admin_user.id.clone(),
                        },
                        role: TeamRole::Admin,
                    },
                    TeamMemberInput {
                        user: TeamUserRef {
                            id: fx.guest.id.clone(),
                        },
                        role: TeamRole::Guest,
                    },
                ]),
            },
        )
        .await
        .expect("content_maintainer self-leave");
        let r = svc.get_team_for_user(&fx.writer, &fx.shared_team_id).await;
        assert!(matches!(r, Err(AppError::NotFound(_))));
    }

    /// BLC-TEAM-014: PUT on a personal team with a different owner is rejected.
    #[tokio::test]
    async fn blc_team_014_personal_team_owner_immutable() {
        let db = test_db().await.expect("db");
        let fx = TeamFixture::build(&db).await.expect("fixture");
        let svc = team_service(&db);
        // Admin tries to add the owner of the personal team as a member (which would effectively
        // place the owner in the members list, violating the personal team constraint).
        let r = svc
            .update_team_for_user(
                &fx.owner,
                &fx.personal_team_id,
                UpdateTeam {
                    name: "Personal".into(),
                    members: Some(vec![TeamMemberInput {
                        user: TeamUserRef {
                            id: fx.owner.id.clone(),
                        },
                        role: TeamRole::Guest,
                    }]),
                },
            )
            .await;
        assert!(
            matches!(r, Err(AppError::InvalidRequest(_))),
            "expected InvalidRequest when owner appears in member list, got {r:?}"
        );
    }

    /// BLC-TEAM-016: songs on a shared team are reassigned to the deleter's personal team.
    #[tokio::test]
    async fn blc_team_016_delete_reassigns_songs() {
        let db = test_db().await.expect("db");
        let fx = TeamFixture::build(&db).await.expect("fixture");
        let svc = mk_team_svc(&db);
        let song_svc = crate::test_helpers::song_service(&db);

        // Create a song on the shared team by a member (content_maintainer writes to their
        // personal team; for shared-team songs we need admin_user whose personal team owns
        // the song — team ownership of content follows the personal team of the creator).
        let song = create_song_with_title(&db, &fx.admin_user, "SharedSong")
            .await
            .expect("song");

        let admin_ctx = auth_ctx_for_user(&db, &fx.admin_user).await.expect("auth");
        svc.delete_team_for_user(&admin_ctx, &fx.shared_team_id)
            .await
            .expect("delete shared team");

        // admin_user's personal team now owns the song.
        let admin_personal = personal_team_id(&db, &fx.admin_user).await.expect("pt");
        let song_ctx = auth_ctx_for_user(&db, &fx.admin_user).await.expect("auth");
        let fetched = song_svc
            .get_song_for_user(&song_ctx, &song.id)
            .await
            .expect("get song");
        assert_eq!(
            fetched.owner, admin_personal,
            "song must be reassigned to admin's personal team"
        );
    }

    /// BLC-TEAM-016: collections on a shared team are reassigned on delete.
    #[tokio::test]
    async fn blc_team_016_delete_reassigns_collections() {
        let db = test_db().await.expect("db");
        let fx = TeamFixture::build(&db).await.expect("fixture");
        let svc = mk_team_svc(&db);
        let coll_svc = collection_service(&db);

        // admin_user creates a collection (owned by their personal team).
        let admin_ctx_coll = auth_ctx_for_user(&db, &fx.admin_user).await.expect("auth");
        let coll = coll_svc
            .create_collection_for_user(
                &admin_ctx_coll,
                shared::collection::CreateCollection {
                    owner: None,
                    title: "SharedColl".into(),
                    cover: "mysongs".into(),
                    songs: vec![],
                },
            )
            .await
            .expect("coll");

        let admin_ctx_del = auth_ctx_for_user(&db, &fx.admin_user).await.expect("auth");
        svc.delete_team_for_user(&admin_ctx_del, &fx.shared_team_id)
            .await
            .expect("delete");

        let admin_personal = personal_team_id(&db, &fx.admin_user).await.expect("pt");
        let fetched = coll_svc
            .get_collection_for_user(&admin_ctx_coll, &coll.id)
            .await
            .expect("get coll");
        assert_eq!(fetched.owner, admin_personal);
    }

    /// BLC-TEAM-016: non-admin cannot delete the shared team.
    #[tokio::test]
    async fn blc_team_016_non_admin_delete_forbidden() {
        let db = test_db().await.expect("db");
        let fx = TeamFixture::build(&db).await.expect("fixture");
        let svc = mk_team_svc(&db);
        let r = svc
            .delete_team_for_user(
                &auth_ctx_for_user(&db, &fx.guest).await.expect("auth"),
                &fx.shared_team_id,
            )
            .await;
        assert!(matches!(r, Err(AppError::Forbidden)));
    }

    /// BLC-TEAM-018: after shared team is deleted, former members no longer see it in their list.
    #[tokio::test]
    async fn blc_team_018_former_member_loses_visibility() {
        let db = test_db().await.expect("db");
        let fx = TeamFixture::build(&db).await.expect("fixture");
        let svc = mk_team_svc(&db);

        let admin_ctx = auth_ctx_for_user(&db, &fx.admin_user).await.expect("auth");
        svc.delete_team_for_user(&admin_ctx, &fx.shared_team_id)
            .await
            .expect("delete");

        let guest_teams: Vec<String> = svc
            .list_teams_for_user(&fx.guest)
            .await
            .expect("list")
            .into_iter()
            .map(|t| t.id)
            .collect();
        assert!(!guest_teams.contains(&fx.shared_team_id));
    }

    /// PATCH-TEAM-001: patch with only name changes name, members left unchanged.
    #[tokio::test]
    async fn patch_team_name_only_leaves_members_unchanged() {
        use shared::team::PatchTeam;
        let db = test_db().await.expect("db");
        let fx = TeamFixture::build(&db).await.expect("fixture");
        let svc = team_service(&db);

        let before = svc
            .get_team_for_user(&fx.admin_user, &fx.shared_team_id)
            .await
            .expect("before");
        let member_count = before.members.len();

        let updated = svc
            .patch_team_for_user(
                &fx.admin_user,
                &fx.shared_team_id,
                PatchTeam {
                    name: Some("Renamed via PATCH".into()),
                    members: shared::patch::Patch::Missing,
                },
            )
            .await
            .expect("patch name");

        assert_eq!(updated.name, "Renamed via PATCH");
        assert_eq!(
            updated.members.len(),
            member_count,
            "members must be unchanged"
        );
    }

    /// PATCH-TEAM-002: patch with explicit null for members is rejected.
    #[tokio::test]
    async fn patch_team_null_members_rejected() {
        use shared::team::PatchTeam;
        let db = test_db().await.expect("db");
        let fx = TeamFixture::build(&db).await.expect("fixture");
        let svc = team_service(&db);
        let r = svc
            .patch_team_for_user(
                &fx.admin_user,
                &fx.shared_team_id,
                PatchTeam {
                    name: None,
                    members: shared::patch::Patch::Null,
                },
            )
            .await;
        assert!(
            matches!(r, Err(AppError::InvalidRequest(_))),
            "expected InvalidRequest for Patch::Null members, got {r:?}"
        );
    }

    /// PATCH-TEAM-003: patch with neither name nor members is a name-preserving no-op.
    #[tokio::test]
    async fn patch_team_empty_body_preserves_name() {
        use shared::team::PatchTeam;
        let db = test_db().await.expect("db");
        let fx = TeamFixture::build(&db).await.expect("fixture");
        let svc = team_service(&db);

        let before = svc
            .get_team_for_user(&fx.admin_user, &fx.shared_team_id)
            .await
            .expect("before");

        let after = svc
            .patch_team_for_user(
                &fx.admin_user,
                &fx.shared_team_id,
                PatchTeam {
                    name: None,
                    members: shared::patch::Patch::Missing,
                },
            )
            .await
            .expect("empty patch");

        assert_eq!(after.name, before.name, "name must be preserved");
    }

    /// PATCH-TEAM-004: non-existent team returns NotFound.
    #[tokio::test]
    async fn patch_team_not_found() {
        use shared::team::PatchTeam;
        let db = test_db().await.expect("db");
        let u = create_user(&db, "patch-team-nf@test.local")
            .await
            .expect("u");
        let svc = team_service(&db);
        let r = svc
            .patch_team_for_user(
                &u,
                "never-existed-team",
                PatchTeam {
                    name: Some("x".into()),
                    members: shared::patch::Patch::Missing,
                },
            )
            .await;
        assert!(matches!(r, Err(AppError::NotFound(_))));
    }

    #[tokio::test]
    async fn patch_team_all_field_combinations() {
        use shared::patch::Patch;
        use shared::team::PatchTeam;

        for mask in 0u8..4 {
            let db = test_db().await.expect("db");
            let fx = TeamFixture::build(&db).await.expect("fixture");
            let svc = team_service(&db);

            let before = svc
                .get_team_for_user(&fx.admin_user, &fx.shared_team_id)
                .await
                .expect("before");

            let include_name = (mask & 0b01) != 0;
            let include_members = (mask & 0b10) != 0;
            let replacement_members = vec![
                TeamMemberInput {
                    user: TeamUserRef {
                        id: fx.admin_user.id.clone(),
                    },
                    role: TeamRole::Admin,
                },
                TeamMemberInput {
                    user: TeamUserRef {
                        id: fx.writer.id.clone(),
                    },
                    role: TeamRole::ContentMaintainer,
                },
            ];

            let patched = svc
                .patch_team_for_user(
                    &fx.admin_user,
                    &fx.shared_team_id,
                    PatchTeam {
                        name: include_name.then_some("PatchedName".into()),
                        members: if include_members {
                            Patch::Value(replacement_members.clone())
                        } else {
                            Patch::Missing
                        },
                    },
                )
                .await
                .expect("patch");

            let expected_name = if include_name {
                "PatchedName"
            } else {
                before.name.as_str()
            };
            assert_eq!(
                patched.name, expected_name,
                "mask={mask:02b}: name mismatch"
            );

            if include_members {
                assert_eq!(
                    patched.members.len(),
                    2,
                    "mask={mask:02b}: members mismatch"
                );
                assert!(
                    patched.members.iter().all(|m| m.user.id != fx.guest.id),
                    "mask={mask:02b}: guest should be removed from member list"
                );
            } else {
                assert_eq!(
                    patched.members.len(),
                    before.members.len(),
                    "mask={mask:02b}: members should remain unchanged"
                );
            }
        }
    }

    /// Verify that the DB-filtered `fetch_teams_for_user` path returns the same set of teams
    /// as the old fetch-all-then-filter-in-Rust path that it replaces.
    #[tokio::test]
    async fn list_teams_matches_fetch_all_then_filter() {
        let db = test_db().await.expect("db");
        let u = create_user(&db, "team-parity@test.local").await.expect("u");
        let other = create_user(&db, "team-parity-other@test.local")
            .await
            .expect("other");
        let svc = team_service(&db);

        // Create a shared team that the user belongs to
        let _member_team = svc
            .create_shared_team_for_user(
                &u,
                CreateTeam {
                    name: "MemberTeam".into(),
                    members: vec![],
                },
            )
            .await
            .expect("member team");

        // Create another shared team that the user does NOT belong to
        let _other_team = svc
            .create_shared_team_for_user(
                &other,
                CreateTeam {
                    name: "OtherTeam".into(),
                    members: vec![],
                },
            )
            .await
            .expect("other team");

        // New path: DB-filtered
        let new_path_ids: std::collections::BTreeSet<String> = svc
            .list_teams_for_user(&u)
            .await
            .expect("list new")
            .into_iter()
            .map(|t| t.id)
            .collect();

        // Old path: fetch all, filter in Rust
        let app_admin = u.role == shared::user::Role::Admin;
        let old_path_ids: std::collections::BTreeSet<String> = svc
            .repo
            .fetch_all_teams()
            .await
            .expect("fetch all")
            .into_iter()
            .filter(|row| {
                let stored = team_fetched_to_stored(row).expect("stored");
                can_read_team(&u.id, &stored, app_admin)
            })
            .map(|row| crate::database::record_id_string(&row.id))
            .collect();

        assert_eq!(
            new_path_ids, old_path_ids,
            "DB-filtered list must match Rust-side filter"
        );
    }

    /// `q` with email substring finds teams via owner (personal) and member `user` records (shared).
    #[tokio::test]
    async fn team_search_db_email_substring_matches_personal_and_shared_membership() {
        let db = test_db().await.expect("db");
        let u = create_user(&db, "team-search-email@test.local")
            .await
            .expect("u");
        let svc = team_service(&db);
        svc.create_shared_team_for_user(
            &u,
            CreateTeam {
                name: "OnlyShared".into(),
                members: vec![],
            },
        )
        .await
        .expect("shared");

        let needle = "team-search-email@test.local";
        let query = ListQuery::default().with_q(needle);
        let total = svc
            .count_teams_for_user_search(&u, needle)
            .await
            .expect("count");
        let page = svc
            .list_teams_for_user_search(&u, &query, needle)
            .await
            .expect("search");
        assert_eq!(page.len() as u64, total);
        assert_eq!(total, 2, "personal (owner email) + shared (member email)");
    }
}
