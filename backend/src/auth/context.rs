use std::sync::Arc;

use chrono::Utc;
use serde::Deserialize;
use shared::user::{Role as UserRole, User};
use surrealdb::types::{RecordId, SurrealValue};

use crate::database::record_id_string;
use crate::error::AppError;
use crate::resources::team::{public_team_thing, thing_record_key};

#[derive(Clone, Debug)]
pub struct AuthorizationContext {
    pub session: AuthorizedSession,
    pub user: AuthorizedUser,
    pub teams: Arc<[AuthorizedTeam]>,
}

#[derive(Clone, Debug)]
pub struct AuthorizedSession {
    pub id: String,
    pub expired: bool,
}

#[derive(Clone, Debug)]
pub struct AuthorizedUser {
    pub id: String,
    pub email: String,
    pub role: UserRole,
    pub oauth_picture_url: Option<String>,
    pub oauth_avatar_blob_id: Option<String>,
    pub avatar_blob_id: Option<String>,
}

#[derive(Clone, Debug)]
pub struct AuthorizedTeam {
    pub id: RecordId,
    pub owner_user_id: Option<String>,
    pub role: AuthorizedTeamRole,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum AuthorizedTeamRole {
    Admin,
    ContentMaintainer,
    Guest,
}

impl AuthorizationContext {
    pub fn is_app_admin(&self) -> bool {
        self.user.role == UserRole::Admin
    }

    pub fn personal_team(&self) -> Result<RecordId, AppError> {
        self.teams
            .iter()
            .find(|t| {
                t.owner_user_id
                    .as_deref()
                    .map(|o| o == self.user.id.as_str())
                    .unwrap_or(false)
            })
            .map(|t| t.id.clone())
            .ok_or_else(|| AppError::database("personal team not found for user"))
    }

    /// `team:public` plus every team the user owns or is a member of. No platform-admin shortcut.
    pub fn read_teams(&self) -> Vec<RecordId> {
        let public = public_team_thing();
        let mut out: Vec<RecordId> = Vec::with_capacity(self.teams.len() + 1);
        let mut seen = std::collections::BTreeSet::<String>::new();

        let mut push = |t: RecordId| {
            let key = thing_record_key(&t);
            if seen.insert(key) {
                out.push(t);
            }
        };

        push(public);
        for t in self.teams.iter() {
            push(t.id.clone());
        }
        out
    }

    /// Teams where the user may write library content (`admin` or `content_maintainer` on the team).
    /// Excludes `team:public`.
    pub fn write_teams(&self) -> Vec<RecordId> {
        let mut out: Vec<RecordId> = Vec::new();
        let mut seen = std::collections::BTreeSet::<String>::new();
        for t in self.teams.iter() {
            if matches!(
                t.role,
                AuthorizedTeamRole::Admin | AuthorizedTeamRole::ContentMaintainer
            ) {
                let key = thing_record_key(&t.id);
                if seen.insert(key) {
                    out.push(t.id.clone());
                }
            }
        }
        out
    }

    pub fn team_role(&self, team_id: &RecordId) -> Option<AuthorizedTeamRole> {
        let key = thing_record_key(team_id);
        self.teams
            .iter()
            .find(|t| thing_record_key(&t.id) == key)
            .map(|t| t.role)
    }

    pub fn effective_admin_on(&self, team_id: &RecordId) -> bool {
        let key = thing_record_key(team_id);
        self.teams.iter().any(|t| {
            thing_record_key(&t.id) == key
                && (matches!(t.role, AuthorizedTeamRole::Admin)
                    || t.owner_user_id.as_deref() == Some(self.user.id.as_str()))
        })
    }

    pub fn require_write_access_to_owner(&self, owner: &RecordId) -> Result<(), AppError> {
        let write_teams = self.write_teams();
        let key = thing_record_key(owner);
        if write_teams.iter().any(|t| thing_record_key(t) == key) {
            Ok(())
        } else {
            Err(AppError::NotFound("team not found".into()))
        }
    }

