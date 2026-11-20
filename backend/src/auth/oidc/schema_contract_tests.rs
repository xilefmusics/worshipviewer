//! SCHEMAFULL contract tests: serde content written by OIDC state helpers must match Surreal schema.

use chrono::{Duration as ChronoDuration, Utc};
use openidconnect::Nonce;
use openidconnect::PkceCodeChallenge;

use super::{
    Model as OidcModel, NativeLoginHandoff, OidcProvider, PendingNativeLogin, PendingOidc,
};
use crate::test_helpers::test_db;

#[tokio::test]
async fn oidc_state_remember_and_take_round_trip() {
    let db = test_db().await.expect("test db");

    let (_, verifier) = PkceCodeChallenge::new_random_sha256();
    let now = Utc::now();
    let pending = PendingOidc {
        pkce_verifier: verifier,
        nonce: Nonce::new_random(),
        redirect_to: Some("/after-login".into()),
        native_login: Some(PendingNativeLogin {
            state: "native-state".into(),
            code_challenge: "native-challenge".into(),
        }),
        created_at: now,
        expires_at: now + ChronoDuration::seconds(600),
        provider: OidcProvider::Google,
    };
    let key = "contract-test-csrf";

    OidcModel::remember_oidc_state(db.as_ref(), key, pending)
        .await
        .expect("remember_oidc_state should accept all OidcStateRecord fields under SCHEMAFULL");

    let taken = OidcModel::take_oidc_state(db.as_ref(), key)
        .await
        .expect("take_oidc_state");
    let Some(out) = taken else {
        panic!("expected stored oidc_state");
    };

    assert_eq!(out.provider, OidcProvider::Google);
    assert_eq!(out.redirect_to.as_deref(), Some("/after-login"));
    assert_eq!(
        out.native_login,
        Some(PendingNativeLogin {
            state: "native-state".into(),
            code_challenge: "native-challenge".into(),
        })
    );
}

#[tokio::test]
async fn native_handoff_is_hashed_bound_to_state_and_pkce_and_single_use() {
    let db = test_db().await.expect("test db");
    let now = Utc::now();
    let code = "one-time-code";
    let handoff = NativeLoginHandoff {
        session_id: "session-1".into(),
        state: "state-1".into(),
        code_challenge: "challenge-1".into(),
        created_at: now,
        expires_at: now + ChronoDuration::seconds(120),
    };

    OidcModel::remember_native_handoff(db.as_ref(), code, handoff.clone())
        .await
        .expect("remember native handoff");

    assert!(
        OidcModel::take_native_handoff(db.as_ref(), code, "wrong-state", "challenge-1")
            .await
            .expect("wrong state does not consume")
            .is_none()
    );
    assert!(
        OidcModel::take_native_handoff(db.as_ref(), code, "state-1", "wrong-challenge")
            .await
            .expect("wrong challenge does not consume")
            .is_none()
    );
    let taken = OidcModel::take_native_handoff(db.as_ref(), code, "state-1", "challenge-1")
        .await
        .expect("take native handoff")
        .expect("matching handoff");
    assert_eq!(taken.session_id, handoff.session_id);
    assert_eq!(taken.state, handoff.state);
    assert_eq!(taken.code_challenge, handoff.code_challenge);
    assert_eq!(taken.expires_at, handoff.expires_at);
    assert!(taken.created_at >= now - ChronoDuration::seconds(1));
    assert!(taken.created_at <= Utc::now() + ChronoDuration::seconds(1));
    assert!(
        OidcModel::take_native_handoff(db.as_ref(), code, "state-1", "challenge-1")
            .await
            .expect("handoff replay")
            .is_none()
    );
}

#[tokio::test]
async fn native_handoff_expiry_is_enforced() {
    let db = test_db().await.expect("test db");
    let now = Utc::now();
    let code = "expired-code";
    OidcModel::remember_native_handoff(
        db.as_ref(),
        code,
        NativeLoginHandoff {
            session_id: "session-1".into(),
            state: "state-1".into(),
            code_challenge: "challenge-1".into(),
            created_at: now - ChronoDuration::seconds(121),
            expires_at: now - ChronoDuration::seconds(1),
        },
    )
    .await
    .expect("remember expired native handoff");

    assert!(
        OidcModel::take_native_handoff(db.as_ref(), code, "state-1", "challenge-1")
            .await
            .expect("take expired handoff")
            .is_none()
    );
}
