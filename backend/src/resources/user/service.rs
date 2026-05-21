use std::sync::Arc;

use shared::api::ListQuery;
use shared::blob::CreateBlob;
use shared::user::{HttpAuditMetrics, User};
use tracing::instrument;

use crate::auth::AuthorizationContext;
use crate::database::Database;
use crate::error::AppError;
use crate::resources::blob::service::BlobServiceHandle;
use crate::resources::team::{SurrealTeamRepo, TeamCreatePayload, TeamRepository, user_thing};

use super::CreateUser;
use super::profile_picture;
use super::repository::UserRepository;
use super::surreal_repo::SurrealUserRepo;

/// Application service for user management: creates users with personal teams.
#[derive(Clone)]
pub struct UserService<R, T> {
    pub repo: R,
    pub team_repo: T,
}

impl<R, T> UserService<R, T> {
    pub fn new(repo: R, team_repo: T) -> Self {
        Self { repo, team_repo }
    }
}

impl<R: UserRepository, T: TeamRepository> UserService<R, T> {
    #[instrument(level = "debug", err, skip(self, pagination))]
    pub async fn get_users(&self, pagination: ListQuery) -> Result<Vec<User>, AppError> {
        self.repo.get_users(pagination).await
    }

    #[instrument(level = "debug", err, skip(self, query))]
    pub async fn count_users(&self, query: ListQuery) -> Result<u64, AppError> {
        self.repo.count_users(query).await
    }

    #[instrument(level = "debug", err, skip(self))]
    pub async fn get_user(&self, id: &str) -> Result<User, AppError> {
        self.repo.get_user(id).await
    }

    #[instrument(level = "debug", err, skip(self))]
    pub async fn get_http_audit_metrics_for_user(
        &self,
        user_id: &str,
    ) -> Result<HttpAuditMetrics, AppError> {
        self.repo.get_http_audit_metrics_for_user(user_id).await
    }

    #[instrument(level = "debug", err, skip(self))]
    pub async fn get_user_by_email(&self, email: &str) -> Result<Option<User>, AppError> {
        self.repo.get_user_by_email(email).await
    }

    /// Create a user and their personal team.
    #[instrument(level = "debug", err, skip(self, user))]
    pub async fn create_user(&self, user: User) -> Result<User, AppError> {
        let created = self.repo.create_user_record(user).await?;
        self.team_repo
            .create_team(TeamCreatePayload {
                name: "Personal".to_owned(),
                owner: Some(user_thing(&created.id)),
                members: vec![],
            })
            .await?;
        crate::audit!(
            "audit.user.created",
            user_id = tracing::field::display(&created.id),
            email = tracing::field::display(&created.email),
            role = tracing::field::debug(&created.role)
            ; "user created"
        );
        Ok(created)
    }

    #[instrument(level = "debug", err, skip(self, request))]
    pub async fn create_user_from_request(&self, request: CreateUser) -> Result<User, AppError> {
        let user = request
            .try_into_user()
            .map_err(|e| AppError::invalid_request(e.to_string()))?;
        self.create_user(user).await
    }

    #[instrument(level = "debug", err, skip(self))]
    pub async fn get_user_by_email_or_create(&self, email: &str) -> Result<User, AppError> {
        if let Some(user) = self.repo.get_user_by_email(email).await? {
            return Ok(user);
        }
        self.create_user(User::new(email.to_lowercase())).await
    }

    #[instrument(level = "debug", err, skip(self))]
    pub async fn delete_user(&self, id: &str) -> Result<User, AppError> {
        self.repo.delete_user(id).await
    }

    #[instrument(level = "debug", err, skip(self))]
    pub async fn set_default_collection(
        &self,
        user_id: &str,
        collection_id: &str,
    ) -> Result<(), AppError> {
        self.repo
            .set_default_collection(user_id, collection_id)
            .await
    }
}

/// Production type alias used in HTTP wiring.
pub type UserServiceHandle = UserService<SurrealUserRepo, SurrealTeamRepo>;

impl UserServiceHandle {
    pub fn build(db: Arc<Database>) -> Self {
        UserService::new(
            SurrealUserRepo::new(db.clone()),
            SurrealTeamRepo::new(db.clone()),
        )
    }