    pub fn acting_user(&self) -> User {
        User {
            id: self.user.id.clone(),
            email: self.user.email.clone(),
            role: self.user.role.clone(),
            created_at: Utc::now(),
            oauth_picture_url: self.user.oauth_picture_url.clone(),
            oauth_avatar_blob_id: self.user.oauth_avatar_blob_id.clone(),
            avatar_blob_id: self.user.avatar_blob_id.clone(),
        }
    }
}

#[derive(Debug, Deserialize, SurrealValue)]
pub(crate) struct AuthCtxRow {
    pub(crate) session: AuthCtxSession,
    pub(crate) user: Option<AuthCtxUser>,
    pub(crate) teams: Vec<AuthCtxTeam>,
}

#[derive(Debug, Deserialize, SurrealValue)]
pub(crate) struct AuthCtxBootstrapRow {
    pub(crate) user: Option<AuthCtxUser>,
    pub(crate) teams: Vec<AuthCtxTeam>,
}

#[derive(Debug, Deserialize, SurrealValue)]
pub(crate) struct AuthCtxSession {
    pub(crate) id: RecordId,
    pub(crate) expired: bool,
}

#[derive(Debug, Deserialize, SurrealValue)]
pub(crate) struct AuthCtxUser {
    pub(crate) id: RecordId,
    pub(crate) role: String,
    pub(crate) email: String,
    #[serde(default)]
    pub(crate) oauth_picture_url: Option<String>,
    #[serde(default)]
    pub(crate) oauth_avatar_blob_id: Option<RecordId>,
    #[serde(default)]
    pub(crate) avatar_blob_id: Option<RecordId>,
}

#[derive(Debug, Deserialize, SurrealValue)]
pub(crate) struct AuthCtxTeam {
    pub(crate) id: RecordId,
    #[serde(default)]
    pub(crate) owner: Option<RecordId>,
    pub(crate) role: String,
}

fn parse_user_role(s: &str) -> Result<UserRole, AppError> {
    match s.trim().to_lowercase().as_str() {
        "admin" => Ok(UserRole::Admin),
        "default" => Ok(UserRole::Default),
        _ => Err(AppError::database(format!(
            "invalid user role in auth context: {s}"
        ))),
    }
}

fn parse_team_role(s: &str) -> Result<AuthorizedTeamRole, AppError> {
    match s {
        "guest" => Ok(AuthorizedTeamRole::Guest),
        "content_maintainer" => Ok(AuthorizedTeamRole::ContentMaintainer),
        "admin" => Ok(AuthorizedTeamRole::Admin),
        _ => Err(AppError::database(format!(
            "invalid team role in auth context: {s}"
        ))),
    }
}

pub(crate) fn authorization_context_from_parts(
    session: AuthorizedSession,
    u: AuthCtxUser,
    teams: Vec<AuthCtxTeam>,
) -> Result<AuthorizationContext, AppError> {
    let user = AuthorizedUser {
        id: record_id_string(&u.id),
        email: u.email,
        role: parse_user_role(&u.role)?,
        oauth_picture_url: u.oauth_picture_url,
        oauth_avatar_blob_id: u.oauth_avatar_blob_id.map(|id| record_id_string(&id)),
        avatar_blob_id: u.avatar_blob_id.map(|id| record_id_string(&id)),
    };

    let mut authorized_teams: Vec<AuthorizedTeam> = Vec::with_capacity(teams.len());
    for t in teams {
        let owner_user_id = t.owner.map(|o| record_id_string(&o));
        authorized_teams.push(AuthorizedTeam {
            id: t.id,
            owner_user_id,
            role: parse_team_role(&t.role)?,
        });
    }

    Ok(AuthorizationContext {
        session,
        user,
        teams: authorized_teams.into_boxed_slice().into(),
    })
}

impl TryFrom<AuthCtxRow> for AuthorizationContext {
    type Error = AppError;

    fn try_from(row: AuthCtxRow) -> Result<Self, Self::Error> {
        let Some(u) = row.user else {
            return Err(AppError::database("authorization row missing user"));
        };

        let session = AuthorizedSession {
            id: record_id_string(&row.session.id),
            expired: row.session.expired,
        };

        authorization_context_from_parts(session, u, row.teams)
    }
}

impl TryFrom<AuthCtxBootstrapRow> for AuthorizationContext {
    type Error = AppError;

