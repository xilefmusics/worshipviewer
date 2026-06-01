use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use surrealdb::types::{RecordId, SurrealValue};

use shared::team::{Team, TeamMember, TeamMemberInput, TeamRole, TeamUser, TeamUserRef};

use crate::database::record_id_string;
use crate::error::AppError;
use crate::resources::user::UserRecord;

pub fn thing_record_key(t: &RecordId) -> String {
    format!("{}:{}", t.table, record_id_string(t))
}

#[cfg(test)]
pub fn team_content_writable(user_id: &str, stored: &TeamStored) -> bool {
    if let Some(ref o) = stored.owner
        && thing_user_id(o) == user_id
    {
        return true;
    }
    stored.members.iter().any(|m| {
        thing_user_id(&m.user) == user_id && (m.role == "admin" || m.role == "content_maintainer")
    })
}

pub fn build_create_shared_members(
    creator_id: &str,
    extra: &[TeamMemberInput],
) -> Result<Vec<DbTeamMember>, AppError> {
    let mut map: BTreeMap<String, DbTeamMember> = BTreeMap::new();
    map.insert(
        creator_id.to_owned(),
        DbTeamMember {
            user: user_thing(creator_id),
            role: role_str(&TeamRole::Admin).to_owned(),
        },
    );
    for m in extra {
        let uid = member_user_id(&m.user)?;
        if uid == creator_id {
            continue;
        }
        map.insert(
            uid.clone(),
            DbTeamMember {
                user: user_thing(&uid),
                role: role_str(&m.role).to_owned(),
            },
        );
    }
    let members: Vec<DbTeamMember> = map.into_values().collect();
    validate_shared_has_admin(&members)?;
    Ok(members)
}

pub fn inputs_to_db_members(inputs: &[TeamMemberInput]) -> Result<Vec<DbTeamMember>, AppError> {
    let mut map: BTreeMap<String, DbTeamMember> = BTreeMap::new();
    for m in inputs {
        let uid = member_user_id(&m.user)?;
        map.insert(
            uid.clone(),
            DbTeamMember {
                user: user_thing(&uid),
                role: role_str(&m.role).to_owned(),
            },
        );
    }
    Ok(map.into_values().collect())
}

pub fn member_user_id(user: &TeamUserRef) -> Result<String, AppError> {
    let id = user.id.trim();
    if id.is_empty() {
        return Err(AppError::invalid_request(
            "member user id must not be empty",
        ));
    }
    Ok(id.to_owned())
}

pub fn validate_shared_has_admin(members: &[DbTeamMember]) -> Result<(), AppError> {
    if !members.iter().any(|m| m.role == "admin") {
        return Err(AppError::invalid_request(
            "shared team must have at least one admin member",
        ));
    }
    Ok(())
}

/// After a membership update on an existing shared team (PUT), missing any admin is a conflict (e.g. sole admin leaving).
pub fn ensure_shared_team_has_admin_after_update(members: &[DbTeamMember]) -> Result<(), AppError> {
    if !members.iter().any(|m| m.role == "admin") {
        return Err(AppError::conflict(
            "cannot leave team as the sole admin; promote another admin or delete the team",
        ));
    }
    Ok(())
}

fn members_role_map(members: &[DbTeamMember]) -> BTreeMap<String, String> {
    members
        .iter()
        .map(|x| (thing_user_id(&x.user), x.role.clone()))
        .collect()
}

fn members_without_user(stored: &TeamStored, user_id: &str) -> Vec<DbTeamMember> {
    let u = user_thing(user_id);
    stored
        .members
        .iter()
        .filter(|m| m.user != u)
        .cloned()
        .collect()
}

/// Non-admins may only PUT to remove themselves: same team name and `members` exactly the current list minus the caller.
pub fn member_self_leave_payload(
    stored: &TeamStored,
    user_id: &str,
    current_name: &str,
    payload_name: &str,
    new_members: &[DbTeamMember],
) -> bool {
    let u = user_thing(user_id);
    if !stored.members.iter().any(|m| m.user == u) {
        return false;
    }
    if current_name.trim() != payload_name.trim() {
        return false;
    }
    let expected = members_without_user(stored, user_id);
    members_role_map(new_members) == members_role_map(&expected)
}

