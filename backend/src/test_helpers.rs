use std::sync::Arc;

use anyhow::Result as AnyResult;
use chordlib::types::Song as SongData;
use surrealdb::types::RecordId;

use crate::auth::context::{
    AuthorizationContext, AuthorizedSession, AuthorizedTeam, AuthorizedTeamRole, AuthorizedUser,
};
use crate::auth::load_authorization_context;
use crate::database::Database;
use crate::resources::User;
use crate::resources::blob::service::BlobServiceHandle;
use crate::resources::collection::service::CollectionServiceHandle;
use crate::resources::setlist::{SetlistService, SetlistServiceHandle, SurrealSetlistRepo};
use crate::resources::song::service::SongServiceHandle;
use crate::resources::team::TeamServiceHandle;
use crate::resources::team::invitation::InvitationServiceHandle;
use crate::resources::user::service::UserServiceHandle;
use crate::resources::user::session::service::SessionServiceHandle;
use shared::collection::CreateCollection;
use shared::setlist::CreateSetlist;
use shared::song::CreateSong;
use shared::team::{CreateTeam, TeamMemberInput, TeamRole, TeamUserRef, UpdateTeam};
use shared::user::Role as UserRole;

pub async fn test_db() -> AnyResult<Arc<Database>> {
    // Bare `mem://` is process-global in SurrealDB; parallel tests need distinct paths.
    let address = format!("mem://{}", uuid::Uuid::new_v4());
    let db = Database::connect(&address, "test", "test", None, None).await?;
    let path = concat!(env!("CARGO_MANIFEST_DIR"), "/db-migrations");
    db.migrate(path).await?;
    Ok(Arc::new(db))
}

pub async fn seed_user(db: &Arc<Database>) -> AnyResult<User> {
    Ok(user_service(db)
        .create_user(User::new("smoke@test.local"))
        .await?)
}

pub async fn create_user(db: &Arc<Database>, email: &str) -> AnyResult<User> {
    Ok(user_service(db).create_user(User::new(email)).await?)
}

/// Personal team id for the user (matches API `team.id` — record id string only).
pub async fn personal_team_id(db: &Arc<Database>, user: &User) -> AnyResult<String> {
    let teams = team_service(db).list_teams_for_user(user).await?;
    let personal = teams
        .into_iter()
        .find(|t| t.owner.as_ref().map(|o| o.id == user.id).unwrap_or(false))
        .ok_or_else(|| anyhow::anyhow!("personal team not found"))?;
    Ok(personal.id)
}