    fn try_from(row: AuthCtxBootstrapRow) -> Result<Self, Self::Error> {
        let Some(u) = row.user else {
            return Err(AppError::database(
                "authorization bootstrap row missing user",
            ));
        };
        let uid = record_id_string(&u.id);
        let session = AuthorizedSession {
            id: format!("bootstrap:{uid}"),
            expired: false,
        };
        authorization_context_from_parts(session, u, row.teams)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn rid_team(s: &str) -> RecordId {
        RecordId::new("team", s.to_owned())
    }

    fn rid_user(s: &str) -> RecordId {
        RecordId::new("user", s.to_owned())
    }

    fn ctx_with_teams(user_id: &str, teams: Vec<AuthorizedTeam>) -> AuthorizationContext {
        AuthorizationContext {
            session: AuthorizedSession {
                id: "sess".into(),
                expired: false,
            },
            user: AuthorizedUser {
                id: user_id.into(),
                email: "u@test.local".into(),
                role: UserRole::Default,
                oauth_picture_url: None,
                oauth_avatar_blob_id: None,
                avatar_blob_id: None,
            },
            teams: teams.into_boxed_slice().into(),
        }
    }

    #[test]
    fn read_teams_includes_public_and_user_teams() {
        let personal = rid_team("p1");
        let shared = rid_team("s1");
        let ctx = ctx_with_teams(
            "u1",
            vec![
                AuthorizedTeam {
                    id: personal.clone(),
                    owner_user_id: Some("u1".into()),
                    role: AuthorizedTeamRole::Admin,
                },
                AuthorizedTeam {
                    id: shared.clone(),
                    owner_user_id: None,
                    role: AuthorizedTeamRole::Guest,
                },
            ],
        );
        let keys: Vec<String> = ctx.read_teams().iter().map(thing_record_key).collect();
        assert!(keys.contains(&"team:public".into()));
        assert!(keys.contains(&thing_record_key(&personal)));
        assert!(keys.contains(&thing_record_key(&shared)));
    }

    #[test]
    fn write_teams_only_admin_and_content_maintainer() {
        let personal = rid_team("p1");
        let wteam = rid_team("w1");
        let gteam = rid_team("g1");
        let ctx = ctx_with_teams(
            "u1",
            vec![
                AuthorizedTeam {
                    id: personal.clone(),
                    owner_user_id: Some("u1".into()),
                    role: AuthorizedTeamRole::Admin,
                },
                AuthorizedTeam {
                    id: wteam.clone(),
                    owner_user_id: None,
                    role: AuthorizedTeamRole::ContentMaintainer,
                },
                AuthorizedTeam {
                    id: gteam.clone(),
                    owner_user_id: None,
                    role: AuthorizedTeamRole::Guest,
                },
            ],
        );
        let wt = ctx.write_teams();
        assert_eq!(wt.len(), 2);
        assert!(
            wt.iter()
                .any(|t| thing_record_key(t) == thing_record_key(&personal))
        );
        assert!(
            wt.iter()
                .any(|t| thing_record_key(t) == thing_record_key(&wteam))
        );
        assert!(
            !wt.iter()
                .any(|t| thing_record_key(t) == thing_record_key(&gteam))
        );
    }

    #[test]
    fn personal_team_finds_owner_row() {
        let personal = rid_team("p1");
        let ctx = ctx_with_teams(
            "u1",
            vec![AuthorizedTeam {
                id: personal.clone(),
                owner_user_id: Some("u1".into()),
                role: AuthorizedTeamRole::Admin,
            }],
        );
        assert_eq!(ctx.personal_team().unwrap(), personal);
    }

    #[test]
    fn require_write_access_hits_write_teams() {
        let personal = rid_team("p1");
        let ctx = ctx_with_teams(
            "u1",
            vec![AuthorizedTeam {
                id: personal.clone(),
                owner_user_id: Some("u1".into()),
                role: AuthorizedTeamRole::Admin,
            }],
        );
        assert!(ctx.require_write_access_to_owner(&personal).is_ok());
        assert!(matches!(
            ctx.require_write_access_to_owner(&rid_team("other")),
            Err(AppError::NotFound(_))
        ));
    }

    #[test]
    fn effective_admin_owner_or_team_admin() {
        let personal = rid_team("p1");
        let shared_admin = rid_team("sa");
        let shared_guest = rid_team("sg");
        let ctx = ctx_with_teams(
            "u1",
            vec![
                AuthorizedTeam {
                    id: personal.clone(),
                    owner_user_id: Some("u1".into()),
                    role: AuthorizedTeamRole::Admin,
                },
                AuthorizedTeam {
                    id: shared_admin.clone(),
                    owner_user_id: None,
                    role: AuthorizedTeamRole::Admin,
                },
                AuthorizedTeam {
                    id: shared_guest.clone(),
                    owner_user_id: None,
                    role: AuthorizedTeamRole::Guest,
                },
            ],
        );
        assert!(ctx.effective_admin_on(&personal));
        assert!(ctx.effective_admin_on(&shared_admin));
        assert!(!ctx.effective_admin_on(&shared_guest));
    }

    #[test]
    fn try_from_auth_row_maps_user_and_teams() {
        let row = AuthCtxRow {
            session: AuthCtxSession {
                id: RecordId::new("session", "abc"),
                expired: false,
            },
            user: Some(AuthCtxUser {
                id: rid_user("u1"),
                role: "default".into(),
                email: "e@test.local".into(),
                oauth_picture_url: None,
                oauth_avatar_blob_id: None,
                avatar_blob_id: None,
            }),
            teams: vec![AuthCtxTeam {
                id: rid_team("t1"),
                owner: Some(rid_user("u1")),
                role: "admin".into(),
            }],
        };
        let ctx = AuthorizationContext::try_from(row).unwrap();
        assert_eq!(ctx.session.id, "abc");
        assert_eq!(ctx.user.id, "u1");
        assert_eq!(ctx.teams.len(), 1);
        assert_eq!(ctx.teams[0].role, AuthorizedTeamRole::Admin);
    }
}