pub fn validate_personal_members_not_owner(
    owner_id: &str,
    members: &[DbTeamMember],
) -> Result<(), AppError> {
    let o_thing = user_thing(owner_id);
    if members.iter().any(|m| m.user == o_thing) {
        return Err(AppError::invalid_request(
            "personal team owner must not appear in members",
        ));
    }
    Ok(())
}

#[derive(Serialize, SurrealValue)]
pub struct TeamCreatePayload {
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub owner: Option<RecordId>,
    pub members: Vec<DbTeamMember>,
}

#[derive(Clone, Debug, Serialize, Deserialize, SurrealValue)]
pub struct DbTeamMember {
    pub user: RecordId,
    pub role: String,
}

#[derive(Clone, Debug, Deserialize, SurrealValue)]
pub struct TeamFetched {
    pub id: RecordId,
    pub name: String,
    #[serde(default)]
    pub cover: Option<String>,
    #[serde(default)]
    pub owner: Option<UserRecord>,
    #[serde(default)]
    pub members: Vec<TeamMemberFetched>,
}

#[derive(Clone, Debug, Deserialize, SurrealValue)]
pub struct TeamMemberFetched {
    pub user: UserRecord,
    pub role: String,
}

impl TeamFetched {
    pub fn into_team(self) -> Result<Team, AppError> {
        let id = record_id_string(&self.id);
        let owner = self.owner.map(user_record_to_team_user).transpose()?;
        let mut members = Vec::with_capacity(self.members.len());
        for m in self.members {
            members.push(TeamMember {
                user: user_record_to_team_user(m.user)?,
                role: parse_role(&m.role)?,
            });
        }
        Ok(Team {
            id,
            owner,
            name: self.name,
            cover: self.cover.unwrap_or_default(),
            members,
        })
    }
}

fn user_record_to_team_user(rec: UserRecord) -> Result<TeamUser, AppError> {
    let u = rec.into_user();
    Ok(TeamUser {
        id: u.id,
        email: u.email,
    })
}

#[derive(Debug, Deserialize, Serialize, SurrealValue)]
pub struct TeamIdRow {
    pub id: RecordId,
}

#[derive(Clone, Debug)]
pub struct TeamStored {
    pub owner: Option<RecordId>,
    pub members: Vec<DbTeamMember>,
}

pub fn team_fetched_to_stored(row: &TeamFetched) -> Result<TeamStored, AppError> {
    let owner = row
        .owner
        .as_ref()
        .map(|u| user_thing(&u.clone().into_user().id));
    let mut members = Vec::new();
    for m in &row.members {
        let uid = m.user.clone().into_user().id;
        members.push(DbTeamMember {
            user: user_thing(&uid),
            role: m.role.clone(),
        });
    }
    Ok(TeamStored { owner, members })
}

pub fn user_thing(user_id: &str) -> RecordId {
    RecordId::new("user", user_id.to_owned())
}

pub fn public_team_thing() -> RecordId {
    RecordId::new("team", "public")
}

pub fn is_public_resource(resource: &(String, String)) -> bool {
    resource.0 == "team" && resource.1 == "public"
}

/// `team:public` is seeded for internal use only (see migration). It is not exposed through the REST API.
pub fn team_resource_or_reject_public(id: &str) -> Result<(String, String), AppError> {
    let resource = team_resource(id)?;
    if is_public_resource(&resource) {
        return Err(AppError::NotFound("team not found".into()));
    }
    Ok(resource)
}

/// Parse a team id from an API `owner` field (create/move payloads). Trims; rejects empty strings and `team:public`.
pub fn parse_owner_record_id(owner: &str) -> Result<RecordId, AppError> {
    let t = owner.trim();
    if t.is_empty() {
        return Err(AppError::invalid_request("owner must not be empty"));
    }
    let (tb, sid) = team_resource_or_reject_public(t)?;
    Ok(RecordId::new(tb, sid))
}

