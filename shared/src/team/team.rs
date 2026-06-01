use crate::patch::Patch;
use serde::{Deserialize, Serialize};

#[cfg(feature = "backend")]
#[allow(unused_imports)]
use serde_json::json;
#[cfg(feature = "backend")]
use utoipa::ToSchema;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
#[cfg_attr(feature = "backend", derive(ToSchema))]
pub enum TeamRole {
    Guest,
    ContentMaintainer,
    Admin,
}

/// User slice returned on team **GET** (`id` + `email` only, same naming as `User`).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "backend", derive(ToSchema))]
pub struct TeamUser {
    pub id: String,
    pub email: String,
}

/// User reference in **POST/PUT** team payloads (`id` only).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
#[cfg_attr(feature = "backend", derive(ToSchema))]
pub struct TeamUserRef {
    pub id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "backend", derive(ToSchema))]
pub struct TeamMember {
    pub user: TeamUser,
    pub role: TeamRole,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "backend", derive(ToSchema))]
#[cfg_attr(
    feature = "backend",
    schema(example = json!({
        "id": "team_example",
        "owner": { "id": "usr_example", "email": "owner@example.com" },
        "name": "Worship team",
        "cover": "",
        "members": [
            { "user": { "id": "usr_example", "email": "owner@example.com" }, "role": "admin" }
        ]
    }))
)]
pub struct Team {
    pub id: String,
    /// When set, this team is that user's personal team (1:1, not deletable). Not listed in `members`.
    pub owner: Option<TeamUser>,
    pub name: String,
    /// Cover art reference (client-resolved blob id or URL).
    #[serde(default)]
    pub cover: String,
    /// Everyone except the personal-team owner (if any).
    pub members: Vec<TeamMember>,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
#[serde(deny_unknown_fields)]
#[cfg_attr(feature = "backend", derive(ToSchema))]
#[cfg_attr(
    feature = "backend",
    schema(example = json!({ "name": "Worship team", "members": [] }))
)]
pub struct CreateTeam {
    pub name: String,
    /// Additional members (besides the creating user, who is always `admin`).
    #[serde(default)]
    pub members: Vec<TeamMemberInput>,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
#[serde(deny_unknown_fields)]
#[cfg_attr(feature = "backend", derive(ToSchema))]
pub struct UpdateTeam {
    pub name: String,
    /// When set, replaces the entire `members` list (shared teams must keep at least one `admin`).
    #[serde(default)]
    pub members: Option<Vec<TeamMemberInput>>,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
#[serde(deny_unknown_fields)]
#[cfg_attr(feature = "backend", derive(ToSchema))]
pub struct TeamMemberInput {
    pub user: TeamUserRef,
    pub role: TeamRole,
}

/// Partial update for a team. Absent fields are left unchanged.
///
/// `members` uses three-state semantics:
/// - absent → members list is not modified
/// - `null` → rejected (a team must always have members)
/// - `[…]` → replaces the entire members list
#[derive(Deserialize, Debug, Clone, PartialEq)]
#[serde(deny_unknown_fields)]
#[cfg_attr(feature = "backend", derive(ToSchema))]
pub struct PatchTeam {
    pub name: Option<String>,
    pub cover: Option<String>,
    #[serde(default)]
    #[cfg_attr(feature = "backend", schema(value_type = Option<Vec<TeamMemberInput>>))]
    pub members: Patch<Vec<TeamMemberInput>>,
}

impl CreateTeam {
    pub fn validate(&self) -> Result<(), String> {
        use crate::validation_limits::{MAX_TEAM_MEMBER_INPUTS, MAX_TEAM_NAME_LEN};
        let name = self.name.trim();
        if name.is_empty() {
            return Err("team name must not be empty".into());
        }
        if name.len() > MAX_TEAM_NAME_LEN {
            return Err(format!(
                "team name is too long (max {MAX_TEAM_NAME_LEN} characters)"
            ));
        }
        if self.members.len() > MAX_TEAM_MEMBER_INPUTS {
            return Err(format!(
                "too many members in request (max {MAX_TEAM_MEMBER_INPUTS})"
            ));
        }
        Ok(())
    }
}

impl UpdateTeam {
    pub fn validate(&self) -> Result<(), String> {
        use crate::validation_limits::{MAX_TEAM_MEMBER_INPUTS, MAX_TEAM_NAME_LEN};
        let name = self.name.trim();
        if name.is_empty() {
            return Err("team name must not be empty".into());
        }
        if name.len() > MAX_TEAM_NAME_LEN {
            return Err(format!(
                "team name is too long (max {MAX_TEAM_NAME_LEN} characters)"
            ));
        }
        if let Some(members) = &self.members {
            if members.len() > MAX_TEAM_MEMBER_INPUTS {
                return Err(format!(
                    "too many members in request (max {MAX_TEAM_MEMBER_INPUTS})"
                ));
            }
        }
        Ok(())
    }
}

#[cfg(test)]
mod validate_tests {
    use super::*;

    #[test]
    fn create_team_whitespace_name_fails() {
        let t = CreateTeam {
            name: "   \t".into(),
            members: vec![],
        };
        assert!(t.validate().is_err());
    }

    #[test]
    fn create_team_too_many_members_fails() {
        use crate::validation_limits::MAX_TEAM_MEMBER_INPUTS;
        let t = CreateTeam {
            name: "Ok".into(),
            members: (0..=MAX_TEAM_MEMBER_INPUTS)
                .map(|i| TeamMemberInput {
                    user: TeamUserRef {
                        id: format!("u{i}"),
                    },
                    role: TeamRole::Guest,
                })
                .collect(),
        };
        assert!(t.validate().is_err());
    }
}
