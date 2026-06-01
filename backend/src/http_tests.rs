//! Phase 4: HTTP-layer tests using `actix_web::test`.
//!
//! Tests are grouped into slices matching the implementation roadmap:
//! - Slice 4A: test harness helpers (this module's top-level helpers)
//! - Slice 4B: auth middleware (BLC-AUTH-001, BLC-AUTH-002)
//! - Slice 4C: OpenAPI endpoint (BLC-DOCS-001)
//! - Slice 4D: HTTP contract — invalid path IDs + idempotent DELETE (BLC-HTTP-001, BLC-HTTP-002)
//! - Slice 4E: user admin gates (BLC-USER-005, BLC-USER-006, BLC-USER-007, BLC-USER-009)
//! - Slice 4F: session admin gates (BLC-SESS-003, BLC-SESS-004, BLC-SESS-005, BLC-SESS-006, BLC-SESS-009)
//! - Slice 4G: list pagination HTTP validation (BLC-LP-004 through BLC-LP-010)
//! - Slice 4H: monitoring / HTTP audit logs (BLC-MON-002 through BLC-MON-004)
//! - API rate limit (**BLC-HTTP-004**), song ACL / upsert (**BLC-SONG-002**, **BLC-SONG-018**), blob create (**BLC-BLOB-005**)
//!
//! # Middleware error note
//!
//! `actix_web::test::call_service` panics when the service returns `Err` instead of
//! `Ok(ServiceResponse)`. In production actix-web converts middleware errors via
//! `ResponseError::error_response()` at the server boundary, but the test harness
//! does not do this automatically. The `call_status!` macro handles both `Ok` and `Err`
//! cases so tests that exercise `RequireUser` / `RequireAdmin` do not panic.

use std::sync::Arc;

use actix_web::middleware::Compat;
use actix_web::web::Data;
use actix_web::{App, test};
use anyhow::Result as AnyResult;
use shared::user::Session;

use crate::database::Database;
use crate::docs;
use crate::resources;
use crate::resources::User;
use crate::settings::{CookieConfig, CoverUploadLimits, ProfilePictureLimits, Settings};
use crate::test_helpers::{create_song_with_title, create_user, session_service, test_db};

// ─── Slice 4A: test harness helpers ──────────────────────────────────────────

/// Build an `actix_web::App` wired with all resource services and the docs scope.
///
/// Takes `Arc<Database>` by value so no lifetime is captured, allowing
/// `actix_web::test::init_service` (which requires `'static`) to work.
///
/// The app does **not** include `auth::rest::scope()` (needs OIDC clients) or
/// `frontend::rest::scope()` (needs a static file directory on disk).
pub(crate) fn build_app(
    db: Arc<Database>,
) -> App<
    impl actix_web::dev::ServiceFactory<
        actix_web::dev::ServiceRequest,
        Config = (),
        Response = actix_web::dev::ServiceResponse,
        Error = actix_web::Error,
        InitError = (),
    >,
> {
    build_app_with_api_limits(db, 50, 200)
}

/// Same as [`build_app`] but with configurable `/api/v1` per-IP rate limits (for **BLC-HTTP-004** tests).
fn build_app_with_api_limits(
    db: Arc<Database>,
    api_rate_limit_rps: u64,
    api_rate_limit_burst: u32,
) -> App<
    impl actix_web::dev::ServiceFactory<
        actix_web::dev::ServiceRequest,
        Config = (),
        Response = actix_web::dev::ServiceResponse,
        Error = actix_web::Error,
        InitError = (),
    >,
> {
    use crate::test_helpers::{
        blob_service, collection_service, invitation_service, session_service, setlist_service,
        song_service, team_service, user_service,
    };

    // Unique path so parallel HTTP tests do not share blob files on disk.
    let blob_dir = std::env::temp_dir()
        .join(format!(
            "worshipviewer_http_tests_blobs_{}",
            uuid::Uuid::new_v4()
        ))
        .to_string_lossy()
        .into_owned();

    let cookie_cfg = Data::new(CookieConfig {
        name: "sso_session".into(),
        secure: false,
        session_ttl_seconds: 3600,
        post_login_path: "/".into(),
    });

    App::new()
        .wrap(crate::request_id::RequestId)
        .wrap(crate::http_audit::HttpAudit::new(Data::from(db.clone())))
        .wrap(Compat::new(tracing_actix_web::TracingLogger::<
            crate::request_id::WorshipRootSpan,
        >::new()))
        .app_data(Data::from(db.clone()))
        .app_data(Data::new(blob_service(&db, blob_dir)))
        .app_data(Data::new(collection_service(&db)))
        .app_data(Data::new(song_service(&db)))
        .app_data(Data::new(setlist_service(&db)))
        .app_data(Data::new(team_service(&db)))
        .app_data(Data::new(invitation_service(&db)))
        .app_data(Data::new(user_service(&db)))
        .app_data(Data::new(session_service(&db)))
        .app_data(Data::new(ProfilePictureLimits {
            max_bytes: 2 * 1024 * 1024,
        }))
        .app_data(Data::new(CoverUploadLimits {
            max_bytes: 20 * 1024 * 1024,
        }))
        .app_data(cookie_cfg)
        .app_data(crate::error::json_config())
        .service(docs::rest::scope(Settings::default()))
        .service(resources::rest::scope(
            20 * 1024 * 1024,
            2 * 1024 * 1024,
            api_rate_limit_rps,
            api_rate_limit_burst,
        ))
}

/// Create a session for `user` and return its raw ID (used as Bearer token).
async fn create_session_token(db: &Arc<Database>, user: User) -> AnyResult<String> {
    let session = session_service(db)
        .create_session(Session::new(user, 3600))
        .await?;
    Ok(session.id)
}

/// Call the service with the given request and return the HTTP status code.
///
/// Unlike `actix_web::test::call_service`, this macro handles the case where the
/// service returns `Err(actix_web::Error)` (e.g. from `RequireUser` or `RequireAdmin`
/// middleware) by converting the error to its response status code via `ResponseError`.
macro_rules! call_status {
    ($app:expr, $req:expr) => {{
        use actix_web::dev::Service as _;
        match $app.call($req.to_request()).await {
            Ok(r) => r.status(),
            Err(e) => e.as_response_error().status_code(),
        }
    }};
}

// ─── Slice 4B: auth middleware ────────────────────────────────────────────────

#[cfg(test)]
mod auth_middleware {
    use super::*;
    use actix_web::http::StatusCode;

    /// BLC-AUTH-001: missing Authorization header returns 401.
    #[actix_web::test]
    async fn blc_auth_001_no_auth_header_returns_401() {
        let db = test_db().await.unwrap();
        let app = test::init_service(build_app(db.clone())).await;
        let req = test::TestRequest::get().uri("/api/v1/songs");
        assert_eq!(call_status!(app, req), StatusCode::UNAUTHORIZED);
    }

    /// BLC-AUTH-001: Authorization: Basic abc (wrong scheme) returns 401.
    #[actix_web::test]
    async fn blc_auth_001_basic_scheme_returns_401() {
        let db = test_db().await.unwrap();
        let app = test::init_service(build_app(db.clone())).await;
        let req = test::TestRequest::get()
            .uri("/api/v1/songs")
            .insert_header(("Authorization", "Basic abc"));
        assert_eq!(call_status!(app, req), StatusCode::UNAUTHORIZED);
    }

    /// BLC-AUTH-001: empty Authorization header value returns 401.
    #[actix_web::test]
    async fn blc_auth_001_empty_auth_header_returns_401() {
        let db = test_db().await.unwrap();
        let app = test::init_service(build_app(db.clone())).await;
        let req = test::TestRequest::get()
            .uri("/api/v1/songs")
            .insert_header(("Authorization", ""));
        assert_eq!(call_status!(app, req), StatusCode::UNAUTHORIZED);
    }

    /// BLC-AUTH-002: completely invalid Bearer token returns 401.
    #[actix_web::test]
    async fn blc_auth_002_invalid_bearer_token_returns_401() {
        let db = test_db().await.unwrap();
        let app = test::init_service(build_app(db.clone())).await;
        let req = test::TestRequest::get()
            .uri("/api/v1/songs")
            .insert_header(("Authorization", "Bearer totallyinvalidtoken"));
        assert_eq!(call_status!(app, req), StatusCode::UNAUTHORIZED);
    }

    /// BLC-AUTH-002: deleted session ID returns 401.
    #[actix_web::test]
    async fn blc_auth_002_deleted_session_returns_401() {
        let db = test_db().await.unwrap();
        let user = create_user(&db, "auth-deleted@test.local").await.unwrap();
        let token = create_session_token(&db, user).await.unwrap();

        // Delete the session before using it.
        session_service(&db).delete_session(&token).await.unwrap();

        let app = test::init_service(build_app(db.clone())).await;
        let req = test::TestRequest::get()
            .uri("/api/v1/songs")
            .insert_header(("Authorization", format!("Bearer {token}")));
        assert_eq!(call_status!(app, req), StatusCode::UNAUTHORIZED);
    }

    #[actix_web::test]
    async fn expired_session_returns_401_and_row_remains() {
        let db = test_db().await.unwrap();
        let user = create_user(&db, "auth-expired@test.local").await.unwrap();
        let token = create_session_token(&db, user).await.unwrap();

        db.db
            .query(
                r"
LET $sid = type::record('session', $id);
UPDATE $sid SET expires_at = time::now() - 1h;
RETURN (SELECT id FROM ONLY $sid).id != NONE;
",
            )
            .bind(("id", token.clone()))
            .await
            .unwrap()
            .take::<Vec<bool>>(2)
            .unwrap();

        let app = test::init_service(build_app(db.clone())).await;
        let req = test::TestRequest::get()
            .uri("/api/v1/songs")
            .insert_header(("Authorization", format!("Bearer {token}")));
        assert_eq!(call_status!(app, req), StatusCode::UNAUTHORIZED);

        let still_there: bool = db
            .db
            .query("RETURN (SELECT id FROM ONLY type::record('session', $id)).id != NONE")
            .bind(("id", token.clone()))
            .await
            .unwrap()
            .take::<Vec<bool>>(0)
            .unwrap()
            .into_iter()
            .next()
            .unwrap_or(false);
        assert!(
            still_there,
            "expired session row must remain until explicitly deleted"
        );
    }