fn team_resource(id: &str) -> Result<(String, String), AppError> {
    if id == "public" {
        return Ok(("team".to_owned(), "public".to_owned()));
    }
    if let Ok(rid) = RecordId::parse_simple(id)
        && rid.table.as_str() == "team"
    {
        return Ok(("team".to_owned(), record_id_string(&rid)));
    }
    Ok(("team".to_owned(), id.to_owned()))
}

pub fn thing_user_id(t: &RecordId) -> String {
    record_id_string(t)
}

pub fn member_or_owner_readable(user_id: &str, stored: &TeamStored) -> bool {
    if let Some(ref o) = stored.owner
        && thing_user_id(o) == user_id
    {
        return true;
    }
    stored
        .members
        .iter()
        .any(|m| thing_user_id(&m.user) == user_id)
}

/// List/get team: members, personal owner, or platform (`User.role` admin) for read-only API access.
pub fn can_read_team(user_id: &str, stored: &TeamStored, app_admin: bool) -> bool {
    app_admin || member_or_owner_readable(user_id, stored)
}

pub fn effective_admin(user_id: &str, stored: &TeamStored) -> bool {
    if let Some(ref o) = stored.owner
        && thing_user_id(o) == user_id
    {
        return true;
    }
    stored
        .members
        .iter()
        .any(|m| m.role == "admin" && thing_user_id(&m.user) == user_id)
}

fn parse_role(s: &str) -> Result<TeamRole, AppError> {
    match s {
        "guest" => Ok(TeamRole::Guest),
        "content_maintainer" => Ok(TeamRole::ContentMaintainer),
        "admin" => Ok(TeamRole::Admin),
        _ => Err(AppError::invalid_request("invalid team role")),
    }
}

fn role_str(r: &TeamRole) -> &'static str {
    match r {
        TeamRole::Guest => "guest",
        TeamRole::ContentMaintainer => "content_maintainer",
        TeamRole::Admin => "admin",
    }
}

#[cfg(test)]
mod tests {
    use std::collections::BTreeSet;

    use shared::team::{TeamMemberInput, TeamRole, TeamUserRef};
    use shared::user::User;
    use surrealdb::types::RecordId;

    use super::*;
    use crate::auth::load_authorization_context_for_user;
    use crate::database::Database;
    use crate::error::AppError;
    use crate::test_helpers::{seed_user, test_db};

    fn make_member(user_id: &str, role: &str) -> DbTeamMember {
        DbTeamMember {
            user: user_thing(user_id),
            role: role.to_owned(),
        }
    }

    fn make_stored(owner_id: Option<&str>, members: Vec<DbTeamMember>) -> TeamStored {
        TeamStored {
            owner: owner_id.map(user_thing),
            members,
        }
    }

    fn member_input(user_id: &str, role: TeamRole) -> TeamMemberInput {
        TeamMemberInput {
            user: TeamUserRef {
                id: user_id.to_owned(),
            },
            role,
        }
    }

    /// BLC-TEAM-011: shared team with exactly one admin is valid.
    #[test]
    fn blc_team_011_validate_shared_has_admin_one_admin_ok() {
        let members = vec![make_member("u1", "admin")];
        assert!(validate_shared_has_admin(&members).is_ok());
    }

    /// BLC-TEAM-011: shared team with two admins is valid.
    #[test]
    fn blc_team_011_validate_shared_has_admin_two_admins_ok() {
        let members = vec![make_member("u1", "admin"), make_member("u2", "admin")];
        assert!(validate_shared_has_admin(&members).is_ok());
    }

    /// BLC-TEAM-011: shared team with zero admins is invalid.
    #[test]
    fn blc_team_011_validate_shared_has_admin_zero_admins_err() {
        let members = vec![make_member("u1", "guest")];
        let err = validate_shared_has_admin(&members).unwrap_err();
        assert!(matches!(err, AppError::InvalidRequest(_)));
    }

