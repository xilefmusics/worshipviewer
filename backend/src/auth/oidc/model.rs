use std::str::FromStr;

use chrono::{DateTime, Utc};
use openidconnect::Nonce;
use openidconnect::PkceCodeVerifier;
use serde::{Deserialize, Serialize};
use surrealdb::types::{Datetime, RecordId, SurrealValue};

use crate::database::Database;
use crate::error::AppError;

use super::OidcProvider;

#[derive(Debug)]
pub struct PendingOidc {
    pub pkce_verifier: PkceCodeVerifier,
    pub nonce: Nonce,
    pub redirect_to: Option<String>,
    pub native_login: Option<PendingNativeLogin>,
    pub created_at: DateTime<Utc>,
    pub expires_at: DateTime<Utc>,
    pub provider: OidcProvider,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PendingNativeLogin {
    pub state: String,
    pub code_challenge: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NativeLoginHandoff {
    pub session_id: String,
    pub state: String,
    pub code_challenge: String,
    pub created_at: DateTime<Utc>,
    pub expires_at: DateTime<Utc>,
}

pub trait Model {
    async fn remember_oidc_state(&self, key: &str, value: PendingOidc) -> Result<(), AppError>;
    async fn take_oidc_state(&self, key: &str) -> Result<Option<PendingOidc>, AppError>;
    async fn cleanup_expired_oidc_states(&self) -> Result<(), AppError>;
    async fn remember_native_handoff(
        &self,
        code: &str,
        value: NativeLoginHandoff,
    ) -> Result<(), AppError>;
    async fn take_native_handoff(
        &self,
        code: &str,
        state: &str,
        code_challenge: &str,
    ) -> Result<Option<NativeLoginHandoff>, AppError>;
}

impl Model for Database {
    async fn remember_oidc_state(&self, key: &str, value: PendingOidc) -> Result<(), AppError> {
        let record = OidcStateRecord::new(value);

        let _: Option<OidcStateRecord> = self
            .db
            .create(("oidc_state", key))
            .content(record)
            .await
            .map_err(|e| crate::log_and_convert!(AppError::database, "oidc_state.create", e))?;

        Ok(())
    }

    async fn take_oidc_state(&self, key: &str) -> Result<Option<PendingOidc>, AppError> {
        let record: Option<OidcStateRecord> = self
            .db
            .select(("oidc_state", key))
            .await
            .map_err(|e| crate::log_and_convert!(AppError::database, "oidc_state.select", e))?;

        let Some(record) = record else {
            return Ok(None);
        };

        let _: Option<OidcStateRecord> = self
            .db
            .delete(("oidc_state", key))
            .await
            .map_err(|e| crate::log_and_convert!(AppError::database, "oidc_state.delete", e))?;

        let pending = record.into_pending();
        if pending.expires_at <= Utc::now() {
            return Ok(None);
        }

        Ok(Some(pending))
    }

    async fn cleanup_expired_oidc_states(&self) -> Result<(), AppError> {
        self.db
            .query("DELETE oidc_state WHERE expires_at <= time::now()")
            .await
            .map_err(|e| crate::log_and_convert!(AppError::database, "oidc_state.cleanup", e))?;
        Ok(())
    }

    async fn remember_native_handoff(
        &self,
        code: &str,
        value: NativeLoginHandoff,
    ) -> Result<(), AppError> {
        let record = NativeLoginHandoffRecord::new(value);
        let code_hash = hash_handoff_code(code);
        self.db
            .query(
                "DELETE native_oidc_handoff WHERE expires_at <= time::now();\
                 CREATE type::record('native_oidc_handoff', $code_hash) CONTENT $record;",
            )
            .bind(("code_hash", code_hash))
            .bind(("record", record))
            .await
            .map_err(|e| crate::log_and_convert!(AppError::database, "native_handoff.create", e))?;
        Ok(())
    }

    async fn take_native_handoff(
        &self,
        code: &str,
        state: &str,
        code_challenge: &str,
    ) -> Result<Option<NativeLoginHandoff>, AppError> {
        let code_hash = hash_handoff_code(code);
        let mut response = self
            .db
            .query(
                "DELETE type::record('native_oidc_handoff', $code_hash) \
                 WHERE state = $state AND code_challenge = $code_challenge \
                   AND expires_at > time::now() RETURN BEFORE;",
            )
            .bind(("code_hash", code_hash))
            .bind(("state", state.to_owned()))
            .bind(("code_challenge", code_challenge.to_owned()))
            .await
            .map_err(|e| crate::log_and_convert!(AppError::database, "native_handoff.take", e))?;
        let rows: Vec<NativeLoginHandoffRecord> = response
            .take(0)
            .map_err(|e| crate::log_and_convert!(AppError::database, "native_handoff.take", e))?;
        Ok(rows
            .into_iter()
            .next()
            .map(NativeLoginHandoffRecord::into_handoff))
    }
}

/// Persisted shape for table `oidc_state` (SCHEMAFULL). Every serialized field here must have a
/// matching `DEFINE FIELD` for `oidc_state` under `backend/db-migrations`; new columns require an
/// additive `.surql` migration so existing databases stay migratable.
#[derive(Debug, Serialize, Deserialize, SurrealValue)]
struct OidcStateRecord {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    id: Option<RecordId>,
    pkce_verifier: String,
    nonce: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    redirect_to: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    native_state: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    native_code_challenge: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    provider: Option<String>,
    created_at: Datetime,
    expires_at: Datetime,
}

impl OidcStateRecord {
    fn new(pending: PendingOidc) -> Self {
        let PendingOidc {
            pkce_verifier,
            nonce,
            redirect_to,
            native_login,
            created_at,
            expires_at,
            provider,
        } = pending;

        Self {
            id: None,
            pkce_verifier: pkce_verifier.secret().clone(),
            nonce: nonce.secret().to_owned(),
            redirect_to,
            native_state: native_login.as_ref().map(|native| native.state.clone()),
            native_code_challenge: native_login
                .as_ref()
                .map(|native| native.code_challenge.clone()),
            provider: Some(provider.to_string()),
            created_at: created_at.into(),
            expires_at: expires_at.into(),
        }
    }

    fn into_pending(self) -> PendingOidc {
        PendingOidc {
            pkce_verifier: PkceCodeVerifier::new(self.pkce_verifier),
            nonce: Nonce::new(self.nonce),
            redirect_to: self.redirect_to,
            native_login: self.native_state.zip(self.native_code_challenge).map(
                |(state, code_challenge)| PendingNativeLogin {
                    state,
                    code_challenge,
                },
            ),
            created_at: DateTime::<Utc>::from(self.created_at),
            expires_at: DateTime::<Utc>::from(self.expires_at),
            provider: self
                .provider
                .as_deref()
                .and_then(|value| OidcProvider::from_str(value).ok())
                .unwrap_or(OidcProvider::Google),
        }
    }
}

/// Persisted one-time desktop callback codes. The raw code never reaches the database: its
/// SHA-256 digest is used as the record id so database reads cannot be used to mint app sessions.
#[derive(Debug, Serialize, Deserialize, SurrealValue)]
struct NativeLoginHandoffRecord {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    id: Option<RecordId>,
    session_id: String,
    state: String,
    code_challenge: String,
    created_at: Datetime,
    expires_at: Datetime,
}

impl NativeLoginHandoffRecord {
    fn new(handoff: NativeLoginHandoff) -> Self {
        Self {
            id: None,
            session_id: handoff.session_id,
            state: handoff.state,
            code_challenge: handoff.code_challenge,
            created_at: handoff.created_at.into(),
            expires_at: handoff.expires_at.into(),
        }
    }

    fn into_handoff(self) -> NativeLoginHandoff {
        NativeLoginHandoff {
            session_id: self.session_id,
            state: self.state,
            code_challenge: self.code_challenge,
            created_at: DateTime::<Utc>::from(self.created_at),
            expires_at: DateTime::<Utc>::from(self.expires_at),
        }
    }
}

fn hash_handoff_code(code: &str) -> String {
    let digest = ring::digest::digest(&ring::digest::SHA256, code.as_bytes());
    hex::encode(digest.as_ref())
}