    #[instrument(level = "debug", skip(self, blob_svc, ctx), fields(user_id = %ctx.user.id))]
    pub async fn cache_oauth_profile_picture_if_needed(
        &self,
        blob_svc: &BlobServiceHandle,
        ctx: &AuthorizationContext,
        picture_url: Option<String>,
        max_bytes: usize,
    ) -> Result<(), AppError> {
        let Some(ref url) = picture_url else {
            return Ok(());
        };
        if ctx.user.oauth_picture_url.as_deref() == Some(url.as_str())
            && ctx.user.oauth_avatar_blob_id.is_some()
        {
            return Ok(());
        }

        let client = profile_picture::oauth_fetch_client()?;
        let bytes = match profile_picture::fetch_oauth_picture_bytes(&client, url, max_bytes).await
        {
            Ok(b) => b,
            Err(e) => {
                tracing::warn!(
                    user_id = %ctx.user.id,
                    error = %e,
                    "oauth profile picture fetch failed"
                );
                return Ok(());
            }
        };
        let file_type = match profile_picture::avatar_file_type_from_magic(&bytes) {
            Ok(t) => t,
            Err(e) => {
                tracing::warn!(
                    user_id = %ctx.user.id,
                    error = %e,
                    "oauth profile picture validation failed"
                );
                return Ok(());
            }
        };
        let (w, h) = match profile_picture::avatar_dimensions(&bytes) {
            Ok(d) => d,
            Err(e) => {
                tracing::warn!(
                    user_id = %ctx.user.id,
                    error = %e,
                    "oauth profile picture dimensions failed"
                );
                return Ok(());
            }
        };

        if let Some(ref old) = ctx.user.oauth_avatar_blob_id
            && let Err(e) = blob_svc.delete_blob_for_user(ctx, old).await
        {
            tracing::warn!(
                user_id = %ctx.user.id,
                blob_id = %old,
                error = %e,
                "failed to delete previous oauth avatar blob"
            );
        }

        let created = match blob_svc
            .create_blob_with_data_for_user(
                ctx,
                CreateBlob {
                    owner: None,
                    file_type,
                    width: w,
                    height: h,
                    ocr: String::new(),
                },
                &bytes,
            )
            .await
        {
            Ok(b) => b,
            Err(e) => {
                tracing::warn!(
                    user_id = %ctx.user.id,
                    error = %e,
                    "failed to store oauth avatar blob"
                );
                return Ok(());
            }
        };

        if let Err(e) = self
            .repo
            .set_oauth_picture_and_oauth_avatar_blob(&ctx.user.id, url, &created.id)
            .await
        {
            tracing::warn!(
                user_id = %ctx.user.id,
                error = %e,
                "failed to link oauth avatar on user"
            );
        }
        Ok(())
    }

    #[instrument(level = "debug", err, skip(self, blob_svc, ctx, body))]
    pub async fn upload_profile_picture(
        &self,
        blob_svc: &BlobServiceHandle,
        ctx: &AuthorizationContext,
        content_type: &str,
        body: &[u8],
        max_bytes: usize,
    ) -> Result<User, AppError> {
        if body.len() > max_bytes {
            return Err(AppError::invalid_request(
                "profile picture exceeds size limit",
            ));
        }
        let file_type = profile_picture::file_type_from_content_type(content_type)?;
        profile_picture::assert_magic_matches_content_type(body, &file_type)?;
        let (w, h) = profile_picture::avatar_dimensions(body)?;

        if let Some(ref old) = ctx.user.avatar_blob_id {
            let _ = blob_svc.delete_blob_for_user(ctx, old).await;
        }

        let created = blob_svc
            .create_blob_with_data_for_user(
                ctx,
                CreateBlob {
                    owner: None,
                    file_type,
                    width: w,
                    height: h,
                    ocr: String::new(),
                },
                body,
            )
            .await?;

        self.repo
            .set_avatar_blob(&ctx.user.id, Some(&created.id))
            .await?;
        self.repo.get_user(&ctx.user.id).await
    }

    #[instrument(level = "debug", err, skip(self, blob_svc, ctx))]
    pub async fn clear_uploaded_profile_picture(
        &self,
        blob_svc: &BlobServiceHandle,
        ctx: &AuthorizationContext,
    ) -> Result<User, AppError> {
        if let Some(ref old) = ctx.user.avatar_blob_id {
            let _ = blob_svc.delete_blob_for_user(ctx, old).await;
            self.repo.set_avatar_blob(&ctx.user.id, None).await?;
        }
        self.repo.get_user(&ctx.user.id).await
    }
}