    /// BLC-TEAM-011: shared team with only guests is invalid.
    #[test]
    fn blc_team_011_validate_shared_has_admin_only_guests_err() {
        let members = vec![
            make_member("u1", "guest"),
            make_member("u2", "content_maintainer"),
        ];
        let err = validate_shared_has_admin(&members).unwrap_err();
        assert!(matches!(err, AppError::InvalidRequest(_)));
    }

    /// BLC-TEAM-015: updating members while keeping one admin is ok.
    #[test]
    fn blc_team_015_ensure_admin_after_update_one_admin_ok() {
        let members = vec![make_member("u1", "admin")];
        assert!(ensure_shared_team_has_admin_after_update(&members).is_ok());
    }

    /// BLC-TEAM-015: removing the last admin during an update is a conflict.
    #[test]
    fn blc_team_015_ensure_admin_after_update_zero_admins_conflict() {
        let members = vec![make_member("u1", "guest")];
        let err = ensure_shared_team_has_admin_after_update(&members).unwrap_err();
        assert!(matches!(err, AppError::Conflict(_)));
    }

    /// BLC-TEAM-001: personal team with owner absent from members is valid.
    #[test]
    fn blc_team_001_validate_personal_members_not_owner_absent_ok() {
        let members = vec![make_member("other", "guest")];
        assert!(validate_personal_members_not_owner("ownerid", &members).is_ok());
    }

    /// BLC-TEAM-001: personal team with owner in members is invalid.
    #[test]
    fn blc_team_001_validate_personal_members_not_owner_present_err() {
        let members = vec![make_member("ownerid", "admin")];
        let err = validate_personal_members_not_owner("ownerid", &members).unwrap_err();
        assert!(matches!(err, AppError::InvalidRequest(_)));
    }

    /// BLC-TEAM-001: personal team with empty members list is valid.
    #[test]
    fn blc_team_001_validate_personal_members_not_owner_empty_ok() {
        assert!(validate_personal_members_not_owner("ownerid", &[]).is_ok());
    }

    #[test]
    fn member_user_id_valid_returns_trimmed_id() {
        let r = TeamUserRef {
            id: "abc".to_owned(),
        };
        assert_eq!(member_user_id(&r).unwrap(), "abc");
    }

    #[test]
    fn member_user_id_empty_string_err() {
        let r = TeamUserRef { id: String::new() };
        assert!(matches!(
            member_user_id(&r).unwrap_err(),
            AppError::InvalidRequest(_)
        ));
    }

    #[test]
    fn member_user_id_whitespace_only_err() {
        let r = TeamUserRef {
            id: "   ".to_owned(),
        };
        assert!(matches!(
            member_user_id(&r).unwrap_err(),
            AppError::InvalidRequest(_)
        ));
    }

    /// BLC-TEAM-002: creator alone produces a single admin member.
    #[test]
    fn blc_team_002_build_create_shared_members_creator_alone() {
        let members = build_create_shared_members("creator", &[]).unwrap();
        assert_eq!(members.len(), 1);
        assert_eq!(thing_user_id(&members[0].user), "creator");
        assert_eq!(members[0].role, "admin");
    }

    /// BLC-TEAM-008: creator + extra guest — creator is admin, guest is present.
    #[test]
    fn blc_team_008_build_create_shared_members_creator_plus_guest() {
        let extra = vec![member_input("guestuser", TeamRole::Guest)];
        let members = build_create_shared_members("creator", &extra).unwrap();
        assert_eq!(members.len(), 2);
        let creator_entry = members
            .iter()
            .find(|m| thing_user_id(&m.user) == "creator")
            .unwrap();
        assert_eq!(creator_entry.role, "admin");
        let guest_entry = members
            .iter()
            .find(|m| thing_user_id(&m.user) == "guestuser")
            .unwrap();
        assert_eq!(guest_entry.role, "guest");
    }

    /// BLC-TEAM-008: creator duplicated in extras as guest stays admin, no duplicate entry.
    #[test]
    fn blc_team_008_build_create_shared_members_creator_duplicate_stays_admin() {
        let extra = vec![member_input("creator", TeamRole::Guest)];
        let members = build_create_shared_members("creator", &extra).unwrap();
        assert_eq!(members.len(), 1);
        assert_eq!(members[0].role, "admin");
    }

