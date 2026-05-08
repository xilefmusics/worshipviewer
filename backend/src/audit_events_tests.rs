//! Canary tests for structured audit log lines (`audit!`, `event = "audit.*"`, `audit = true`).
//!
//! See [docs/logging-review.md](../../docs/logging-review.md) bundle D and
//! [docs/architecture/backend-request-flow.md](../../docs/architecture/backend-request-flow.md).

use std::sync::Arc;

use actix_governor::{Governor, GovernorConfigBuilder};
use actix_web::http::StatusCode;
use actix_web::middleware::Compat;
use actix_web::web::{self, Data};
use actix_web::{App, test};
use serde_json::json;
use shared::team::{TeamMemberInput, TeamRole, TeamUserRef, UpdateTeam};
use shared::user::{Role, Session, User};
use tracing_test::traced_test;

use crate::auth::otp::Model;
use crate::database::Database;
use crate::governor_audit::AuditRateLimit429;
use crate::governor_peer::PeerOrFallbackIpKeyExtractor;
use crate::mail::MailService;
use crate::request_id::WorshipRootSpan;
use crate::settings::{CookieConfig, OtpConfig};
use crate::test_helpers::{
    TeamFixture, auth_ctx_for_user, create_user, invitation_service, session_service, team_service,
    test_db, user_service,
};
use crate::{auth, http_tests};

fn auth_scope_otp_logout(auth_rate_limit_rps: u64, auth_rate_limit_burst: u32) -> actix_web::Scope {
    let governor_conf = GovernorConfigBuilder::default()
        .requests_per_second(auth_rate_limit_rps)
        .burst_size(auth_rate_limit_burst)
        .key_extractor(PeerOrFallbackIpKeyExtractor)
        .finish()
        .expect("valid rate-limit configuration");

    web::scope("/auth").service(
        web::scope("")
            .wrap(Governor::new(&governor_conf))
            .wrap(AuditRateLimit429)
            .service(auth::otp::rest::otp_request)
            .service(auth::otp::rest::otp_verify)
            .service(auth::rest::logout),
    )
}

fn build_auth_app(
    db: Arc<Database>,
    auth_rps: u64,
    auth_burst: u32,
) -> App<
    impl actix_web::dev::ServiceFactory<
        actix_web::dev::ServiceRequest,
        Config = (),
        Response = actix_web::dev::ServiceResponse,
        Error = actix_web::Error,
        InitError = (),
    >,
> {
    let cookie_cfg = Data::new(CookieConfig {
        name: "sso_session".into(),
        secure: false,
        session_ttl_seconds: 3600,
        post_login_path: "/".into(),
    });
    let otp_cfg = Data::new(OtpConfig {
        ttl_seconds: 300,
        pepper: "audit-test-pepper".into(),
        max_attempts: 5,
        allow_self_signup: true,
    });

    App::new()
        .wrap(crate::request_id::RequestId)
        .wrap(crate::http_audit::HttpAudit::new(Data::from(db.clone())))
        .wrap(Compat::new(tracing_actix_web::TracingLogger::<
            WorshipRootSpan,
        >::new()))
        .app_data(Data::from(db.clone()))
        .app_data(Data::new(MailService::noop_for_tests(
            "audit-test@local".into(),
        )))
        .app_data(Data::new(user_service(&db)))
        .app_data(Data::new(session_service(&db)))
        .app_data(cookie_cfg)
        .app_data(otp_cfg)
        .app_data(crate::error::json_config())
        .service(auth_scope_otp_logout(auth_rps, auth_burst))
}

#[tokio::test]
#[traced_test]
async fn audit_session_created_emits_event() {
    let db = test_db().await.expect("db");
    let user = create_user(&db, "audit-sess-create@test.local")
        .await
        .expect("user");
    session_service(&db)
        .create_session(Session::new(user, 3600))
        .await
        .expect("session");
    assert!(logs_contain("audit.session.created"));
}

#[tokio::test]
#[traced_test]
async fn audit_user_created_emits_event() {
    let db = test_db().await.expect("db");
    let _ = create_user(&db, "audit-user-new@test.local")
        .await
        .expect("user");
    assert!(logs_contain("audit.user.created"));
}

#[tokio::test]
#[traced_test]
async fn audit_user_deleted_emits_event() {
    let db = test_db().await.expect("db");
    let mut admin_raw = User::new("audit-admin-del@test.local");
    admin_raw.role = Role::Admin;
    let admin = user_service(&db)
        .create_user(admin_raw)
        .await
        .expect("admin");
    let target = create_user(&db, "audit-target-del@test.local")
        .await
        .expect("target");
    let token = session_service(&db)
        .create_session(Session::new(admin, 3600))
        .await
        .expect("session")
        .id;

    let app = test::init_service(http_tests::build_app(db)).await;
    let req = test::TestRequest::delete()
        .uri(&format!("/api/v1/users/{}", target.id))
        .insert_header(("Authorization", format!("Bearer {token}")))
        .to_request();
    let resp = test::call_service(&app, req).await;
    assert_eq!(resp.status(), StatusCode::NO_CONTENT);
    assert!(logs_contain("audit.user.deleted"));
}