    /// BLC-AUTH-001: valid Bearer token is accepted (passes through to resource, not 401).
    #[actix_web::test]
    async fn blc_auth_001_valid_bearer_token_passes_auth() {
        let db = test_db().await.unwrap();
        let user = create_user(&db, "auth-valid@test.local").await.unwrap();
        let token = create_session_token(&db, user).await.unwrap();

        let app = test::init_service(build_app(db.clone())).await;
        let req = test::TestRequest::get()
            .uri("/api/v1/songs")
            .insert_header(("Authorization", format!("Bearer {token}")));
        assert_ne!(call_status!(app, req), StatusCode::UNAUTHORIZED);
    }
}

// ─── Slice 4C: OpenAPI endpoint ───────────────────────────────────────────────

#[cfg(test)]
mod openapi_endpoint {
    use super::*;
    use actix_web::http::StatusCode;

    /// BLC-DOCS-001: GET /api/docs/openapi.json without auth returns 200 and valid JSON.
    #[actix_web::test]
    async fn blc_docs_001_openapi_without_auth_returns_200() {
        let db = test_db().await.unwrap();
        let app = test::init_service(build_app(db.clone())).await;
        let req = test::TestRequest::get()
            .uri("/api/docs/openapi.json")
            .to_request();
        let resp = test::call_service(&app, req).await;
        assert_eq!(resp.status(), StatusCode::OK);
        let body = test::read_body(resp).await;
        let _parsed: serde_json::Value =
            serde_json::from_slice(&body).expect("response is valid JSON");
    }

    /// BLC-DOCS-001: GET /api/docs/openapi.json with auth header still returns 200.
    #[actix_web::test]
    async fn blc_docs_001_openapi_with_auth_still_200() {
        let db = test_db().await.unwrap();
        let user = create_user(&db, "docs-auth@test.local").await.unwrap();
        let token = create_session_token(&db, user).await.unwrap();

        let app = test::init_service(build_app(db.clone())).await;
        let req = test::TestRequest::get()
            .uri("/api/docs/openapi.json")
            .insert_header(("Authorization", format!("Bearer {token}")))
            .to_request();
        let resp = test::call_service(&app, req).await;
        assert_eq!(resp.status(), StatusCode::OK);
    }

    /// BLC-DOCS-003: `/auth/login` and `/auth/callback` declare query parameters as `in: query`.
    #[actix_web::test]
    async fn blc_docs_003_auth_params_are_query() {
        let db = test_db().await.unwrap();
        let app = test::init_service(build_app(db.clone())).await;
        let req = test::TestRequest::get()
            .uri("/api/docs/openapi.json")
            .to_request();
        let resp = test::call_service(&app, req).await;
        assert_eq!(resp.status(), StatusCode::OK);
        let body: serde_json::Value = test::read_body_json(resp).await;
        let login = &body["paths"]["/auth/login"]["get"];
        let params = login["parameters"].as_array().expect("login parameters");
        for p in params {
            assert_eq!(p["in"], "query", "login param: {p:?}");
        }
        let names: Vec<_> = params.iter().filter_map(|p| p["name"].as_str()).collect();
        assert!(names.contains(&"redirect_to"));

        let cb = &body["paths"]["/auth/callback"]["get"];
        let cb_params = cb["parameters"].as_array().expect("callback parameters");
        for p in cb_params {
            assert_eq!(p["in"], "query", "callback param: {p:?}");
        }
        let cb_names: Vec<_> = cb_params
            .iter()
            .filter_map(|p| p["name"].as_str())
            .collect();
        assert!(cb_names.contains(&"code"));
        assert!(cb_names.contains(&"state"));
    }

    /// BLC-DOCS-001: GET /api/v1/docs/openapi.json (wrong prefix) returns 404.
    #[actix_web::test]
    async fn blc_docs_001_wrong_path_returns_404() {
        let db = test_db().await.unwrap();
        let user = create_user(&db, "docs-wrong@test.local").await.unwrap();
        let token = create_session_token(&db, user).await.unwrap();

        let app = test::init_service(build_app(db.clone())).await;
        let req = test::TestRequest::get()
            .uri("/api/v1/docs/openapi.json")
            .insert_header(("Authorization", format!("Bearer {token}")));
        assert_eq!(call_status!(app, req), StatusCode::NOT_FOUND);
    }
}

/// Public `GET /api/v1/about` (no session).
#[cfg(test)]
mod about_endpoint {
    use super::*;
    use actix_web::http::StatusCode;

    #[actix_web::test]
    async fn get_api_v1_about_without_auth_returns_200() {
        let db = test_db().await.unwrap();
        let app = test::init_service(build_app(db.clone())).await;
        let req = test::TestRequest::get().uri("/api/v1/about").to_request();
        let resp = test::call_service(&app, req).await;
        assert_eq!(resp.status(), StatusCode::OK);
        let body: serde_json::Value = test::read_body_json(resp).await;
        assert_eq!(body["service"], "worshipviewer-backend");
        assert!(body["version"].as_str().is_some());
        assert!(body.get("git_commit").is_some());
        assert!(body["production"].is_boolean());
    }
}

/// BLC-DOCS-002: OpenAPI documents `Problem` and uses `application/problem+json` for 4xx/5xx bodies.
#[cfg(test)]
mod openapi_problem_schema {
    use crate::settings::Settings;

    #[test]
    fn blc_docs_002_openapi_problem_and_problem_json() {
        let openapi = crate::docs::openapi_document(&Settings::default());
        let v = serde_json::to_value(openapi).expect("openapi serializes to JSON");
        let schemas = v["components"]["schemas"]
            .as_object()
            .expect("components.schemas");
        assert!(
            schemas.contains_key("Problem"),
            "components.schemas must include Problem"
        );

        let paths = v["paths"].as_object().expect("paths");
        let problem = schemas
            .get("Problem")
            .expect("Problem schema")
            .get("properties")
            .and_then(|p| p.as_object())
            .expect("Problem.properties");
        assert!(
            !problem.contains_key("error"),
            "Problem schema must not include legacy `error` property"
        );

        for (path, path_item) in paths {
            let path_item = path_item.as_object().expect("path item");
            for method in ["get", "put", "post", "delete", "patch"] {
                let Some(op) = path_item.get(method) else {
                    continue;
                };
                let responses = op["responses"].as_object();
                let Some(responses) = responses else {
                    continue;
                };
                for (status, resp) in responses {
                    let Ok(code) = status.parse::<u16>() else {
                        continue;
                    };
                    if !(400..600).contains(&code) {
                        continue;
                    }
                    let content = &resp["content"];
                    assert!(
                        content.is_object(),
                        "{path} {method} {status}: missing content object"
                    );
                    assert!(
                        content.get("application/problem+json").is_some(),
                        "{path} {method} {status}: expected application/problem+json"
                    );
                    let schema_ref = &content["application/problem+json"]["schema"]["$ref"];
                    let ok = schema_ref.as_str().is_some_and(|r| r.ends_with("/Problem"));
                    assert!(
                        ok,
                        "{path} {method} {status}: schema $ref should point to Problem, got {schema_ref:?}"
                    );
                }
            }
        }
    }

    #[test]
    fn blc_docs_004_openapi_schema_property_keys_are_snake_case() {
        let openapi = crate::docs::openapi_document(&Settings::default());
        let v = serde_json::to_value(openapi).expect("openapi serializes to JSON");
        fn check(value: &serde_json::Value, ctx: &str) {
            match value {
                serde_json::Value::Object(map) => {
                    if let Some(props) = map.get("properties").and_then(|p| p.as_object()) {
                        for (key, child) in props {
                            assert!(
                                key.chars().next().is_some_and(|c| c.is_ascii_lowercase())
                                    && key.chars().all(|c| c.is_ascii_lowercase()
                                        || c.is_ascii_digit()
                                        || c == '_'),
                                "{ctx}: property key {key:?} must be snake_case ASCII",
                            );
                            check(child, &format!("{ctx}.{key}"));
                        }
                    }
                    for (k, child) in map {
                        check(child, &format!("{ctx}/{k}"));
                    }
                }
                serde_json::Value::Array(items) => {
                    for (i, item) in items.iter().enumerate() {
                        check(item, &format!("{ctx}[{i}]"));
                    }
                }
                _ => {}
            }
        }
        if let Some(schemas) = v["components"]["schemas"].as_object() {
            for (name, schema) in schemas {
                check(schema, &format!("components.schemas.{name}"));
            }
        }
    }
}

// ─── Slice 4D: HTTP contract ──────────────────────────────────────────────────

#[cfg(test)]
mod http_contract {
    use super::*;
    use actix_web::http::StatusCode;

    async fn authed_token(db: &Arc<Database>, email: &str) -> String {
        let user = create_user(db, email).await.unwrap();
        create_session_token(db, user).await.unwrap()
    }

    /// BLC-HTTP-001: wrong-table prefix in song ID returns 400.
    #[actix_web::test]
    async fn blc_http_001_wrong_table_prefix_song_returns_400() {
        let db = test_db().await.unwrap();
        let token = authed_token(&db, "http-contract-a@test.local").await;
        let app = test::init_service(build_app(db.clone())).await;
        let req = test::TestRequest::get()
            .uri("/api/v1/songs/blob:wrongtable")
            .insert_header(("Authorization", format!("Bearer {token}")))
            .to_request();
        let resp = test::call_service(&app, req).await;
        assert_eq!(resp.status(), StatusCode::BAD_REQUEST);
    }

    /// BLC-HTTP-001: wrong-table prefix in setlist ID returns 400.
    #[actix_web::test]
    async fn blc_http_001_wrong_table_prefix_setlist_returns_400() {
        let db = test_db().await.unwrap();
        let token = authed_token(&db, "http-contract-b@test.local").await;
        let app = test::init_service(build_app(db.clone())).await;
        let req = test::TestRequest::delete()
            .uri("/api/v1/setlists/collection:x")
            .insert_header(("Authorization", format!("Bearer {token}")))
            .to_request();
        let resp = test::call_service(&app, req).await;
        assert_eq!(resp.status(), StatusCode::BAD_REQUEST);
    }