    /// BLC-TEAM-008: creator + extra admin + extra guest — all present, creator is admin.
    #[test]
    fn blc_team_008_build_create_shared_members_mixed_roles() {
        let extra = vec![
            member_input("adminuser", TeamRole::Admin),
            member_input("guestuser", TeamRole::Guest),
        ];
        let members = build_create_shared_members("creator", &extra).unwrap();
        assert_eq!(members.len(), 3);
        let creator_role = members
            .iter()
            .find(|m| thing_user_id(&m.user) == "creator")
            .unwrap()
            .role
            .as_str();
        assert_eq!(creator_role, "admin");
    }

    /// BLC-TEAM-008: two extras with the same user id are deduplicated.
    #[test]
    fn blc_team_008_build_create_shared_members_deduplicates_extras() {
        let extra = vec![
            member_input("dupuser", TeamRole::Guest),
            member_input("dupuser", TeamRole::ContentMaintainer),
        ];
        let members = build_create_shared_members("creator", &extra).unwrap();
        let dup_count = members
            .iter()
            .filter(|m| thing_user_id(&m.user) == "dupuser")
            .count();
        assert_eq!(dup_count, 1);
    }

    /// Extra member with empty user id returns an error.
    #[test]
    fn build_create_shared_members_empty_extra_user_id_err() {
        let extra = vec![member_input("", TeamRole::Guest)];
        let err = build_create_shared_members("creator", &extra).unwrap_err();
        assert!(matches!(err, AppError::InvalidRequest(_)));
    }

    /// BLC-TEAM-003: personal team owner is effectively an admin.
    #[test]
    fn blc_team_003_effective_admin_personal_owner_true() {
        let stored = make_stored(Some("ownerid"), vec![]);
        assert!(effective_admin("ownerid", &stored));
    }

    /// BLC-TEAM-003: shared team admin member is effectively an admin.
    #[test]
    fn blc_team_003_effective_admin_shared_admin_member_true() {
        let stored = make_stored(None, vec![make_member("adminuser", "admin")]);
        assert!(effective_admin("adminuser", &stored));
    }

    /// BLC-TEAM-003: content_maintainer is not an effective admin.
    #[test]
    fn blc_team_003_effective_admin_content_maintainer_false() {
        let stored = make_stored(None, vec![make_member("cmuser", "content_maintainer")]);
        assert!(!effective_admin("cmuser", &stored));
    }

    /// BLC-TEAM-003: non-member is not an effective admin.
    #[test]
    fn blc_team_003_effective_admin_non_member_false() {
        let stored = make_stored(None, vec![make_member("someone", "admin")]);
        assert!(!effective_admin("outsider", &stored));
    }

    /// BLC-TEAM-007: personal team owner can read the team.
    #[test]
    fn blc_team_007_member_or_owner_readable_owner_true() {
        let stored = make_stored(Some("ownerid"), vec![]);
        assert!(member_or_owner_readable("ownerid", &stored));
    }

    /// BLC-TEAM-007: guest member can read the team.
    #[test]
    fn blc_team_007_member_or_owner_readable_guest_true() {
        let stored = make_stored(None, vec![make_member("guestuser", "guest")]);
        assert!(member_or_owner_readable("guestuser", &stored));
    }

    /// BLC-TEAM-007: non-member cannot read the team.
    #[test]
    fn blc_team_007_member_or_owner_readable_non_member_false() {
        let stored = make_stored(None, vec![make_member("someone", "admin")]);
        assert!(!member_or_owner_readable("outsider", &stored));
    }

    /// BLC-TEAM-007: non-member without platform admin cannot read team.
    #[test]
    fn blc_team_007_can_read_team_non_member_non_admin_false() {
        let stored = make_stored(None, vec![make_member("someone", "admin")]);
        assert!(!can_read_team("outsider", &stored, false));
    }