#[cfg(test)]
mod tests {
    use std::sync::{Arc, Mutex};

    use async_trait::async_trait;
    use surrealdb::types::RecordId;

    use shared::api::ListQuery;
    use shared::team::Team;
    use shared::user::{HttpAuditMetrics, Role, User};

    use crate::database::record_id_string;
    use crate::error::AppError;
    use crate::resources::team::repository::TeamRepository;
    use crate::resources::team::{DbTeamMember, TeamCreatePayload, TeamFetched};
    use crate::resources::user::repository::UserRepository;

    use super::UserService;

    // ── Test data helpers ─────────────────────────────────────────────────────

    fn make_user(id: &str, email: &str) -> User {
        let mut u = User::new(email);
        u.id = id.to_owned();
        u
    }

    // ── MockUserRepo ──────────────────────────────────────────────────────────

    struct MockUserRepo {
        user_by_email: Option<User>,
        create_fails_with: Option<AppError>,
    }

    impl MockUserRepo {
        fn empty() -> Self {
            Self {
                user_by_email: None,
                create_fails_with: None,
            }
        }

        fn with_existing_user(user: User) -> Self {
            Self {
                user_by_email: Some(user),
                create_fails_with: None,
            }
        }

        fn failing_create(err: AppError) -> Self {
            Self {
                user_by_email: None,
                create_fails_with: Some(err),
            }
        }
    }

    #[async_trait]
    impl UserRepository for MockUserRepo {
        async fn get_users(&self, _pagination: ListQuery) -> Result<Vec<User>, AppError> {
            unreachable!("not used in these tests")
        }

        async fn count_users(&self, _query: ListQuery) -> Result<u64, AppError> {
            unreachable!("not used in these tests")
        }

        async fn get_user(&self, _id: &str) -> Result<User, AppError> {
            unreachable!("not used in these tests")
        }

        async fn get_http_audit_metrics_for_user(
            &self,
            _user_id: &str,
        ) -> Result<HttpAuditMetrics, AppError> {
            unreachable!("not used in these tests")
        }

        async fn get_user_by_email(&self, _email: &str) -> Result<Option<User>, AppError> {
            Ok(self.user_by_email.clone())
        }

        async fn create_user_record(&self, user: User) -> Result<User, AppError> {
            if let Some(ref err) = self.create_fails_with {
                return Err(AppError::conflict(err.to_string()));
            }
            let mut created = user;
            if created.id.is_empty() {
                created.id = "new-user-id".to_owned();
            }
            Ok(created)
        }

        async fn delete_user(&self, _id: &str) -> Result<User, AppError> {
            unreachable!("not used in these tests")
        }

        async fn set_default_collection(
            &self,
            _user_id: &str,
            _collection_id: &str,
        ) -> Result<(), AppError> {
            unreachable!("not used in these tests")
        }

        async fn set_oauth_picture_and_oauth_avatar_blob(
            &self,
            _user_id: &str,
            _picture_url: &str,
            _oauth_blob_id: &str,
        ) -> Result<(), AppError> {
            unreachable!("not used in these tests")
        }

        async fn set_avatar_blob(
            &self,
            _user_id: &str,
            _avatar_blob_id: Option<&str>,
        ) -> Result<(), AppError> {
            unreachable!("not used in these tests")
        }
    }

    // ── MockTeamRepo ──────────────────────────────────────────────────────────

    struct MockTeamRepo {
        captured_owner: Arc<Mutex<Option<RecordId>>>,
    }

    impl MockTeamRepo {
        fn new() -> Self {
            Self {
                captured_owner: Arc::new(Mutex::new(None)),
            }
        }
    }

    #[async_trait]
    impl TeamRepository for MockTeamRepo {
        async fn create_team(&self, payload: TeamCreatePayload) -> Result<String, AppError> {
            *self.captured_owner.lock().unwrap() = payload.owner;
            Ok("personal-team-id".to_owned())
        }

        async fn fetch_all_teams(&self) -> Result<Vec<TeamFetched>, AppError> {
            unreachable!("not used in user tests")
        }

        async fn fetch_teams_for_user(
            &self,
            _user_id: &str,
            _is_admin: bool,
        ) -> Result<Vec<TeamFetched>, AppError> {
            unreachable!("not used in user tests")
        }