    /// Table prefix form (`table:id`) is rejected with 400 at the HTTP edge.
    #[actix_web::test]
    async fn blc_http_001_table_prefix_form_returns_400() {
        let db = test_db().await.unwrap();
        let token = authed_token(&db, "http-contract-c@test.local").await;
        let app = test::init_service(build_app(db.clone())).await;
        let req = test::TestRequest::get()
            .uri("/api/v1/songs/song:validid")
            .insert_header(("Authorization", format!("Bearer {token}")))
            .to_request();
        let resp = test::call_service(&app, req).await;
        assert_eq!(resp.status(), StatusCode::BAD_REQUEST);
    }

    /// BLC-HTTP-001: plain ID (no table prefix) is accepted (not 400).
    #[actix_web::test]
    async fn blc_http_001_plain_id_not_400() {
        let db = test_db().await.unwrap();
        let token = authed_token(&db, "http-contract-d@test.local").await;
        let app = test::init_service(build_app(db.clone())).await;
        let req = test::TestRequest::get()
            .uri("/api/v1/songs/plainid")
            .insert_header(("Authorization", format!("Bearer {token}")))
            .to_request();
        let resp = test::call_service(&app, req).await;
        assert_ne!(resp.status(), StatusCode::BAD_REQUEST);
    }

    /// BLC-HTTP-002: DELETE existing song, repeat DELETE returns 404.
    #[actix_web::test]
    async fn blc_http_002_idempotent_delete_second_returns_404() {
        let db = test_db().await.unwrap();
        let user = create_user(&db, "http-del@test.local").await.unwrap();
        let token = create_session_token(&db, user.clone()).await.unwrap();
        let song = create_song_with_title(&db, &user, "DeleteMe")
            .await
            .unwrap();
        let song_id = song.id.clone();

        let app = test::init_service(build_app(db.clone())).await;

        let first = test::TestRequest::delete()
            .uri(&format!("/api/v1/songs/{song_id}"))
            .insert_header(("Authorization", format!("Bearer {token}")))
            .to_request();
        let first_resp = test::call_service(&app, first).await;
        assert_eq!(first_resp.status(), StatusCode::NO_CONTENT);

        let second = test::TestRequest::delete()
            .uri(&format!("/api/v1/songs/{song_id}"))
            .insert_header(("Authorization", format!("Bearer {token}")))
            .to_request();
        let second_resp = test::call_service(&app, second).await;
        assert_eq!(second_resp.status(), StatusCode::NOT_FOUND);
    }

    /// BLC-HTTP-002: DELETE non-existent song ID returns 404.
    #[actix_web::test]
    async fn blc_http_002_delete_nonexistent_returns_404() {
        let db = test_db().await.unwrap();
        let token = authed_token(&db, "http-del-ne@test.local").await;
        let app = test::init_service(build_app(db.clone())).await;
        let req = test::TestRequest::delete()
            .uri("/api/v1/songs/nonexistentsongid123")
            .insert_header(("Authorization", format!("Bearer {token}")))
            .to_request();
        let resp = test::call_service(&app, req).await;
        assert_eq!(resp.status(), StatusCode::NOT_FOUND);
    }
}

#[cfg(test)]
mod api_rate_limit_http {
    use super::*;
    use actix_web::http::StatusCode;

    /// BLC-HTTP-004: when the per-IP API limit is exceeded, **429** includes **`Retry-After`** and **`X-RateLimit-*`** headers.
    #[actix_web::test]
    async fn blc_http_004_rate_limit_429_includes_headers() {
        let db = test_db().await.unwrap();
        let user = create_user(&db, "api-ratelimit@test.local").await.unwrap();
        let token = create_session_token(&db, user).await.unwrap();
        let app = test::init_service(build_app_with_api_limits(db, 1, 1)).await;
        let uri = "/api/v1/songs";
        let req1 = test::TestRequest::get()
            .uri(uri)
            .insert_header(("Authorization", format!("Bearer {token}")))
            .to_request();
        let resp1 = test::call_service(&app, req1).await;
        assert_eq!(resp1.status(), StatusCode::OK);
        let req2 = test::TestRequest::get()
            .uri(uri)
            .insert_header(("Authorization", format!("Bearer {token}")))
            .to_request();
        let resp2 = test::call_service(&app, req2).await;
        assert_eq!(resp2.status(), StatusCode::TOO_MANY_REQUESTS);
        assert!(resp2.headers().get("retry-after").is_some());
        assert!(resp2.headers().get("x-ratelimit-limit").is_some());
    }
}

// ─── Slice 4E: user admin gates ───────────────────────────────────────────────

#[cfg(test)]
mod user_admin_gates {
    use super::*;
    use actix_web::http::StatusCode;
    use serde_json::json;

    async fn make_admin(db: &Arc<Database>, email: &str) -> (User, String) {
        use crate::test_helpers::user_service;
        use shared::user::Role;
        let mut raw = User::new(email);
        raw.role = Role::Admin;
        let admin = user_service(db).create_user(raw).await.unwrap();
        let token = create_session_token(db, admin.clone()).await.unwrap();
        (admin, token)
    }

    /// BLC-USER-005: authenticated GET /users/me returns 200 matching the user.
    #[actix_web::test]
    async fn blc_user_005_get_me_returns_own_user() {
        let db = test_db().await.unwrap();
        let user = create_user(&db, "me-user@test.local").await.unwrap();
        let token = create_session_token(&db, user.clone()).await.unwrap();

        let app = test::init_service(build_app(db.clone())).await;
        let req = test::TestRequest::get()
            .uri("/api/v1/users/me")
            .insert_header(("Authorization", format!("Bearer {token}")))
            .to_request();
        let resp = test::call_service(&app, req).await;
        assert_eq!(resp.status(), StatusCode::OK);
        let body: serde_json::Value = test::read_body_json(resp).await;
        assert_eq!(body["id"], user.id);
        assert_eq!(body["email"], user.email);
    }

    /// BLC-USER-005: `User` JSON omits audit metrics; `GET /users/me/metrics` returns them.
    #[actix_web::test]
    async fn blc_user_005_me_response_omits_metrics_get_metrics_ok() {
        let db = test_db().await.unwrap();
        let user = create_user(&db, "me-metrics-split@test.local")
            .await
            .unwrap();
        let token = create_session_token(&db, user).await.unwrap();
        let app = test::init_service(build_app(db.clone())).await;

        let req_me = test::TestRequest::get()
            .uri("/api/v1/users/me")
            .insert_header(("Authorization", format!("Bearer {token}")))
            .to_request();
        let body: serde_json::Value = test::call_and_read_body_json(&app, req_me).await;
        let obj = body.as_object().expect("user object");
        assert!(!obj.contains_key("request_count"));
        assert!(!obj.contains_key("last_used_at"));

        let req_m = test::TestRequest::get()
            .uri("/api/v1/users/me/metrics")
            .insert_header(("Authorization", format!("Bearer {token}")))
            .to_request();
        let m: serde_json::Value = test::call_and_read_body_json(&app, req_m).await;
        assert!(m.get("request_count").is_some());
        assert!(m.get("last_used_at").is_some());
    }

    /// BLC-USER-005: two different users each see their own record via /users/me.
    #[actix_web::test]
    async fn blc_user_005_different_users_see_own_record() {
        let db = test_db().await.unwrap();
        let user_a = create_user(&db, "me-a@test.local").await.unwrap();
        let user_b = create_user(&db, "me-b@test.local").await.unwrap();
        let token_a = create_session_token(&db, user_a.clone()).await.unwrap();
        let token_b = create_session_token(&db, user_b.clone()).await.unwrap();

        let app = test::init_service(build_app(db.clone())).await;

        let req_a = test::TestRequest::get()
            .uri("/api/v1/users/me")
            .insert_header(("Authorization", format!("Bearer {token_a}")))
            .to_request();
        let resp_a: serde_json::Value = test::call_and_read_body_json(&app, req_a).await;
        assert_eq!(resp_a["id"], user_a.id);

        let req_b = test::TestRequest::get()
            .uri("/api/v1/users/me")
            .insert_header(("Authorization", format!("Bearer {token_b}")))
            .to_request();
        let resp_b: serde_json::Value = test::call_and_read_body_json(&app, req_b).await;
        assert_eq!(resp_b["id"], user_b.id);
    }

    /// Raw token (no Bearer prefix) on GET /users/me returns 401 — only `Bearer <token>` is accepted.
    #[actix_web::test]
    async fn blc_user_006_raw_token_on_me_returns_401() {
        let db = test_db().await.unwrap();
        let user = create_user(&db, "raw-token@test.local").await.unwrap();
        let token = create_session_token(&db, user).await.unwrap();

        let app = test::init_service(build_app(db.clone())).await;
        let req = test::TestRequest::get()
            .uri("/api/v1/users/me")
            .insert_header(("Authorization", token.clone()));
        assert_eq!(call_status!(app, req), StatusCode::UNAUTHORIZED);
    }

    /// Bearer token (with prefix) on GET /users/me returns 200.
    #[actix_web::test]
    async fn blc_user_006b_bearer_token_on_me_returns_200() {
        let db = test_db().await.unwrap();
        let user = create_user(&db, "bearer-token@test.local").await.unwrap();
        let token = create_session_token(&db, user).await.unwrap();

        let app = test::init_service(build_app(db.clone())).await;
        let req = test::TestRequest::get()
            .uri("/api/v1/users/me")
            .insert_header(("Authorization", format!("Bearer {token}")));
        assert_eq!(call_status!(app, req), StatusCode::OK);
    }

    /// BLC-USER-007: non-admin GET /users returns 403.
    #[actix_web::test]
    async fn blc_user_007_non_admin_get_users_returns_403() {
        let db = test_db().await.unwrap();
        let user = create_user(&db, "nonadmin-lu@test.local").await.unwrap();
        let token = create_session_token(&db, user).await.unwrap();

        let app = test::init_service(build_app(db.clone())).await;
        let req = test::TestRequest::get()
            .uri("/api/v1/users")
            .insert_header(("Authorization", format!("Bearer {token}")));
        assert_eq!(call_status!(app, req), StatusCode::FORBIDDEN);
    }