    /// BLC-TEAM-007: non-member platform admin can read team.
    #[test]
    fn blc_team_007_can_read_team_non_member_platform_admin_true() {
        let stored = make_stored(None, vec![make_member("someone", "admin")]);
        assert!(can_read_team("outsider", &stored, true));
    }

    /// BLC-TEAM-007: member without platform admin can read team.
    #[test]
    fn blc_team_007_can_read_team_member_non_admin_true() {
        let stored = make_stored(None, vec![make_member("memberuser", "guest")]);
        assert!(can_read_team("memberuser", &stored, false));
    }

    /// BLC-TEAM-013: correct self-removal returns true.
    #[test]
    fn blc_team_013_member_self_leave_payload_correct_removal_true() {
        let members = vec![
            make_member("leaver", "guest"),
            make_member("other", "admin"),
        ];
        let stored = make_stored(None, members);
        let new_members = vec![make_member("other", "admin")];
        assert!(member_self_leave_payload(
            &stored,
            "leaver",
            "My Team",
            "My Team",
            &new_members
        ));
    }

    /// BLC-TEAM-013: changing the name is not a valid self-leave.
    #[test]
    fn blc_team_013_member_self_leave_payload_name_changed_false() {
        let members = vec![
            make_member("leaver", "guest"),
            make_member("other", "admin"),
        ];
        let stored = make_stored(None, members);
        let new_members = vec![make_member("other", "admin")];
        assert!(!member_self_leave_payload(
            &stored,
            "leaver",
            "Original",
            "Changed",
            &new_members
        ));
    }

    /// BLC-TEAM-013: removing an extra member besides self is not a valid self-leave.
    #[test]
    fn blc_team_013_member_self_leave_payload_extra_removal_false() {
        let members = vec![
            make_member("leaver", "guest"),
            make_member("other1", "admin"),
            make_member("other2", "content_maintainer"),
        ];
        let stored = make_stored(None, members);
        // Removes both leaver and other2 — not allowed
        let new_members = vec![make_member("other1", "admin")];
        assert!(!member_self_leave_payload(
            &stored,
            "leaver",
            "Team",
            "Team",
            &new_members
        ));
    }

    /// BLC-TEAM-013: user not currently in members returns false.
    #[test]
    fn blc_team_013_member_self_leave_payload_not_in_members_false() {
        let stored = make_stored(None, vec![make_member("other", "admin")]);
        let new_members = vec![make_member("other", "admin")];
        assert!(!member_self_leave_payload(
            &stored,
            "outsider",
            "Team",
            "Team",
            &new_members
        ));
    }

    /// BLC-TEAM-013: names with surrounding whitespace are treated as equal.
    #[test]
    fn blc_team_013_member_self_leave_payload_whitespace_name_match_true() {
        let members = vec![
            make_member("leaver", "guest"),
            make_member("other", "admin"),
        ];
        let stored = make_stored(None, members);
        let new_members = vec![make_member("other", "admin")];
        assert!(member_self_leave_payload(
            &stored,
            "leaver",
            "  My Team  ",
            "My Team",
            &new_members
        ));
    }

    /// BLC-TEAM-007: plain "public" id is rejected with NotFound.
    #[test]
    fn blc_team_007_team_resource_or_reject_public_plain_public_not_found() {
        let err = team_resource_or_reject_public("public").unwrap_err();
        assert!(matches!(err, AppError::NotFound(_)));
    }

    /// BLC-TEAM-007: a plain non-public id is accepted.
    #[test]
    fn blc_team_007_team_resource_or_reject_public_plain_uuid_ok() {
        let result = team_resource_or_reject_public("some-uuid").unwrap();
        assert_eq!(result, ("team".to_owned(), "some-uuid".to_owned()));
    }

    /// BLC-TEAM-007: a "team:someid" RecordId string is accepted and parsed.
    #[test]
    fn blc_team_007_team_resource_or_reject_public_thing_string_ok() {
        let result = team_resource_or_reject_public("team:someid").unwrap();
        assert_eq!(result.0, "team");
        assert_eq!(result.1, "someid");
    }