pub fn minimal_song_data() -> SongData {
    serde_json::from_str(r#"{"titles":["T"],"sections":[]}"#).expect("song data")
}

pub async fn ensure_test_collection(db: &Arc<Database>, user: &User) -> AnyResult<String> {
    let ctx = auth_ctx_for_user(db, user).await?;
    let coll_svc = collection_service(db);
    use shared::api::ListQuery;
    let existing = coll_svc
        .list_collections_for_user(&ctx, ListQuery::default())
        .await?;
    if let Some(c) = existing.first() {
        return Ok(c.id.clone());
    }
    let created = coll_svc
        .create_collection_for_user(
            &ctx,
            CreateCollection {
                owner: None,
                title: "Test".into(),
                cover: "mysongs".into(),
                songs: vec![],
            },
        )
        .await?;
    Ok(created.id)
}

pub async fn create_song_with_title(
    db: &Arc<Database>,
    user: &User,
    title: &str,
) -> AnyResult<shared::song::Song> {
    let collection = ensure_test_collection(db, user).await?;
    let mut data = minimal_song_data();
    data.titles = vec![title.to_string()];
    let create = CreateSong {
        collection,
        not_a_song: false,
        blobs: vec![],
        data,
    };
    let svc = song_service(db);
    let ctx = auth_ctx_for_user(db, user).await?;
    Ok(svc.create_song_for_user(&ctx, create).await?)
}

pub async fn auth_ctx_for_user(db: &Arc<Database>, user: &User) -> AnyResult<AuthorizationContext> {
    let sess = session_service(db)
        .create_session_for_user_by_id(&user.id, 3600)
        .await
        .map_err(|e| anyhow::anyhow!("session: {e}"))?;
    load_authorization_context(db.as_ref(), &sess.id)
        .await
        .map_err(|e| anyhow::anyhow!("auth ctx: {e}"))?
        .filter(|c| !c.session.expired)
        .ok_or_else(|| anyhow::anyhow!("authorization context missing"))
}

pub fn auth_ctx_with_teams(user: &User, teams: Vec<AuthorizedTeam>) -> AuthorizationContext {
    AuthorizationContext {
        session: AuthorizedSession {
            id: "test-session".into(),
            expired: false,
        },
        user: AuthorizedUser {
            id: user.id.clone(),
            email: user.email.clone(),
            role: user.role.clone(),
            oauth_picture_url: user.oauth_picture_url.clone(),
            oauth_avatar_blob_id: user.oauth_avatar_blob_id.clone(),
            avatar_blob_id: user.avatar_blob_id.clone(),
        },
        teams: teams.into_boxed_slice().into(),
    }
}

pub fn auth_ctx_test_personal_team(user: &User) -> AuthorizationContext {
    let tid = RecordId::new("team", user.id.clone());
    auth_ctx_with_teams(
        user,
        vec![AuthorizedTeam {
            id: tid,
            owner_user_id: Some(user.id.clone()),
            role: AuthorizedTeamRole::Admin,
        }],
    )
}

/// Adds non-owner members to the owner's personal team.
pub async fn configure_personal_team_members(
    db: &Arc<Database>,
    owner: &User,
    team_id: &str,
    members: Vec<(String, TeamRole)>,
) -> AnyResult<()> {
    let inputs: Vec<TeamMemberInput> = members
        .into_iter()
        .map(|(id, role)| TeamMemberInput {
            user: TeamUserRef { id },
            role,
        })
        .collect();
    team_service(db)
        .update_team_for_user(
            owner,
            team_id,
            UpdateTeam {
                name: "Personal".into(),
                members: Some(inputs),
            },
        )
        .await?;
    Ok(())
}

/// Blob application service with an explicit blob directory.
pub fn blob_service(db: &Arc<Database>, blob_dir: String) -> BlobServiceHandle {
    BlobServiceHandle::build(db.clone(), blob_dir)
}

/// Collection application service (same wiring as HTTP `main`).
pub fn collection_service(db: &Arc<Database>) -> CollectionServiceHandle {
    CollectionServiceHandle::build(db.clone())
}

/// Song application service (same wiring as HTTP `main`).
pub fn song_service(db: &Arc<Database>) -> SongServiceHandle {
    SongServiceHandle::build(db.clone())
}

/// Setlist application service (same wiring as HTTP `main`).
pub fn setlist_service(db: &Arc<Database>) -> SetlistServiceHandle {
    SetlistService::new(SurrealSetlistRepo::new(db.clone()), db.clone())
}

/// Team application service (same wiring as HTTP `main`).
pub fn team_service(db: &Arc<Database>) -> TeamServiceHandle {
    TeamServiceHandle::build(db.clone())
}

/// Invitation application service (same wiring as HTTP `main`).
pub fn invitation_service(db: &Arc<Database>) -> InvitationServiceHandle {
    InvitationServiceHandle::build(db.clone())
}

/// User application service (same wiring as HTTP `main`).
pub fn user_service(db: &Arc<Database>) -> UserServiceHandle {
    UserServiceHandle::build(db.clone())
}

/// Session application service (same wiring as HTTP `main`).
pub fn session_service(db: &Arc<Database>) -> SessionServiceHandle {
    SessionServiceHandle::build(db.clone())
}

/// Multi-role test fixture that creates a shared team with owner, admin, writer, guest,
/// non-member, and platform admin users. Use `TeamFixture::build(&db).await` in integration tests
/// that need to exercise ACL across multiple roles.
pub struct TeamFixture {
    /// Owns a personal team; not a member of the shared team.
    pub owner: User,
    /// ID of `owner`'s personal team.
    pub personal_team_id: String,
    /// Creator of the shared team; has the `admin` role on it.
    pub admin_user: User,
    /// Member of the shared team with the `content_maintainer` role.
    pub writer: User,
    /// Member of the shared team with the `guest` role.
    pub guest: User,
    /// Not a member of any team under test.
    pub non_member: User,
    /// User with platform-level `Admin` role (not a team member).
    pub platform_admin: User,
    /// ID of the shared team.
    pub shared_team_id: String,
}

impl TeamFixture {
    /// Build a fully-populated multi-role fixture against `db`.
    pub async fn build(db: &Arc<Database>) -> AnyResult<Self> {
        let owner = create_user(db, "fx-owner@test.local").await?;
        let personal_team_id = personal_team_id(db, &owner).await?;

        let admin_user = create_user(db, "fx-admin@test.local").await?;
        let writer = create_user(db, "fx-writer@test.local").await?;
        let guest = create_user(db, "fx-guest@test.local").await?;
        let non_member = create_user(db, "fx-nonmember@test.local").await?;

        // Create platform admin: User::new gives role=Default, so override it.
        let mut platform_admin_raw = User::new("fx-platformadmin@test.local");
        platform_admin_raw.role = UserRole::Admin;
        let platform_admin = user_service(db).create_user(platform_admin_raw).await?;

        // admin_user creates the shared team -> automatically becomes admin.
        // writer and guest are passed as extra members at creation time.
        let shared_team = team_service(db)
            .create_shared_team_for_user(
                &admin_user,
                CreateTeam {
                    name: "Fixture Shared Team".into(),
                    members: vec![
                        TeamMemberInput {
                            user: TeamUserRef {
                                id: writer.id.clone(),
                            },
                            role: TeamRole::ContentMaintainer,
                        },
                        TeamMemberInput {
                            user: TeamUserRef {
                                id: guest.id.clone(),
                            },
                            role: TeamRole::Guest,
                        },
                    ],
                },
            )
            .await?;
        let shared_team_id = shared_team.id;

        Ok(TeamFixture {
            owner,
            personal_team_id,
            admin_user,
            writer,
            guest,
            non_member,
            platform_admin,
            shared_team_id,
        })
    }
}

/// Two distinct shared teams created by the same user (caller is **admin** on both).
pub async fn two_shared_teams_for_user(
    db: &Arc<Database>,
    user: &User,
) -> AnyResult<(String, String)> {
    let ts = team_service(db);
    let a = ts
        .create_shared_team_for_user(
            user,
            CreateTeam {
                name: "Move fixture A".into(),
                members: vec![],
            },
        )
        .await?;
    let b = ts
        .create_shared_team_for_user(
            user,
            CreateTeam {
                name: "Move fixture B".into(),
                members: vec![],
            },
        )
        .await?;
    Ok((a.id, b.id))
}

pub fn setlist_with_songs(title: &str, song_ids: &[(&str, Option<&str>)]) -> CreateSetlist {
    CreateSetlist {
        owner: None,
        title: title.into(),
        songs: song_ids
            .iter()
            .map(|(id, nr)| shared::song::Link {
                id: (*id).into(),
                nr: nr.map(|s| s.into()),
                key: None,
            })
            .collect(),
    }
}

/// Minimal valid JPEG for collection-cover upload tests.
pub fn sample_cover_jpeg_bytes() -> Vec<u8> {
    include_bytes!("../tests/fixtures/cover-1x1.jpeg").to_vec()
}