    /// BLC-USER-007: non-admin POST /users returns 403.
    #[actix_web::test]
    async fn blc_user_007_non_admin_post_users_returns_403() {
        let db = test_db().await.unwrap();
        let user = create_user(&db, "nonadmin-cu@test.local").await.unwrap();
        let token = create_session_token(&db, user).await.unwrap();

        let app = test::init_service(build_app(db.clone())).await;
        let req = test::TestRequest::post()
            .uri("/api/v1/users")
            .insert_header(("Authorization", format!("Bearer {token}")))
            .insert_header(("Content-Type", "application/json"))
            .set_payload(json!({"email": "new@test.local"}).to_string());
        assert_eq!(call_status!(app, req), StatusCode::FORBIDDEN);
    }

    /// BLC-USER-007: non-admin DELETE /users/{id} returns 403.
    #[actix_web::test]
    async fn blc_user_007_non_admin_delete_user_returns_403() {
        let db = test_db().await.unwrap();
        let user = create_user(&db, "nonadmin-du@test.local").await.unwrap();
        let other = create_user(&db, "nonadmin-du-other@test.local")
            .await
            .unwrap();
        let token = create_session_token(&db, user).await.unwrap();

        let app = test::init_service(build_app(db.clone())).await;
        let req = test::TestRequest::delete()
            .uri(&format!("/api/v1/users/{}", other.id))
            .insert_header(("Authorization", format!("Bearer {token}")));
        assert_eq!(call_status!(app, req), StatusCode::FORBIDDEN);
    }

    /// BLC-USER-007: non-admin GET /users/{id} returns 403.
    #[actix_web::test]
    async fn blc_user_007_non_admin_get_user_by_id_returns_403() {
        let db = test_db().await.unwrap();
        let user = create_user(&db, "nonadmin-gu@test.local").await.unwrap();
        let other = create_user(&db, "nonadmin-gu-other@test.local")
            .await
            .unwrap();
        let token = create_session_token(&db, user).await.unwrap();

        let app = test::init_service(build_app(db.clone())).await;
        let req = test::TestRequest::get()
            .uri(&format!("/api/v1/users/{}", other.id))
            .insert_header(("Authorization", format!("Bearer {token}")));
        assert_eq!(call_status!(app, req), StatusCode::FORBIDDEN);
    }

    /// BLC-USER-007: admin GET /users returns 200.
    #[actix_web::test]
    async fn blc_user_007_admin_get_users_returns_200() {
        let db = test_db().await.unwrap();
        let (_, token) = make_admin(&db, "admin-lu@test.local").await;

        let app = test::init_service(build_app(db.clone())).await;
        let req = test::TestRequest::get()
            .uri("/api/v1/users")
            .insert_header(("Authorization", format!("Bearer {token}")))
            .to_request();
        let resp = test::call_service(&app, req).await;
        assert_eq!(resp.status(), StatusCode::OK);
    }

    /// BLC-USER-009: admin GET /users/{id} returns 200.
    #[actix_web::test]
    async fn blc_user_009_admin_get_user_by_id_returns_200() {
        let db = test_db().await.unwrap();
        let (_, token) = make_admin(&db, "admin-gu@test.local").await;
        let other = create_user(&db, "target-user@test.local").await.unwrap();

        let app = test::init_service(build_app(db.clone())).await;
        let req = test::TestRequest::get()
            .uri(&format!("/api/v1/users/{}", other.id))
            .insert_header(("Authorization", format!("Bearer {token}")))
            .to_request();
        let resp = test::call_service(&app, req).await;
        assert_eq!(resp.status(), StatusCode::OK);
    }

    /// BLC-USER-007: admin POST /users with valid email returns 201.
    #[actix_web::test]
    async fn blc_user_007_admin_create_user_returns_201() {
        let db = test_db().await.unwrap();
        let (_, token) = make_admin(&db, "admin-post@test.local").await;

        let app = test::init_service(build_app(db.clone())).await;
        let req = test::TestRequest::post()
            .uri("/api/v1/users")
            .insert_header(("Authorization", format!("Bearer {token}")))
            .insert_header(("Content-Type", "application/json"))
            .set_payload(json!({"email": "newly-created@test.local"}).to_string())
            .to_request();
        let resp = test::call_service(&app, req).await;
        assert_eq!(resp.status(), StatusCode::CREATED);
    }
}

// ─── Slice 4F: session admin gates ───────────────────────────────────────────

#[cfg(test)]
mod session_admin_gates {
    use super::*;
    use actix_web::http::StatusCode;

    async fn make_admin(db: &Arc<Database>, email: &str) -> (User, String) {
        use crate::test_helpers::user_service;
        use shared::user::Role;
        let mut raw = User::new(email);
        raw.role = Role::Admin;
        let admin = user_service(db).create_user(raw).await.unwrap();
        let token = create_session_token(db, admin.clone()).await.unwrap();
        (admin, token)
    }

    /// BLC-SESS-003: GET /users/me/sessions returns only own sessions.
    ///
    /// User A has 2 sessions; they should see exactly 2.
    #[actix_web::test]
    async fn blc_sess_003_get_my_sessions_returns_own_sessions() {
        let db = test_db().await.unwrap();
        let user_a = create_user(&db, "sess-a@test.local").await.unwrap();
        let user_b = create_user(&db, "sess-b@test.local").await.unwrap();

        let token_a1 = create_session_token(&db, user_a.clone()).await.unwrap();
        let _token_a2 = create_session_token(&db, user_a.clone()).await.unwrap();
        let _token_b1 = create_session_token(&db, user_b.clone()).await.unwrap();

        let app = test::init_service(build_app(db.clone())).await;
        let req = test::TestRequest::get()
            .uri("/api/v1/users/me/sessions")
            .insert_header(("Authorization", format!("Bearer {token_a1}")))
            .to_request();
        let resp = test::call_service(&app, req).await;
        assert_eq!(resp.status(), StatusCode::OK);
        let body: serde_json::Value = test::read_body_json(resp).await;
        let sessions = body.as_array().expect("array");
        assert_eq!(sessions.len(), 2, "User A should see exactly 2 sessions");
    }

    /// BLC-SESS-003: user with a single session sees exactly one entry.
    #[actix_web::test]
    async fn blc_sess_003_single_session_returns_one_entry() {
        let db = test_db().await.unwrap();
        let user = create_user(&db, "sess-one@test.local").await.unwrap();
        let token = create_session_token(&db, user).await.unwrap();

        let app = test::init_service(build_app(db.clone())).await;
        let req = test::TestRequest::get()
            .uri("/api/v1/users/me/sessions")
            .insert_header(("Authorization", format!("Bearer {token}")))
            .to_request();
        let resp = test::call_service(&app, req).await;
        assert_eq!(resp.status(), StatusCode::OK);
        let body: serde_json::Value = test::read_body_json(resp).await;
        assert_eq!(body.as_array().expect("array").len(), 1);
    }

    /// BLC-SESS-003: `SessionBody` omits audit metrics; `GET /users/me/session/metrics` returns them.
    /// Current session is exposed as `GET /users/me/sessions/current` (credential on the wire).
    #[actix_web::test]
    async fn blc_sess_003_current_session_omits_metrics_get_metrics_ok() {
        let db = test_db().await.unwrap();
        let user = create_user(&db, "sess-metrics-split@test.local")
            .await
            .unwrap();
        let token = create_session_token(&db, user).await.unwrap();
        let app = test::init_service(build_app(db.clone())).await;

        let req_s = test::TestRequest::get()
            .uri("/api/v1/users/me/sessions/current")
            .insert_header(("Authorization", format!("Bearer {token}")))
            .to_request();
        let body: serde_json::Value = test::call_and_read_body_json(&app, req_s).await;
        let obj = body.as_object().expect("session object");
        assert!(!obj.contains_key("request_count"));
        assert!(!obj.contains_key("last_used_at"));

        let req_m = test::TestRequest::get()
            .uri("/api/v1/users/me/session/metrics")
            .insert_header(("Authorization", format!("Bearer {token}")))
            .to_request();
        let m: serde_json::Value = test::call_and_read_body_json(&app, req_m).await;
        assert!(m.get("request_count").is_some());
        assert!(m.get("last_used_at").is_some());
    }
    #[actix_web::test]
    async fn blc_sess_004_delete_own_session_succeeds() {
        let db = test_db().await.unwrap();
        let user = create_user(&db, "sess-del-own@test.local").await.unwrap();
        let token = create_session_token(&db, user).await.unwrap();

        let app = test::init_service(build_app(db.clone())).await;
        let req = test::TestRequest::delete()
            .uri(&format!("/api/v1/users/me/sessions/{token}"))
            .insert_header(("Authorization", format!("Bearer {token}")))
            .to_request();
        let resp = test::call_service(&app, req).await;
        assert_eq!(resp.status(), StatusCode::NO_CONTENT);
    }

    /// BLC-SESS-004: GET /users/me/sessions/{other_user_session} should return 404.
    ///
    #[actix_web::test]
    async fn blc_sess_004_get_other_users_session_via_me_returns_404() {
        let db = test_db().await.unwrap();
        let user_a = create_user(&db, "sess-scope-a@test.local").await.unwrap();
        let user_b = create_user(&db, "sess-scope-b@test.local").await.unwrap();
        let token_a = create_session_token(&db, user_a).await.unwrap();
        let token_b = create_session_token(&db, user_b).await.unwrap();

        let app = test::init_service(build_app(db.clone())).await;
        let req = test::TestRequest::get()
            .uri(&format!("/api/v1/users/me/sessions/{token_b}"))
            .insert_header(("Authorization", format!("Bearer {token_a}")))
            .to_request();
        let resp = test::call_service(&app, req).await;
        assert_eq!(resp.status(), StatusCode::NOT_FOUND);
    }

    /// BLC-SESS-005: non-admin GET /users/{other}/sessions returns 403.
    #[actix_web::test]
    async fn blc_sess_005_non_admin_get_other_sessions_returns_403() {
        let db = test_db().await.unwrap();
        let user = create_user(&db, "nonadmin-gs@test.local").await.unwrap();
        let other = create_user(&db, "nonadmin-gs-other@test.local")
            .await
            .unwrap();
        let token = create_session_token(&db, user).await.unwrap();

        let app = test::init_service(build_app(db.clone())).await;
        let req = test::TestRequest::get()
            .uri(&format!("/api/v1/users/{}/sessions", other.id))
            .insert_header(("Authorization", format!("Bearer {token}")));
        assert_eq!(call_status!(app, req), StatusCode::FORBIDDEN);
    }