        async fn count_teams_for_user_search(
            &self,
            _user_id: &str,
            _is_admin: bool,
            _q_trimmed: &str,
        ) -> Result<u64, AppError> {
            unreachable!("not used in user tests")
        }

        async fn fetch_teams_for_user_search(
            &self,
            _user_id: &str,
            _is_admin: bool,
            _pagination: &shared::api::ListQuery,
            _q_trimmed: &str,
        ) -> Result<Vec<TeamFetched>, AppError> {
            unreachable!("not used in user tests")
        }

        async fn fetch_team(&self, _id: &str) -> Result<Option<TeamFetched>, AppError> {
            unreachable!("not used in user tests")
        }

        async fn update_team_name(
            &self,
            _resource: (String, String),
            _name: &str,
        ) -> Result<(), AppError> {
            unreachable!("not used in user tests")
        }

        async fn update_team_members(
            &self,
            _resource: (String, String),
            _members: Vec<DbTeamMember>,
        ) -> Result<(), AppError> {
            unreachable!("not used in user tests")
        }

        async fn delete_team_record(&self, _resource: (String, String)) -> Result<(), AppError> {
            unreachable!("not used in user tests")
        }

        async fn reassign_content(&self, _from: RecordId, _to: RecordId) -> Result<(), AppError> {
            unreachable!("not used in user tests")
        }

        async fn load_team_display(&self, _id: &str) -> Result<Team, AppError> {
            unreachable!("not used in user tests")
        }
    }

    // ── Slice 2D: user creation and email ─────────────────────────────────────

    /// BLC-USER-003: creating a user also creates a personal team with that user as owner.
    #[tokio::test]
    async fn blc_user_003_create_user_creates_personal_team() {
        let mock_team = MockTeamRepo::new();
        let captured_owner = mock_team.captured_owner.clone();
        let svc = UserService::new(MockUserRepo::empty(), mock_team);
        let user = User::new("user@example.com");
        let result = svc.create_user(user).await.unwrap();
        let owner = captured_owner.lock().unwrap();
        let owner_thing = owner
            .as_ref()
            .expect("create_team must be called with an owner");
        assert_eq!(owner_thing.table.as_str(), "user");
        assert_eq!(record_id_string(owner_thing), result.id);
    }

    /// BLC-USER-002: a newly created user always has the default role.
    #[tokio::test]
    async fn blc_user_002_new_user_has_default_role() {
        let svc = UserService::new(MockUserRepo::empty(), MockTeamRepo::new());
        let user = User::new("user@example.com");
        let result = svc.create_user(user).await.unwrap();
        assert_eq!(result.role, Role::Default);
    }

    /// BLC-USER-001: get_user_by_email_or_create creates a user when the email is new.
    #[tokio::test]
    async fn blc_user_001_get_by_email_or_create_new_email() {
        let svc = UserService::new(MockUserRepo::empty(), MockTeamRepo::new());
        let result = svc.get_user_by_email_or_create("new@example.com").await;
        assert!(result.is_ok());
        assert_eq!(result.unwrap().email, "new@example.com");
    }

    /// BLC-USER-001: get_user_by_email_or_create returns the existing user without creating a new one.
    #[tokio::test]
    async fn blc_user_001_get_by_email_or_create_existing_email() {
        let existing = make_user("existing-id", "exists@example.com");
        let svc = UserService::new(
            MockUserRepo::with_existing_user(existing.clone()),
            MockTeamRepo::new(),
        );
        let result = svc
            .get_user_by_email_or_create("exists@example.com")
            .await
            .unwrap();
        assert_eq!(result.id, existing.id);
    }

    /// BLC-USER-008: duplicate email during create propagates the conflict error.
    #[tokio::test]
    async fn blc_user_008_create_duplicate_email_conflict() {
        let svc = UserService::new(
            MockUserRepo::failing_create(AppError::conflict("duplicate email")),
            MockTeamRepo::new(),
        );
        let user = User::new("dup@example.com");
        let result = svc.create_user(user).await;
        assert!(matches!(result, Err(AppError::Conflict(_))));
    }

    mod integration {
        use crate::error::AppError;
        use crate::test_helpers::{personal_team_id, test_db, user_service};
        use shared::user::{CreateUser, Role, User};