    #[test]
    fn parse_role_guest_ok() {
        assert_eq!(parse_role("guest").unwrap(), TeamRole::Guest);
    }

    #[test]
    fn parse_role_content_maintainer_ok() {
        assert_eq!(
            parse_role("content_maintainer").unwrap(),
            TeamRole::ContentMaintainer
        );
    }

    #[test]
    fn parse_role_admin_ok() {
        assert_eq!(parse_role("admin").unwrap(), TeamRole::Admin);
    }

    #[test]
    fn parse_role_unknown_err() {
        let err = parse_role("superadmin").unwrap_err();
        assert!(matches!(err, AppError::InvalidRequest(_)));
    }

    #[test]
    fn parse_role_empty_err() {
        let err = parse_role("").unwrap_err();
        assert!(matches!(err, AppError::InvalidRequest(_)));
    }

    fn auth_acl_thing_key_set(things: &[RecordId]) -> BTreeSet<String> {
        things.iter().map(thing_record_key).collect()
    }

    async fn auth_acl_naive_read_teams(
        db: &Database,
        user: &User,
    ) -> Result<Vec<RecordId>, AppError> {
        let public_thing = public_team_thing();
        let rows = db
            .db
            .query("SELECT * FROM team WHERE id != $public FETCH owner, members.user")
            .bind(("public", public_thing.clone()))
            .await?
            .take::<Vec<TeamFetched>>(0)?;

        let mut out: Vec<RecordId> = Vec::new();
        let mut seen: BTreeSet<String> = BTreeSet::new();
        let mut push = |t: RecordId| {
            let key = thing_record_key(&t);
            if seen.insert(key) {
                out.push(t);
            }
        };
        push(public_thing);
        for row in rows {
            let stored = team_fetched_to_stored(&row)?;
            if can_read_team(&user.id, &stored, false) {
                push(row.id.clone());
            }
        }
        Ok(out)
    }

    async fn auth_acl_naive_write_teams(
        db: &Database,
        user: &User,
    ) -> Result<Vec<RecordId>, AppError> {
        let public_thing = public_team_thing();
        let rows = db
            .db
            .query("SELECT * FROM team WHERE id != $public FETCH owner, members.user")
            .bind(("public", public_thing))
            .await?
            .take::<Vec<TeamFetched>>(0)?;

        let mut out: Vec<RecordId> = Vec::new();
        let mut seen: BTreeSet<String> = BTreeSet::new();
        for row in rows {
            let stored = team_fetched_to_stored(&row)?;
            if team_content_writable(&user.id, &stored) {
                let key = thing_record_key(&row.id);
                if seen.insert(key) {
                    out.push(row.id.clone());
                }
            }
        }
        Ok(out)
    }

    #[tokio::test]
    async fn auth_ctx_read_teams_matches_naive_rust_filter() {
        let db = test_db().await.expect("test db");
        let user = seed_user(&db).await.expect("user");
        let ctx = load_authorization_context_for_user(db.as_ref(), &user.id)
            .await
            .expect("auth ctx query")
            .expect("auth ctx");
        let dbref: &Database = db.as_ref();
        let a = ctx.read_teams();
        let b = auth_acl_naive_read_teams(dbref, &user)
            .await
            .expect("rust read");
        assert_eq!(auth_acl_thing_key_set(&a), auth_acl_thing_key_set(&b));
    }

    #[tokio::test]
    async fn auth_ctx_write_teams_matches_naive_rust_filter() {
        let db = test_db().await.expect("test db");
        let user = seed_user(&db).await.expect("user");
        let ctx = load_authorization_context_for_user(db.as_ref(), &user.id)
            .await
            .expect("auth ctx query")
            .expect("auth ctx");
        let dbref: &Database = db.as_ref();
        let a = ctx.write_teams();
        let b = auth_acl_naive_write_teams(dbref, &user)
            .await
            .expect("rust write");
        assert_eq!(auth_acl_thing_key_set(&a), auth_acl_thing_key_set(&b));
    }
}