    /// BLC-SESS-005: non-admin POST /users/{other}/sessions returns 403.
    #[actix_web::test]
    async fn blc_sess_005_non_admin_create_other_session_returns_403() {
        let db = test_db().await.unwrap();
        let user = create_user(&db, "nonadmin-cs@test.local").await.unwrap();
        let other = create_user(&db, "nonadmin-cs-other@test.local")
            .await
            .unwrap();
        let token = create_session_token(&db, user).await.unwrap();

        let app = test::init_service(build_app(db.clone())).await;
        let req = test::TestRequest::post()
            .uri(&format!("/api/v1/users/{}/sessions", other.id))
            .insert_header(("Authorization", format!("Bearer {token}")));
        assert_eq!(call_status!(app, req), StatusCode::FORBIDDEN);
    }

    /// BLC-SESS-006: admin GET /users/{other}/sessions returns 200.
    #[actix_web::test]
    async fn blc_sess_006_admin_get_other_sessions_returns_200() {
        let db = test_db().await.unwrap();
        let (_, admin_token) = make_admin(&db, "admin-gs@test.local").await;
        let other = create_user(&db, "admin-gs-other@test.local").await.unwrap();

        let app = test::init_service(build_app(db.clone())).await;
        let req = test::TestRequest::get()
            .uri(&format!("/api/v1/users/{}/sessions", other.id))
            .insert_header(("Authorization", format!("Bearer {admin_token}")))
            .to_request();
        let resp = test::call_service(&app, req).await;
        assert_eq!(resp.status(), StatusCode::OK);
    }

    /// BLC-SESS-006: admin POST /users/{user_id}/sessions returns 201.
    #[actix_web::test]
    async fn blc_sess_006_admin_create_session_for_user_returns_201() {
        let db = test_db().await.unwrap();
        let (_, admin_token) = make_admin(&db, "admin-cs@test.local").await;
        let other = create_user(&db, "admin-cs-other@test.local").await.unwrap();

        let app = test::init_service(build_app(db.clone())).await;
        let req = test::TestRequest::post()
            .uri(&format!("/api/v1/users/{}/sessions", other.id))
            .insert_header(("Authorization", format!("Bearer {admin_token}")))
            .to_request();
        let resp = test::call_service(&app, req).await;
        assert_eq!(resp.status(), StatusCode::CREATED);
    }

    /// BLC-SESS-006: admin DELETE /users/{user_id}/sessions/{id} returns 204.
    #[actix_web::test]
    async fn blc_sess_006_admin_delete_other_session_returns_204() {
        let db = test_db().await.unwrap();
        let (_, admin_token) = make_admin(&db, "admin-ds@test.local").await;
        let other = create_user(&db, "admin-ds-other@test.local").await.unwrap();
        let other_token = create_session_token(&db, other.clone()).await.unwrap();

        let app = test::init_service(build_app(db.clone())).await;
        let req = test::TestRequest::delete()
            .uri(&format!(
                "/api/v1/users/{}/sessions/{}",
                other.id, other_token
            ))
            .insert_header(("Authorization", format!("Bearer {admin_token}")))
            .to_request();
        let resp = test::call_service(&app, req).await;
        assert_eq!(resp.status(), StatusCode::NO_CONTENT);
    }

    /// BLC-SESS-009: deleted session token on an authenticated route returns 401.
    #[actix_web::test]
    async fn blc_sess_009_deleted_session_token_returns_401() {
        let db = test_db().await.unwrap();
        let user = create_user(&db, "sess-del@test.local").await.unwrap();
        let token = create_session_token(&db, user).await.unwrap();

        session_service(&db).delete_session(&token).await.unwrap();

        let app = test::init_service(build_app(db.clone())).await;
        let req = test::TestRequest::get()
            .uri("/api/v1/songs")
            .insert_header(("Authorization", format!("Bearer {token}")));
        assert_eq!(call_status!(app, req), StatusCode::UNAUTHORIZED);
    }
}

// ─── Slice 4G: list pagination HTTP validation ───────────────────────────────

#[cfg(test)]
mod list_pagination {
    use super::*;
    use actix_web::http::StatusCode;

    async fn authed_user_and_token(db: &Arc<Database>, email: &str) -> (User, String) {
        let user = create_user(db, email).await.unwrap();
        let token = create_session_token(db, user.clone()).await.unwrap();
        (user, token)
    }

    /// BLC-LP-004: non-integer `page` query param returns 400.
    #[actix_web::test]
    async fn blc_lp_004_non_integer_page_returns_400() {
        let db = test_db().await.unwrap();
        let (_, token) = authed_user_and_token(&db, "lp004a@test.local").await;
        let app = test::init_service(build_app(db.clone())).await;
        let req = test::TestRequest::get()
            .uri("/api/v1/songs?page=abc")
            .insert_header(("Authorization", format!("Bearer {token}")))
            .to_request();
        let resp = test::call_service(&app, req).await;
        assert_eq!(resp.status(), StatusCode::BAD_REQUEST);
    }

    /// BLC-LP-004: non-integer `page_size` returns 400.
    #[actix_web::test]
    async fn blc_lp_004_non_integer_page_size_returns_400() {
        let db = test_db().await.unwrap();
        let (_, token) = authed_user_and_token(&db, "lp004b@test.local").await;
        let app = test::init_service(build_app(db.clone())).await;
        let req = test::TestRequest::get()
            .uri("/api/v1/songs?page_size=1.5")
            .insert_header(("Authorization", format!("Bearer {token}")))
            .to_request();
        let resp = test::call_service(&app, req).await;
        assert_eq!(resp.status(), StatusCode::BAD_REQUEST);
    }

    /// BLC-LP-004: valid integer page and page_size returns 200.
    #[actix_web::test]
    async fn blc_lp_004_valid_page_and_page_size_returns_200() {
        let db = test_db().await.unwrap();
        let (_, token) = authed_user_and_token(&db, "lp004c@test.local").await;
        let app = test::init_service(build_app(db.clone())).await;
        let req = test::TestRequest::get()
            .uri("/api/v1/songs?page=0&page_size=10")
            .insert_header(("Authorization", format!("Bearer {token}")))
            .to_request();
        let resp = test::call_service(&app, req).await;
        assert_eq!(resp.status(), StatusCode::OK);
    }

    /// BLC-LP-005: whitespace-only `q` treated same as absent (same result count as no q).
    #[actix_web::test]
    async fn blc_lp_005_whitespace_q_treated_as_absent() {
        let db = test_db().await.unwrap();
        let (user, token) = authed_user_and_token(&db, "lp005a@test.local").await;
        create_song_with_title(&db, &user, "Whitespace Test Song")
            .await
            .unwrap();

        let app = test::init_service(build_app(db.clone())).await;

        let no_q = test::TestRequest::get()
            .uri("/api/v1/songs")
            .insert_header(("Authorization", format!("Bearer {token}")))
            .to_request();
        let no_q_resp: serde_json::Value = test::call_and_read_body_json(&app, no_q).await;

        let ws_q = test::TestRequest::get()
            .uri("/api/v1/songs?q=%20%20")
            .insert_header(("Authorization", format!("Bearer {token}")))
            .to_request();
        let ws_q_resp: serde_json::Value = test::call_and_read_body_json(&app, ws_q).await;

        assert_eq!(
            no_q_resp.as_array().expect("array").len(),
            ws_q_resp.as_array().expect("array").len(),
            "whitespace q should return same count as no q"
        );
    }

    /// BLC-LP-005: empty `q` treated same as absent.
    #[actix_web::test]
    async fn blc_lp_005_empty_q_treated_as_absent() {
        let db = test_db().await.unwrap();
        let (user, token) = authed_user_and_token(&db, "lp005b@test.local").await;
        create_song_with_title(&db, &user, "Empty Q Song")
            .await
            .unwrap();

        let app = test::init_service(build_app(db.clone())).await;

        let no_q = test::TestRequest::get()
            .uri("/api/v1/songs")
            .insert_header(("Authorization", format!("Bearer {token}")))
            .to_request();
        let no_q_resp: serde_json::Value = test::call_and_read_body_json(&app, no_q).await;

        let empty_q = test::TestRequest::get()
            .uri("/api/v1/songs?q=")
            .insert_header(("Authorization", format!("Bearer {token}")))
            .to_request();
        let empty_q_resp: serde_json::Value = test::call_and_read_body_json(&app, empty_q).await;

        assert_eq!(
            no_q_resp.as_array().unwrap().len(),
            empty_q_resp.as_array().unwrap().len()
        );
    }

    /// page_size=0 is now rejected with 400 (BLC-LP-004a).
    #[actix_web::test]
    async fn blc_lp_006_page_size_zero_returns_400() {
        let db = test_db().await.unwrap();
        let (_, token) = authed_user_and_token(&db, "lp006@test.local").await;
        let app = test::init_service(build_app(db.clone())).await;
        let req = test::TestRequest::get()
            .uri("/api/v1/songs?page_size=0")
            .insert_header(("Authorization", format!("Bearer {token}")))
            .to_request();
        let resp = test::call_service(&app, req).await;
        assert_eq!(resp.status(), StatusCode::BAD_REQUEST);
        let body: serde_json::Value = test::read_body_json(resp).await;
        assert_eq!(body["code"], "invalid_page_size");
    }

    /// BLC-LP-004b: page_size over 500 returns 400 with `invalid_page_size`.
    #[actix_web::test]
    async fn blc_lp_004b_page_size_over_max_returns_400_invalid_page_size() {
        let db = test_db().await.unwrap();
        let (_, token) = authed_user_and_token(&db, "lp004b@test.local").await;
        let app = test::init_service(build_app(db.clone())).await;
        let req = test::TestRequest::get()
            .uri("/api/v1/songs?page_size=501")
            .insert_header(("Authorization", format!("Bearer {token}")))
            .to_request();
        let resp = test::call_service(&app, req).await;
        assert_eq!(resp.status(), StatusCode::BAD_REQUEST);
        let body: serde_json::Value = test::read_body_json(resp).await;
        assert_eq!(body["code"], "invalid_page_size");
    }

