use std::sync::Arc;

use shared::user::{HttpAuditMetrics, Session};
use tracing::instrument;

use crate::database::Database;
use crate::error::AppError;
use crate::resources::user::SurrealUserRepo;
use crate::resources::user::UserRepository;

use super::repository::SessionRepository;
use super::surreal_repo::SurrealSessionRepo;

/// Application service for session management.
#[derive(Clone)]
pub struct SessionService<S, U> {
    pub repo: S,
    pub user_repo: U,
}

impl<S, U> SessionService<S, U> {
    pub fn new(repo: S, user_repo: U) -> Self {
        Self { repo, user_repo }
    }
}

impl<S: SessionRepository, U: UserRepository> SessionService<S, U> {
    #[instrument(level = "debug", err, skip(self))]
    pub async fn get_session(&self, id: &str) -> Result<Session, AppError> {
        self.repo.get_session(id).await
    }

    #[instrument(level = "debug", err, skip(self))]
    pub async fn get_session_for_user(&self, id: &str, user_id: &str) -> Result<Session, AppError> {
        self.repo.get_session_for_user(id, user_id).await
    }

    #[instrument(level = "debug", err, skip(self))]
    pub async fn get_http_audit_metrics_for_session(
        &self,
        session_id: &str,
    ) -> Result<HttpAuditMetrics, AppError> {
        self.repo
            .get_http_audit_metrics_for_session(session_id)
            .await
    }

    #[instrument(level = "debug", err, skip(self, session))]
    pub async fn create_session(&self, session: Session) -> Result<Session, AppError> {
        let stored = self.repo.create_session(session).await?;
        let ttl_seconds = (stored.expires_at - stored.created_at).num_seconds();
        crate::audit!(
            "audit.session.created",
            session_id = tracing::field::display(&stored.id),
            user_id = tracing::field::display(&stored.user.id),
            ttl_seconds = tracing::field::display(&ttl_seconds)
            ; "session created"
        );
        Ok(stored)
    }

    #[instrument(level = "debug", err, skip(self))]
    pub async fn delete_session(&self, id: &str) -> Result<Session, AppError> {
        self.repo.delete_session(id).await
    }

    #[instrument(level = "debug", err, skip(self))]
    pub async fn delete_session_for_user(
        &self,
        id: &str,
        user_id: &str,
    ) -> Result<Session, AppError> {
        self.repo.delete_session_for_user(id, user_id).await
    }

    #[instrument(level = "debug", err, skip(self))]
    pub async fn get_sessions_by_user_id(&self, user_id: &str) -> Result<Vec<Session>, AppError> {
        self.repo.get_sessions_by_user_id(user_id).await
    }

    /// Look up a user by ID and create a session for them with the given TTL.
    #[instrument(level = "debug", err, skip(self))]
    pub async fn create_session_for_user_by_id(
        &self,
        user_id: &str,
        ttl_seconds: i64,
    ) -> Result<Session, AppError> {
        let user = self.user_repo.get_user(user_id).await?;
        self.repo
            .create_session(Session::new(user, ttl_seconds))
            .await
    }
}

/// Production type alias used in HTTP wiring.
pub type SessionServiceHandle = SessionService<SurrealSessionRepo, SurrealUserRepo>;

impl SessionServiceHandle {
    pub fn build(db: Arc<Database>) -> Self {
        SessionService::new(
            SurrealSessionRepo::new(db.clone()),
            SurrealUserRepo::new(db.clone()),
        )
    }
}

#[cfg(test)]
mod tests {
    use async_trait::async_trait;
    use std::sync::Mutex;

    use shared::api::ListQuery;
    use shared::user::{HttpAuditMetrics, Session, User};

    use crate::error::AppError;
    use crate::resources::user::repository::UserRepository;

    use super::super::repository::SessionRepository;
    use super::SessionService;

    // ── Test data helpers ─────────────────────────────────────────────────────