        /// BLC-USER-003: creating a user also creates a personal team with the user as owner.
        #[tokio::test]
        async fn blc_user_003_create_user_creates_personal_team_integration() {
            let db = test_db().await.expect("db");
            let svc = user_service(&db);
            let user = svc
                .create_user(User::new("j3u001@test.local"))
                .await
                .expect("create");
            let pt_id = personal_team_id(&db, &user).await.expect("personal team");
            assert!(!pt_id.is_empty());
        }

        /// BLC-USER-003: new user's personal team starts with no members (owner is not in members).
        #[tokio::test]
        async fn blc_user_003_personal_team_starts_empty() {
            let db = test_db().await.expect("db");
            let svc = user_service(&db);
            let user = svc
                .create_user(User::new("j3u002@test.local"))
                .await
                .expect("create");
            let team_svc = crate::test_helpers::team_service(&db);
            let teams = team_svc.list_teams_for_user(&user).await.expect("list");
            let personal = teams
                .into_iter()
                .find(|t| t.owner.as_ref().map(|o| o.id == user.id).unwrap_or(false))
                .expect("personal team");
            assert!(
                personal.members.is_empty(),
                "personal team must start with empty members"
            );
        }

        /// BLC-USER-001: creating two users with different emails both succeed.
        #[tokio::test]
        async fn blc_user_001_distinct_emails_both_succeed() {
            let db = test_db().await.expect("db");
            let svc = user_service(&db);
            let u1 = svc
                .create_user(User::new("j3u003a@test.local"))
                .await
                .expect("u1");
            let u2 = svc
                .create_user(User::new("j3u003b@test.local"))
                .await
                .expect("u2");
            assert_ne!(u1.id, u2.id);
        }

        /// BLC-USER-001: creating two users with the same email (case-insensitive) returns Conflict.
        #[tokio::test]
        async fn blc_user_001_duplicate_email_conflict() {
            let db = test_db().await.expect("db");
            let svc = user_service(&db);
            svc.create_user(User::new("j3u004@test.local"))
                .await
                .expect("first");
            // SurrealDB enforces uniqueness via DB constraints; duplicate insert returns an error.
            let r = svc.create_user(User::new("j3u004@test.local")).await;
            assert!(r.is_err(), "duplicate email must be rejected");
        }

        /// BLC-USER-001 / BLC-USER-008: `CreateUser` normalizes email; mixed case and whitespace collide.
        #[tokio::test]
        async fn blc_user_001_create_user_from_request_email_collision_after_normalize() {
            let db = test_db().await.expect("db");
            let svc = user_service(&db);
            svc.create_user_from_request(CreateUser {
                email: "MixEd@Case.Test.Local".into(),
                role: Role::Default,
                default_collection: None,
            })
            .await
            .expect("first");
            let r = svc
                .create_user_from_request(CreateUser {
                    email: "  mixed@case.test.local  ".into(),
                    role: Role::Default,
                    default_collection: None,
                })
                .await;
            assert!(
                matches!(r, Err(AppError::Conflict(_))),
                "expected conflict after normalization, got {r:?}"
            );
        }

        /// BLC-USER-008: malformed email on `CreateUser` is rejected before the database.
        #[tokio::test]
        async fn blc_user_008_invalid_email_from_request() {
            let db = test_db().await.expect("db");
            let svc = user_service(&db);
            let r = svc
                .create_user_from_request(CreateUser {
                    email: "not-an-email".into(),
                    role: Role::Default,
                    default_collection: None,
                })
                .await;
            assert!(matches!(r, Err(AppError::InvalidRequest(_))));
        }

        /// BLC-USER-014: deleting a user, then deleting the same ID again returns NotFound.
        #[tokio::test]
        async fn blc_user_014_delete_twice_not_found() {
            let db = test_db().await.expect("db");
            let svc = user_service(&db);
            let user = svc
                .create_user(User::new("j3u005@test.local"))
                .await
                .expect("create");
            svc.delete_user(&user.id).await.expect("first delete");
            let r = svc.delete_user(&user.id).await;
            assert!(matches!(r, Err(AppError::NotFound(_))));
        }

        /// BLC-USER-014: deleting a non-existent user ID returns NotFound.
        #[tokio::test]
        async fn blc_user_014_delete_nonexistent_not_found() {
            let db = test_db().await.expect("db");
            let svc = user_service(&db);
            let r = svc.delete_user("totally-nonexistent-user-id").await;
            assert!(matches!(r, Err(AppError::NotFound(_))));
        }
    }
}