    /// BLC-LP-007: only `page` supplied (no page_size) returns 200.
    #[actix_web::test]
    async fn blc_lp_007_only_page_returns_200() {
        let db = test_db().await.unwrap();
        let (_, token) = authed_user_and_token(&db, "lp007a@test.local").await;
        let app = test::init_service(build_app(db.clone())).await;
        let req = test::TestRequest::get()
            .uri("/api/v1/songs?page=0")
            .insert_header(("Authorization", format!("Bearer {token}")))
            .to_request();
        let resp = test::call_service(&app, req).await;
        assert_eq!(resp.status(), StatusCode::OK);
    }

    /// BLC-LP-007: only `page_size` supplied (no page) returns 200.
    #[actix_web::test]
    async fn blc_lp_007_only_page_size_returns_200() {
        let db = test_db().await.unwrap();
        let (_, token) = authed_user_and_token(&db, "lp007b@test.local").await;
        let app = test::init_service(build_app(db.clone())).await;
        let req = test::TestRequest::get()
            .uri("/api/v1/songs?page_size=5")
            .insert_header(("Authorization", format!("Bearer {token}")))
            .to_request();
        let resp = test::call_service(&app, req).await;
        assert_eq!(resp.status(), StatusCode::OK);
    }

    /// BLC-LP-008: page beyond last returns 200 with empty array.
    #[actix_web::test]
    async fn blc_lp_008_page_beyond_last_returns_empty() {
        let db = test_db().await.unwrap();
        let (user, token) = authed_user_and_token(&db, "lp008@test.local").await;
        for i in 0..3 {
            create_song_with_title(&db, &user, &format!("LP008 Song {i}"))
                .await
                .unwrap();
        }

        let app = test::init_service(build_app(db.clone())).await;
        let req = test::TestRequest::get()
            .uri("/api/v1/songs?page=999&page_size=10")
            .insert_header(("Authorization", format!("Bearer {token}")))
            .to_request();
        let resp = test::call_service(&app, req).await;
        assert_eq!(resp.status(), StatusCode::OK);
        let body: serde_json::Value = test::read_body_json(resp).await;
        assert!(body.as_array().unwrap().is_empty());
    }

    /// BLC-LP-009: q filter applies before pagination — paginated matching subset returned.
    ///
    /// 3 songs match `q=matchtoken`; with `page_size=2&page=0` → 2 results,
    /// with `page_size=2&page=1` → 1 result.
    #[actix_web::test]
    async fn blc_lp_009_q_filter_applies_before_pagination() {
        let db = test_db().await.unwrap();
        let (user, token) = authed_user_and_token(&db, "lp009@test.local").await;

        for i in 0..3 {
            create_song_with_title(&db, &user, &format!("matchtoken LP009 Song {i}"))
                .await
                .unwrap();
        }
        for i in 0..2 {
            create_song_with_title(&db, &user, &format!("Other LP009 Song {i}"))
                .await
                .unwrap();
        }

        let app = test::init_service(build_app(db.clone())).await;

        let req = test::TestRequest::get()
            .uri("/api/v1/songs?q=matchtoken&page=0&page_size=2")
            .insert_header(("Authorization", format!("Bearer {token}")))
            .to_request();
        let resp: serde_json::Value = test::call_and_read_body_json(&app, req).await;
        assert_eq!(
            resp.as_array().unwrap().len(),
            2,
            "page 0 of 3 matching with page_size=2 should return 2"
        );

        let req2 = test::TestRequest::get()
            .uri("/api/v1/songs?q=matchtoken&page=1&page_size=2")
            .insert_header(("Authorization", format!("Bearer {token}")))
            .to_request();
        let resp2: serde_json::Value = test::call_and_read_body_json(&app, req2).await;
        assert_eq!(
            resp2.as_array().unwrap().len(),
            1,
            "page 1 of 3 matching with page_size=2 should return 1"
        );
    }

    /// BLC-LP-010: list responses include a `Link` header with pagination relations.
    #[actix_web::test]
    async fn blc_lp_010_link_header_on_songs_list() {
        use actix_web::http::header::LINK;

        let db = test_db().await.unwrap();
        let (user, token) = authed_user_and_token(&db, "lp010@test.local").await;
        for i in 0..3 {
            create_song_with_title(&db, &user, &format!("LP010 Song {i}"))
                .await
                .unwrap();
        }

        let app = test::init_service(build_app(db.clone())).await;
        let req = test::TestRequest::get()
            .uri("/api/v1/songs?page=0&page_size=1")
            .insert_header(("Authorization", format!("Bearer {token}")))
            .to_request();
        let resp = test::call_service(&app, req).await;
        assert_eq!(resp.status(), StatusCode::OK);
        let link = resp
            .headers()
            .get(LINK)
            .expect("Link header")
            .to_str()
            .unwrap();
        assert!(
            link.contains("rel=\"next\"") || link.contains("rel=next"),
            "expected rel=next in Link, got {link:?}"
        );
    }
}

#[cfg(test)]
mod monitoring_http {
    use super::*;
    use actix_web::http::StatusCode;
    use serde::Deserialize;
    use std::time::Duration;
    use surrealdb::types::{RecordId, SurrealValue};

    use shared::user::Role;

    async fn make_admin(db: &Arc<Database>, email: &str) -> (User, String) {
        let mut raw = User::new(email);
        raw.role = Role::Admin;
        let admin = crate::test_helpers::user_service(db)
            .create_user(raw)
            .await
            .unwrap();
        let token = create_session_token(db, admin.clone()).await.unwrap();
        (admin, token)
    }

    async fn wait_audit_row(db: &Arc<Database>, request_id: &str) {
        #[derive(Deserialize, SurrealValue)]
        struct CountRow {
            count: i64,
        }
        for _ in 0..100 {
            let mut r = db
                .db
                .query(
                    "SELECT count() AS count FROM http_request_audit WHERE request_id = $rid GROUP ALL",
                )
                .bind(("rid", request_id.to_string()))
                .await
                .expect("audit select");
            let counts: Vec<CountRow> = r.take(0).expect("take");
            if counts.first().map(|c| c.count).unwrap_or(0) > 0 {
                return;
            }
            tokio::time::sleep(Duration::from_millis(20)).await;
        }
        panic!("timeout waiting for http_request_audit row request_id={request_id}");
    }

    #[derive(Deserialize, SurrealValue)]
    struct AuditLinks {
        user: Option<RecordId>,
        session: Option<RecordId>,
    }

    async fn audit_links_for_request(
        db: &Arc<Database>,
        request_id: &str,
    ) -> (Option<String>, Option<String>) {
        let mut r = db
            .db
            .query("SELECT user, session FROM http_request_audit WHERE request_id = $rid LIMIT 1")
            .bind(("rid", request_id.to_string()))
            .await
            .expect("audit links");
        let row: Option<AuditLinks> = r.take(0).expect("take links");
        row.map(|x| {
            (
                x.user.as_ref().map(crate::database::record_id_string),
                x.session.as_ref().map(crate::database::record_id_string),
            )
        })
        .unwrap_or((None, None))
    }

    #[derive(Deserialize, SurrealValue)]
    struct AuditClient {
        client_origin: String,
        client_version: Option<String>,
    }

    async fn audit_client_for_request(
        db: &Arc<Database>,
        request_id: &str,
    ) -> (String, Option<String>) {
        let mut r = db
            .db
            .query(
                "SELECT client_origin, client_version FROM http_request_audit WHERE request_id = $rid LIMIT 1",
            )
            .bind(("rid", request_id.to_string()))
            .await
            .expect("audit client");
        let row: Option<AuditClient> = r.take(0).expect("take client");
        row.map(|x| (x.client_origin, x.client_version))
            .unwrap_or_else(|| ("unknown".to_string(), None))
    }

    /// `X-Worship-Client` is stored on the audit row (integration check).
    #[actix_web::test]
    async fn http_audit_persists_x_worship_client() {
        let db = test_db().await.unwrap();
        let app = test::init_service(build_app(db.clone())).await;
        let req = test::TestRequest::get()
            .uri("/api/docs/openapi.json")
            .insert_header((
                crate::client_attribution::X_WORSHIP_CLIENT,
                "worshipviewer-cli/9.8.7",
            ))
            .to_request();
        let resp = test::call_service(&app, req).await;
        assert_eq!(resp.status(), StatusCode::OK);
        let rid = resp
            .headers()
            .get("x-request-id")
            .and_then(|h| h.to_str().ok())
            .expect("x-request-id")
            .to_string();
        wait_audit_row(&db, &rid).await;
        let (origin, version) = audit_client_for_request(&db, &rid).await;
        assert_eq!(origin, "cli");
        assert_eq!(version.as_deref(), Some("9.8.7"));
    }

    /// BLC-MON-004: unauthenticated GET /monitoring/http-audit-logs returns 401.
    #[actix_web::test]
    async fn blc_mon_004_unauthenticated_returns_401() {
        let db = test_db().await.unwrap();
        let app = test::init_service(build_app(db)).await;
        let req = test::TestRequest::get().uri("/api/v1/monitoring/http-audit-logs");
        assert_eq!(call_status!(app, req), StatusCode::UNAUTHORIZED);
    }

    /// BLC-MON-004: non-admin GET /monitoring/http-audit-logs returns 403.
    #[actix_web::test]
    async fn blc_mon_004_non_admin_returns_403() {
        let db = test_db().await.unwrap();
        let user = create_user(&db, "mon-nonadmin@test.local").await.unwrap();
        let token = create_session_token(&db, user).await.unwrap();
        let app = test::init_service(build_app(db)).await;
        let req = test::TestRequest::get()
            .uri("/api/v1/monitoring/http-audit-logs")
            .insert_header(("Authorization", format!("Bearer {token}")));
        assert_eq!(call_status!(app, req), StatusCode::FORBIDDEN);
    }