    fn make_user(id: &str) -> User {
        let mut u = User::new("test@example.com");
        u.id = id.to_owned();
        u
    }

    fn make_session(id: &str, user_id: &str) -> Session {
        Session::new(make_user(user_id), 3600).tap_id(id)
    }

    trait TapId {
        fn tap_id(self, id: &str) -> Self;
    }

    impl TapId for Session {
        fn tap_id(mut self, id: &str) -> Self {
            self.id = id.to_owned();
            self
        }
    }

    // ── MockSessionRepo ───────────────────────────────────────────────────────

    struct MockSessionRepo {
        sessions: Mutex<Vec<Session>>,
    }

    impl MockSessionRepo {
        fn empty() -> Self {
            Self {
                sessions: Mutex::new(vec![]),
            }
        }

        fn with_sessions(sessions: Vec<Session>) -> Self {
            Self {
                sessions: Mutex::new(sessions),
            }
        }
    }

    #[async_trait]
    impl SessionRepository for MockSessionRepo {
        async fn get_session(&self, id: &str) -> Result<Session, AppError> {
            self.sessions
                .lock()
                .expect("mock sessions lock")
                .iter()
                .find(|s| s.id == id)
                .cloned()
                .ok_or_else(|| AppError::NotFound("session not found".into()))
        }

        async fn get_http_audit_metrics_for_session(
            &self,
            _session_id: &str,
        ) -> Result<HttpAuditMetrics, AppError> {
            Ok(HttpAuditMetrics {
                request_count: 0,
                last_used_at: None,
            })
        }

        async fn get_session_for_user(&self, id: &str, user_id: &str) -> Result<Session, AppError> {
            self.sessions
                .lock()
                .expect("mock sessions lock")
                .iter()
                .find(|s| s.id == id && s.user.id == user_id)
                .cloned()
                .ok_or_else(|| AppError::NotFound("session not found".into()))
        }

        async fn create_session(&self, session: Session) -> Result<Session, AppError> {
            Ok(session)
        }

        async fn delete_session(&self, id: &str) -> Result<Session, AppError> {
            let mut sessions = self.sessions.lock().expect("mock sessions lock");
            let pos = sessions
                .iter()
                .position(|s| s.id == id)
                .ok_or_else(|| AppError::NotFound("session not found".into()))?;
            Ok(sessions.remove(pos))
        }

        async fn delete_session_for_user(
            &self,
            id: &str,
            user_id: &str,
        ) -> Result<Session, AppError> {
            let mut sessions = self.sessions.lock().expect("mock sessions lock");
            let pos = sessions
                .iter()
                .position(|s| s.id == id && s.user.id == user_id)
                .ok_or_else(|| AppError::NotFound("session not found".into()))?;
            Ok(sessions.remove(pos))
        }

        async fn get_sessions_by_user_id(&self, user_id: &str) -> Result<Vec<Session>, AppError> {
            Ok(self
                .sessions
                .lock()
                .expect("mock sessions lock")
                .iter()
                .filter(|s| s.user.id == user_id)
                .cloned()
                .collect())
        }
    }

    // ── MockUserRepo ──────────────────────────────────────────────────────────

    struct MockUserRepo {
        user: Option<User>,
    }

    impl MockUserRepo {
        fn with_user(user: User) -> Self {
            Self { user: Some(user) }
        }

        fn empty() -> Self {
            Self { user: None }
        }
    }

    #[async_trait]
    impl UserRepository for MockUserRepo {
        async fn get_user(&self, _id: &str) -> Result<User, AppError> {
            self.user
                .clone()
                .ok_or_else(|| AppError::NotFound("user not found".into()))
        }

        async fn get_http_audit_metrics_for_user(
            &self,
            _user_id: &str,
        ) -> Result<HttpAuditMetrics, AppError> {
            unreachable!("not used in session tests")
        }

        async fn get_users(&self, _pagination: ListQuery) -> Result<Vec<User>, AppError> {
            unreachable!("not used in session tests")
        }