#[tokio::test]
#[traced_test]
async fn audit_team_role_changed_emits_event() {
    let db = test_db().await.expect("db");
    let fx = TeamFixture::build(&db).await.expect("fixture");
    team_service(&db)
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
                            id: fx.writer.id.clone(),
                        },
                        role: TeamRole::ContentMaintainer,
                    },
                    TeamMemberInput {
                        user: TeamUserRef {
                            id: fx.guest.id.clone(),
                        },
                        role: TeamRole::ContentMaintainer,
                    },
                ]),
            },
        )
        .await
        .expect("update");
    assert!(logs_contain("audit.team.role.changed"));
}

#[tokio::test]
#[traced_test]
async fn audit_invitation_accepted_emits_event() {
    let db = test_db().await.expect("db");
    let fx = TeamFixture::build(&db).await.expect("fixture");
    let admin_ctx = auth_ctx_for_user(&db, &fx.admin_user).await.expect("auth");
    let inv = invitation_service(&db)
        .create_invitation_for_user(&admin_ctx, &fx.shared_team_id)
        .await
        .expect("invitation");
    let invitee = create_user(&db, "audit-invitee@test.local")
        .await
        .expect("invitee");
    let invitee_ctx = auth_ctx_for_user(&db, &invitee).await.expect("auth");
    invitation_service(&db)
        .accept_invitation_for_user(&invitee_ctx, &inv.id)
        .await
        .expect("accept");
    assert!(logs_contain("audit.team.invitation.accepted"));
}

#[tokio::test]
#[traced_test]
async fn audit_auth_otp_requested_emits_event() {
    let db = test_db().await.expect("db");
    let app = test::init_service(build_auth_app(db, 50, 200)).await;
    let req = test::TestRequest::post()
        .uri("/auth/otp/request")
        .insert_header(("Content-Type", "application/json"))
        .set_payload(json!({ "email": "otp-audit@test.local" }).to_string())
        .to_request();
    let resp = test::call_service(&app, req).await;
    assert_eq!(resp.status(), StatusCode::NO_CONTENT);
    assert!(logs_contain("audit.auth.otp.requested"));
}

#[tokio::test]
#[traced_test]
async fn audit_auth_login_success_emits_event() {
    let db = test_db().await.expect("db");
    let email = "otp-login-ok@test.local";
    let code = "424242";
    db.remember_otp(email, code, "audit-test-pepper", 300)
        .await
        .expect("seed otp");

    let app = test::init_service(build_auth_app(db, 50, 200)).await;
    let req = test::TestRequest::post()
        .uri("/auth/otp/verify")
        .insert_header(("Content-Type", "application/json"))
        .set_payload(json!({ "email": email, "code": code }).to_string())
        .to_request();
    let resp = test::call_service(&app, req).await;
    assert_eq!(resp.status(), StatusCode::OK);
    assert!(logs_contain("audit.auth.login.success"));
}

#[tokio::test]
#[traced_test]
async fn audit_auth_login_failure_emits_event() {
    let db = test_db().await.expect("db");
    let email = "otp-login-bad@test.local";
    db.remember_otp(email, "111111", "audit-test-pepper", 300)
        .await
        .expect("seed otp");

    let app = test::init_service(build_auth_app(db, 50, 200)).await;
    let req = test::TestRequest::post()
        .uri("/auth/otp/verify")
        .insert_header(("Content-Type", "application/json"))
        .set_payload(json!({ "email": email, "code": "999999" }).to_string())
        .to_request();
    let resp = test::call_service(&app, req).await;
    assert_eq!(resp.status(), StatusCode::BAD_REQUEST);
    assert!(logs_contain("audit.auth.login.failure"));
}

#[tokio::test]
#[traced_test]
async fn audit_auth_logout_and_session_revoked_emit_events() {
    let db = test_db().await.expect("db");
    let user = create_user(&db, "audit-logout@test.local")
        .await
        .expect("user");
    let session = session_service(&db)
        .create_session(Session::new(user, 3600))
        .await
        .expect("session");

    let cookie_cfg = CookieConfig {
        name: "sso_session".into(),
        secure: false,
        session_ttl_seconds: 3600,
        post_login_path: "/".into(),
    };

    let app = test::init_service(build_auth_app(db, 50, 200)).await;
    let req = test::TestRequest::post()
        .uri("/auth/logout")
        .cookie(
            actix_web::cookie::Cookie::build(cookie_cfg.name.clone(), session.id.clone())
                .path("/")
                .finish(),
        )
        .to_request();
    let resp = test::call_service(&app, req).await;
    assert_eq!(resp.status(), StatusCode::NO_CONTENT);
    assert!(logs_contain("audit.auth.logout"));
    assert!(logs_contain("audit.session.revoked"));
}

#[tokio::test]
#[traced_test]
async fn audit_rate_limit_rejected_emits_event() {
    let db = test_db().await.expect("db");
    let app = test::init_service(build_auth_app(db, 1, 1)).await;

    let mk_req = || {
        test::TestRequest::post()
            .uri("/auth/otp/request")
            .insert_header(("Content-Type", "application/json"))
            .set_payload(json!({ "email": "rl-audit@test.local" }).to_string())
            .to_request()
    };

    let first = test::call_service(&app, mk_req()).await;
    assert_eq!(first.status(), StatusCode::NO_CONTENT);

    let second = test::call_service(&app, mk_req()).await;
    assert_eq!(second.status(), StatusCode::TOO_MANY_REQUESTS);
    assert!(logs_contain("audit.rate_limit.rejected"));
}