    /// BLC-MON-004: admin GET /monitoring/http-audit-logs returns 200 with pagination headers.
    #[actix_web::test]
    async fn blc_mon_004_admin_lists_returns_200() {
        let db = test_db().await.unwrap();
        let (_, token) = make_admin(&db, "mon-admin-list@test.local").await;
        let app = test::init_service(build_app(db)).await;
        let req = test::TestRequest::get()
            .uri("/api/v1/monitoring/http-audit-logs")
            .insert_header(("Authorization", format!("Bearer {token}")))
            .to_request();
        let resp = test::call_service(&app, req).await;
        assert_eq!(resp.status(), StatusCode::OK);
        assert!(resp.headers().get("x-total-count").is_some());
        let body: serde_json::Value = test::read_body_json(resp).await;
        assert!(body.is_array());
    }

    /// BLC-MON-002: authenticated API request stores user and session links on the audit row.
    #[actix_web::test]
    async fn blc_mon_002_authenticated_request_populates_user_and_session() {
        let db = test_db().await.unwrap();
        let user = create_user(&db, "mon-audit-links@test.local")
            .await
            .unwrap();
        let token = create_session_token(&db, user.clone()).await.unwrap();
        let app = test::init_service(build_app(db.clone())).await;
        let req = test::TestRequest::get()
            .uri("/api/v1/users/me")
            .insert_header(("Authorization", format!("Bearer {token}")))
            .to_request();
        let resp = test::call_service(&app, req).await;
        assert_eq!(resp.status(), StatusCode::OK);
        let rid = resp
            .headers()
            .get("x-request-id")
            .and_then(|h| h.to_str().ok())
            .expect("x-request-id")
            .to_string();
        wait_audit_row(&db, &rid).await;
        let (u, s) = audit_links_for_request(&db, &rid).await;
        assert_eq!(u.as_deref(), Some(user.id.as_str()));
        assert_eq!(s.as_deref(), Some(token.as_str()));
    }

    /// BLC-MON-003: deleting a session clears `session` on existing audit rows (row kept).
    #[actix_web::test]
    async fn blc_mon_003_delete_session_clears_session_link() {
        let db = test_db().await.unwrap();
        let user = create_user(&db, "mon-sess-del@test.local").await.unwrap();
        let token = create_session_token(&db, user.clone()).await.unwrap();
        let app = test::init_service(build_app(db.clone())).await;
        let req = test::TestRequest::get()
            .uri("/api/v1/users/me")
            .insert_header(("Authorization", format!("Bearer {token}")))
            .to_request();
        let resp = test::call_service(&app, req).await;
        let rid = resp
            .headers()
            .get("x-request-id")
            .and_then(|h| h.to_str().ok())
            .expect("x-request-id")
            .to_string();
        wait_audit_row(&db, &rid).await;

        let del = test::TestRequest::delete()
            .uri(&format!("/api/v1/users/me/sessions/{}", token))
            .insert_header(("Authorization", format!("Bearer {token}")))
            .to_request();
        let del_resp = test::call_service(&app, del).await;
        assert_eq!(del_resp.status(), StatusCode::NO_CONTENT);

        let (u, s) = audit_links_for_request(&db, &rid).await;
        assert_eq!(u.as_deref(), Some(user.id.as_str()));
        assert!(
            s.is_none(),
            "session link should clear after session delete"
        );
    }

    /// BLC-MON-003: deleting a user clears `user` (and session) on existing audit rows (row kept).
    #[actix_web::test]
    async fn blc_mon_003_delete_user_clears_user_and_session_links() {
        let db = test_db().await.unwrap();
        let target = create_user(&db, "mon-user-del@test.local").await.unwrap();
        let target_token = create_session_token(&db, target.clone()).await.unwrap();
        let app = test::init_service(build_app(db.clone())).await;
        let req = test::TestRequest::get()
            .uri("/api/v1/users/me")
            .insert_header(("Authorization", format!("Bearer {target_token}")))
            .to_request();
        let resp = test::call_service(&app, req).await;
        let rid = resp
            .headers()
            .get("x-request-id")
            .and_then(|h| h.to_str().ok())
            .expect("x-request-id")
            .to_string();
        wait_audit_row(&db, &rid).await;

        let (_, admin_token) = make_admin(&db, "mon-admin-del@test.local").await;
        let del = test::TestRequest::delete()
            .uri(&format!("/api/v1/users/{}", target.id))
            .insert_header(("Authorization", format!("Bearer {admin_token}")))
            .to_request();
        let del_resp = test::call_service(&app, del).await;
        assert_eq!(del_resp.status(), StatusCode::NO_CONTENT);

        let (u, s) = audit_links_for_request(&db, &rid).await;
        assert!(
            u.is_none() && s.is_none(),
            "user/session links cleared after user delete"
        );
    }

    /// GET /monitoring/metrics: non-admin receives 403.
    #[actix_web::test]
    async fn monitoring_metrics_non_admin_403() {
        let db = test_db().await.unwrap();
        let user = create_user(&db, "mon-metrics-nonadmin@test.local")
            .await
            .unwrap();
        let token = create_session_token(&db, user).await.unwrap();
        let app = test::init_service(build_app(db)).await;
        let req = test::TestRequest::get()
            .uri("/api/v1/monitoring/metrics?start=2026-04-01T00:00:00Z&end=2026-04-02T00:00:00Z")
            .insert_header(("Authorization", format!("Bearer {token}")));
        assert_eq!(call_status!(app, req), StatusCode::FORBIDDEN);
    }

    /// GET /monitoring/metrics: invalid window returns 400.
    #[actix_web::test]
    async fn monitoring_metrics_invalid_window_400() {
        let db = test_db().await.unwrap();
        let (_, token) = make_admin(&db, "mon-metrics-badwin@test.local").await;
        let app = test::init_service(build_app(db)).await;
        let req = test::TestRequest::get()
            .uri("/api/v1/monitoring/metrics?start=2026-04-02T00:00:00Z&end=2026-04-01T00:00:00Z")
            .insert_header(("Authorization", format!("Bearer {token}")));
        assert_eq!(call_status!(app, req), StatusCode::BAD_REQUEST);
    }

    /// GET /monitoring/metrics: admin receives aggregated counts for seeded audit rows.
    #[actix_web::test]
    async fn monitoring_metrics_admin_seeded_audit() {
        let db = test_db().await.unwrap();
        for (rid, path, status) in [
            ("seed-met-1", "/api/v1/songs", 200i64),
            ("seed-met-2", "/auth/callback", 200),
            (
                "seed-met-3",
                "/api/v1/songs/550e8400-e29b-41d4-a716-446655440404",
                404,
            ),
            ("seed-met-4", "/api/v1/users", 500),
        ] {
            let r = db
                .db
                .query(
                    "CREATE http_request_audit SET request_id = $rid, method = 'GET', path = $path, \
                     status_code = $status, duration_ms = 10, user = NONE, session = NONE, \
                     client_origin = 'unknown', client_version = NONE, \
                     created_at = d'2026-04-01T12:00:00Z'",
                )
                .bind(("rid", rid.to_string()))
                .bind(("path", path.to_string()))
                .bind(("status", status))
                .await
                .expect("seed audit");
            r.check().expect("seed audit statement ok");
        }

        let (_, token) = make_admin(&db, "mon-metrics-seed@test.local").await;
        let app = test::init_service(build_app(db)).await;
        let req = test::TestRequest::get()
            .uri("/api/v1/monitoring/metrics?start=2026-04-01T00:00:00Z&end=2026-04-02T00:00:00Z")
            .insert_header(("Authorization", format!("Bearer {token}")))
            .to_request();
        let resp = test::call_service(&app, req).await;
        assert_eq!(resp.status(), StatusCode::OK);
        let body: serde_json::Value = test::read_body_json(resp).await;
        assert!(
            body["window"]["total_requests"].as_u64().unwrap() >= 4,
            "expected at least the four seeded rows in total_requests (plus optional handler audit row): {body:?}"
        );
        assert!(
            body["reliability"]["error_count_all"].as_u64().unwrap() >= 2,
            "expected seeded 404 and 500 to count as errors: {body:?}"
        );
        assert!(
            body["probing"]["id_like_404_count"].as_u64().unwrap() >= 1,
            "expected uuid-shaped 404 to count as id-like: {body:?}"
        );
    }
}

#[cfg(test)]
mod song_patch_http {
    use super::*;
    use actix_web::http::StatusCode;

    /// PATCH with only `not_a_song` (no `data`) is accepted; song data is unchanged.
    #[actix_web::test]
    async fn patch_song_not_a_song_only_without_data_is_200() {
        let db = test_db().await.unwrap();
        let user = create_user(&db, "patch-song-http@test.local")
            .await
            .unwrap();
        let token = create_session_token(&db, user.clone()).await.unwrap();
        let song = create_song_with_title(&db, &user, "PatchOnlyTitle")
            .await
            .unwrap();
        assert!(!song.not_a_song);
        let orig_title = song.data.title().to_string();

        let app = test::init_service(build_app(db.clone())).await;
        let req = test::TestRequest::patch()
            .uri(&format!("/api/v1/songs/{}", song.id))
            .insert_header(("Authorization", format!("Bearer {token}")))
            .insert_header(("Content-Type", "application/json"))
            .set_payload(r#"{"not_a_song":true}"#)
            .to_request();
        let resp = test::call_service(&app, req).await;
        assert_eq!(resp.status(), StatusCode::OK);
        let body: serde_json::Value = test::read_body_json(resp).await;
        assert_eq!(body["not_a_song"], true);
        assert_eq!(
            body["data"]["titles"][0].as_str().unwrap(),
            orig_title.as_str()
        );
    }

    /// POST → GET → PATCH → GET preserves `data` fields (Phase 2 `SongData` contract).
    #[actix_web::test]
    async fn song_data_round_trips_through_post_get_patch_get() {
        let db = test_db().await.unwrap();
        let user = create_user(&db, "song-rt-phase2@test.local").await.unwrap();
        let collection_id = crate::test_helpers::ensure_test_collection(&db, &user)
            .await
            .unwrap();
        let token = create_session_token(&db, user.clone()).await.unwrap();

        let app = test::init_service(build_app(db.clone())).await;

        let create_json = format!(
            r#"{{
            "collection": "{collection_id}",
            "not_a_song": false,
            "blobs": [],
            "data": {{
                "titles": ["RoundTrip"],
                "subtitle": "sub",
                "sections": [],
                "tags": {{"hymn_type": "common"}}
            }}
        }}"#
        );