        async fn count_users(&self, _query: ListQuery) -> Result<u64, AppError> {
            unreachable!("not used in session tests")
        }

        async fn get_user_by_email(&self, _email: &str) -> Result<Option<User>, AppError> {
            unreachable!("not used in session tests")
        }

        async fn create_user_record(&self, _user: User) -> Result<User, AppError> {
            unreachable!("not used in session tests")
        }

        async fn delete_user(&self, _id: &str) -> Result<User, AppError> {
            unreachable!("not used in session tests")
        }

        async fn set_default_collection(
            &self,
            _user_id: &str,
            _collection_id: &str,
        ) -> Result<(), AppError> {
            unreachable!("not used in session tests")
        }

        async fn set_oauth_picture_and_oauth_avatar_blob(
            &self,
            _user_id: &str,
            _picture_url: &str,
            _oauth_blob_id: &str,
        ) -> Result<(), AppError> {
            unreachable!("not used in session tests")
        }

        async fn set_avatar_blob(
            &self,
            _user_id: &str,
            _avatar_blob_id: Option<&str>,
        ) -> Result<(), AppError> {
            unreachable!("not used in session tests")
        }
    }

    // ── Slice 2E: session scoping ─────────────────────────────────────────────

    /// BLC-SESS-001: creating a session stores the correct user on the session.
    #[tokio::test]
    async fn blc_sess_001_create_session_user_matches() {
        let user = make_user("u1");
        let svc = SessionService::new(MockSessionRepo::empty(), MockUserRepo::empty());
        let session = Session::new(user.clone(), 3600);
        let result = svc.create_session(session).await.unwrap();
        assert_eq!(result.user.id, user.id);
    }

    /// BLC-SESS-001: create_session_for_user_by_id succeeds for a valid user.
    #[tokio::test]
    async fn blc_sess_001_create_for_user_by_id_valid() {
        let user = make_user("u1");
        let svc = SessionService::new(
            MockSessionRepo::empty(),
            MockUserRepo::with_user(user.clone()),
        );
        let result = svc.create_session_for_user_by_id("u1", 3600).await;
        assert!(result.is_ok());
        assert_eq!(result.unwrap().user.id, user.id);
    }

    /// BLC-SESS-001: create_session_for_user_by_id returns not found for a non-existent user.
    #[tokio::test]
    async fn blc_sess_001_create_for_user_by_id_nonexistent() {
        let svc = SessionService::new(MockSessionRepo::empty(), MockUserRepo::empty());
        let result = svc
            .create_session_for_user_by_id("no-such-user", 3600)
            .await;
        assert!(matches!(result, Err(AppError::NotFound(_))));
    }

    #[tokio::test]
    async fn blc_sess_009_deleted_session_is_not_found() {
        let session = make_session("s1", "u1");
        let svc = SessionService::new(
            MockSessionRepo::with_sessions(vec![session.clone()]),
            MockUserRepo::empty(),
        );
        let delete_result = svc.delete_session("s1").await;
        assert!(delete_result.is_ok());
        let get_result = svc.get_session("s1").await;
        assert!(matches!(get_result, Err(AppError::NotFound(_))));
    }

    /// BLC-SESS-003: get_sessions_by_user_id returns only sessions belonging to that user.
    #[tokio::test]
    async fn blc_sess_003_get_sessions_returns_only_user_sessions() {
        let sessions = vec![
            make_session("s1", "u1"),
            make_session("s2", "u1"),
            make_session("s3", "u2"),
        ];
        let svc = SessionService::new(
            MockSessionRepo::with_sessions(sessions),
            MockUserRepo::empty(),
        );
        let result = svc.get_sessions_by_user_id("u1").await.unwrap();
        assert_eq!(result.len(), 2, "only sessions for u1 should be returned");
        assert!(result.iter().all(|s| s.user.id == "u1"));
    }
}