        let post = test::TestRequest::post()
            .uri("/api/v1/songs")
            .insert_header(("Authorization", format!("Bearer {token}")))
            .insert_header(("Content-Type", "application/json"))
            .set_payload(create_json)
            .to_request();
        let resp = test::call_service(&app, post).await;
        assert_eq!(resp.status(), StatusCode::CREATED);
        let created: serde_json::Value = test::read_body_json(resp).await;
        let id = created["id"].as_str().unwrap();

        let get1 = test::TestRequest::get()
            .uri(&format!("/api/v1/songs/{id}"))
            .insert_header(("Authorization", format!("Bearer {token}")))
            .to_request();
        let resp = test::call_service(&app, get1).await;
        assert_eq!(resp.status(), StatusCode::OK);
        let g1: serde_json::Value = test::read_body_json(resp).await;
        assert_eq!(g1["data"]["titles"][0], "RoundTrip");
        assert_eq!(g1["data"]["subtitle"], "sub");
        assert_eq!(g1["data"]["tags"]["hymn_type"], "common");

        let patch = test::TestRequest::patch()
            .uri(&format!("/api/v1/songs/{id}"))
            .insert_header(("Authorization", format!("Bearer {token}")))
            .insert_header(("Content-Type", "application/json"))
            .set_payload(r#"{"data":{"titles":["RoundTrip","Second"]}}"#)
            .to_request();
        let resp = test::call_service(&app, patch).await;
        assert_eq!(resp.status(), StatusCode::OK);

        let get2 = test::TestRequest::get()
            .uri(&format!("/api/v1/songs/{id}"))
            .insert_header(("Authorization", format!("Bearer {token}")))
            .to_request();
        let resp = test::call_service(&app, get2).await;
        assert_eq!(resp.status(), StatusCode::OK);
        let g2: serde_json::Value = test::read_body_json(resp).await;
        assert_eq!(g2["data"]["titles"][0], "RoundTrip");
        assert_eq!(g2["data"]["titles"][1], "Second");
        assert_eq!(g2["data"]["subtitle"], "sub");
        assert_eq!(g2["data"]["tags"]["hymn_type"], "common");
    }
}

#[cfg(test)]
mod song_acl_http {
    use super::*;
    use crate::resources::User;
    use crate::test_helpers::user_service;
    use actix_web::http::{StatusCode, header::LOCATION};
    use shared::user::Role;

    /// BLC-SONG-002: platform admin cannot **PUT** another user's song without library edit (**404**).
    #[actix_web::test]
    async fn blc_song_002_platform_admin_put_other_users_song_returns_404() {
        let db = test_db().await.unwrap();
        let owner = create_user(&db, "song-owner-pa@test.local").await.unwrap();
        let song = create_song_with_title(&db, &owner, "ProtectedTitle")
            .await
            .unwrap();

        let mut admin_raw = User::new("platform-admin-song@test.local");
        admin_raw.role = Role::Admin;
        let admin = user_service(&db).create_user(admin_raw).await.unwrap();
        let admin_token = create_session_token(&db, admin).await.unwrap();

        let app = test::init_service(build_app(db.clone())).await;
        let payload = r#"{
            "not_a_song": false,
            "blobs": [],
            "data": { "titles": ["Hacked"], "sections": [] }
        }"#;
        let req = test::TestRequest::put()
            .uri(&format!("/api/v1/songs/{}", song.id))
            .insert_header(("Authorization", format!("Bearer {admin_token}")))
            .insert_header(("Content-Type", "application/json"))
            .set_payload(payload)
            .to_request();
        let resp = test::call_service(&app, req).await;
        assert_eq!(resp.status(), StatusCode::NOT_FOUND);
    }

    /// BLC-SONG-018: **PUT** with a previously unused id returns **201** and **`Location`**.
    #[actix_web::test]
    async fn blc_song_018_put_upsert_new_id_returns_201_with_location() {
        let db = test_db().await.unwrap();
        let user = create_user(&db, "song-upsert-http@test.local")
            .await
            .unwrap();
        let token = create_session_token(&db, user).await.unwrap();
        let app = test::init_service(build_app(db)).await;
        let new_id = "http-upsert-new-song-id";
        let payload = r#"{
            "not_a_song": false,
            "blobs": [],
            "data": { "titles": ["Upsert Via PUT"], "sections": [] }
        }"#;
        let req = test::TestRequest::put()
            .uri(&format!("/api/v1/songs/{new_id}"))
            .insert_header(("Authorization", format!("Bearer {token}")))
            .insert_header(("Content-Type", "application/json"))
            .set_payload(payload)
            .to_request();
        let resp = test::call_service(&app, req).await;
        assert_eq!(resp.status(), StatusCode::CREATED);
        let loc = resp.headers().get(LOCATION).unwrap().to_str().unwrap();
        assert!(loc.ends_with(&format!("/api/v1/songs/{new_id}")));
    }
}

#[cfg(test)]
mod blob_create_http {
    use super::*;
    use actix_web::http::StatusCode;

    /// BLC-BLOB-005: unsupported **`file_type`** on create returns **400**.
    #[actix_web::test]
    async fn blc_blob_005_unsupported_file_type_returns_400() {
        let db = test_db().await.unwrap();
        let user = create_user(&db, "blob-bad-ft@test.local").await.unwrap();
        let token = create_session_token(&db, user).await.unwrap();
        let app = test::init_service(build_app(db)).await;
        let req = test::TestRequest::post()
            .uri("/api/v1/blobs")
            .insert_header(("Authorization", format!("Bearer {token}")))
            .insert_header(("Content-Type", "application/json"))
            .set_payload(r#"{"file_type":"application/pdf","width":1,"height":1,"ocr":""}"#)
            .to_request();
        let resp = test::call_service(&app, req).await;
        assert_eq!(resp.status(), StatusCode::BAD_REQUEST);
    }
}

#[cfg(test)]
mod collection_cover_http {
    use super::*;
    use actix_web::http::StatusCode;

    #[actix_web::test]
    async fn put_collection_cover_route_returns_200() {
        let db = test_db().await.unwrap();
        let user = create_user(&db, "cover-route@test.local").await.unwrap();
        let token = create_session_token(&db, user).await.unwrap();
        let app = test::init_service(build_app(db.clone())).await;

        let req = test::TestRequest::post()
            .uri("/api/v1/collections")
            .insert_header(("Authorization", format!("Bearer {token}")))
            .set_json(&serde_json::json!({
                "title": "Cover test",
                "cover": "",
                "songs": []
            }))
            .to_request();
        let resp = test::call_service(&app, req).await;
        assert_eq!(resp.status(), StatusCode::CREATED);
        let body: serde_json::Value = serde_json::from_slice(&test::read_body(resp).await).unwrap();
        let col_id = body["id"].as_str().expect("collection id");

        let jpeg = crate::test_helpers::sample_cover_jpeg_bytes();

        let req = test::TestRequest::put()
            .uri(&format!("/api/v1/collections/{col_id}/cover"))
            .insert_header(("Authorization", format!("Bearer {token}")))
            .insert_header(("Content-Type", "image/jpeg"))
            .set_payload(jpeg)
            .to_request();
        let resp = test::call_service(&app, req).await;
        assert_eq!(
            resp.status(),
            StatusCode::OK,
            "PUT /collections/{{id}}/cover should be registered"
        );
        let body: serde_json::Value = serde_json::from_slice(&test::read_body(resp).await).unwrap();
        let cover_id = body["cover"].as_str().expect("cover id");
        assert!(!cover_id.is_empty());

        let req = test::TestRequest::get()
            .uri(&format!("/api/v1/blobs/{cover_id}/data"))
            .insert_header(("Authorization", format!("Bearer {token}")))
            .to_request();
        let resp = test::call_service(&app, req).await;
        assert_eq!(resp.status(), StatusCode::OK);
        let bytes = test::read_body(resp).await;
        assert!(
            bytes.len() > 100,
            "blob data should contain image bytes, got {}",
            bytes.len()
        );
    }
}

mod spa_fallback_guard {
    use actix_web::http::StatusCode;
    use actix_web::{App, ResponseError, test};

    use crate::error::AppError;
    use crate::frontend;

    #[actix_web::test]
    async fn unknown_path_under_api_or_auth_returns_problem_json() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("index.html"), "<html>spa</html>").unwrap();
        let static_path = dir.path().to_string_lossy().into_owned();
        let app = test::init_service(App::new().service(frontend::rest::scope(&static_path))).await;

        for uri in [
            "/api/v1/definitely/not/a/route",
            "/api/v2/foo",
            "/auth/not-a-real-endpoint",
        ] {
            let req = test::TestRequest::get().uri(uri).to_request();
            let resp = test::call_service(&app, req).await;
            assert_eq!(resp.status(), StatusCode::NOT_FOUND, "uri={uri}");
            let ct = resp
                .headers()
                .get("content-type")
                .and_then(|h| h.to_str().ok())
                .unwrap_or("");
            assert!(
                ct.contains("application/problem+json"),
                "expected problem+json, got {ct} for {uri}"
            );
            let body = test::read_body(resp).await;
            let s = String::from_utf8_lossy(&body);
            assert!(
                !s.contains("<html"),
                "should not return SPA shell for {uri}"
            );
        }
    }

    #[actix_web::test]
    async fn spa_route_still_serves_index_html() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("index.html"), "<html>spa</html>").unwrap();
        let static_path = dir.path().to_string_lossy().into_owned();
        let app = test::init_service(App::new().service(frontend::rest::scope(&static_path))).await;

        let req = test::TestRequest::get().uri("/app/deep/link").to_request();
        let resp = test::call_service(&app, req).await;
        assert_eq!(resp.status(), StatusCode::OK);
        let body = test::read_body(resp).await;
        assert!(String::from_utf8_lossy(&body).contains("spa"));
    }

    #[actix_web::test]
    async fn not_found_body_is_problem_details_shape() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("index.html"), "<html/>").unwrap();
        let static_path = dir.path().to_string_lossy().into_owned();
        let app = test::init_service(App::new().service(frontend::rest::scope(&static_path))).await;
        let req = test::TestRequest::get().uri("/api/missing").to_request();
        let resp = test::call_service(&app, req).await;
        let expected = AppError::NotFound("not found".into()).error_response();
        assert_eq!(resp.status(), expected.status());
    }
}
