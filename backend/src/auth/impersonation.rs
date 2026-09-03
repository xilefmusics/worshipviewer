use actix_web::{
    HttpMessage, HttpRequest,
    cookie::{Cookie, SameSite},
};
use chrono::{DateTime, Utc};
use ring::digest::{SHA256, digest};
use serde::{Deserialize, Serialize};
use surrealdb::types::{Datetime, RecordId, SurrealValue};
use time::Duration as CookieDuration;
use utoipa::ToSchema;
use uuid::Uuid;

use super::context::{AuthorizationContext, AuthorizedImpersonation};
use crate::auth::{load_authorization_context, load_authorization_context_for_user};
use crate::database::{Database, record_id_string};
use crate::error::AppError;
use crate::http_audit::{AuditActorUserId, AuditImpersonationId, AuditSessionId};
use crate::settings::{CookieConfig, ImpersonationConfig};

#[derive(Clone, Debug, Deserialize, SurrealValue)]
pub struct ImpersonationRecord {
    pub id: RecordId,
    pub actor_session: RecordId,
    pub actor_user: RecordId,
    pub subject_user: RecordId,
    pub credential_hash: String,
    pub created_at: Datetime,
}

#[derive(Clone, Debug, Serialize, ToSchema)]
pub struct ImpersonationStatus {
    pub enabled: bool,
    pub active: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub impersonation_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub subject: Option<shared::user::User>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub started_at: Option<DateTime<Utc>>,
}

impl ImpersonationStatus {
    pub fn inactive(enabled: bool) -> Self {
        Self {
            enabled,
            active: false,
            impersonation_id: None,
            subject: None,
            started_at: None,
        }
    }
}

pub fn credential_hash(credential: &str) -> String {
    hex::encode(digest(&SHA256, credential.as_bytes()).as_ref())
}

pub fn new_cookie(credential: &str, cfg: &ImpersonationConfig) -> Cookie<'static> {
    Cookie::build(cfg.cookie_name.clone(), credential.to_owned())
        .http_only(true)
        .same_site(SameSite::Lax)
        .path("/")
        .secure(cfg.secure)
        .finish()
}

pub fn clear_cookie(cfg: &ImpersonationConfig) -> Cookie<'static> {
    Cookie::build(cfg.cookie_name.clone(), "")
        .http_only(true)
        .same_site(SameSite::Lax)
        .path("/")
        .secure(cfg.secure)
        .max_age(CookieDuration::ZERO)
        .finish()
}

pub fn compose_subject_context(
    actor: AuthorizationContext,
    subject: AuthorizationContext,
    record: &ImpersonationRecord,
) -> AuthorizationContext {
    subject.with_impersonation(
        actor,
        AuthorizedImpersonation {
            id: record_id_string(&record.id),
            started_at: record.created_at.into(),
        },
    )
}

pub async fn create(
    db: &Database,
    actor_session_id: &str,
    actor_user_id: &str,
    subject_user_id: &str,
) -> Result<(String, ImpersonationRecord), AppError> {
    let credential = Uuid::new_v4().to_string();
    let record_id = RecordId::new("impersonation_session", Uuid::new_v4().to_string());
    let mut response = db
        .db
        .query(
            "CREATE $id SET actor_session = $actor_session, actor_user = $actor_user, subject_user = $subject_user, credential_hash = $credential_hash RETURN AFTER",
        )
        .bind(("id", record_id))
        .bind(("actor_session", RecordId::new("session", actor_session_id.to_owned())))
        .bind(("actor_user", RecordId::new("user", actor_user_id.to_owned())))
        .bind(("subject_user", RecordId::new("user", subject_user_id.to_owned())))
        .bind(("credential_hash", credential_hash(&credential)))
        .await
        .map_err(|e| crate::log_and_convert!(AppError::database, "impersonation.create", e))?;
    response = response.check().map_err(|e| {
        crate::log_and_convert!(AppError::database, "impersonation.create.check", e)
    })?;
    let record: Option<ImpersonationRecord> = response
        .take(0)
        .map_err(|e| crate::log_and_convert!(AppError::database, "impersonation.create.take", e))?;
    let record =
        record.ok_or_else(|| AppError::database("impersonation record was not created"))?;
    Ok((credential, record))
}

pub async fn find_for_actor(
    db: &Database,
    credential: &str,
    actor_session_id: &str,
    actor_user_id: &str,
) -> Result<Option<ImpersonationRecord>, AppError> {
    let mut response = db
        .db
        .query(
            "SELECT * FROM impersonation_session WHERE credential_hash = $credential_hash AND actor_session = $actor_session AND actor_user = $actor_user LIMIT 1",
        )
        .bind(("credential_hash", credential_hash(credential)))
        .bind(("actor_session", RecordId::new("session", actor_session_id.to_owned())))
        .bind(("actor_user", RecordId::new("user", actor_user_id.to_owned())))
        .await
        .map_err(|e| crate::log_and_convert!(AppError::database, "impersonation.find", e))?;
    response = response
        .check()
        .map_err(|e| crate::log_and_convert!(AppError::database, "impersonation.find.check", e))?;
    let mut rows: Vec<ImpersonationRecord> = response
        .take(0)
        .map_err(|e| crate::log_and_convert!(AppError::database, "impersonation.find.take", e))?;
    Ok(rows.pop())
}

pub async fn delete(db: &Database, record: &ImpersonationRecord) -> Result<(), AppError> {
    db.db
        .query("DELETE $id")
        .bind(("id", record.id.clone()))
        .await
        .map_err(|e| crate::log_and_convert!(AppError::database, "impersonation.delete", e))?
        .check()
        .map_err(|e| {
            crate::log_and_convert!(AppError::database, "impersonation.delete.check", e)
        })?;
    Ok(())
}

pub async fn purge_all(db: &Database) -> Result<(), AppError> {
    let mut response = db
        .db
        .query("SELECT * FROM impersonation_session")
        .await
        .map_err(|e| {
            crate::log_and_convert!(AppError::database, "impersonation.purge.select", e)
        })?;
    response = response.check().map_err(|e| {
        crate::log_and_convert!(AppError::database, "impersonation.purge.select.check", e)
    })?;
    let records: Vec<ImpersonationRecord> = response.take(0).map_err(|e| {
        crate::log_and_convert!(AppError::database, "impersonation.purge.select.take", e)
    })?;
    for record in records {
        crate::audit!(
            "audit.impersonation.invalidated",
            impersonation_id = tracing::field::display(&record_id_string(&record.id)),
            actor_user_id = tracing::field::display(&record_id_string(&record.actor_user)),
            subject_user_id = tracing::field::display(&record_id_string(&record.subject_user)),
            reason = tracing::field::display("feature_disabled")
            ; "impersonation invalidated"
        );
    }
    db.db
        .query("DELETE impersonation_session")
        .await
        .map_err(|e| crate::log_and_convert!(AppError::database, "impersonation.purge", e))?
        .check()
        .map_err(|e| crate::log_and_convert!(AppError::database, "impersonation.purge.check", e))?;
    Ok(())
}

pub async fn load_effective_context(
    db: &Database,
    actor: AuthorizationContext,
    credential: &str,
) -> Result<Option<(ImpersonationRecord, AuthorizationContext)>, AppError> {
    let Some(record) = find_for_actor(db, credential, &actor.session.id, &actor.user.id).await?
    else {
        return Ok(None);
    };
    let subject_user_id = record_id_string(&record.subject_user);
    let Some(subject) = load_authorization_context_for_user(db, &subject_user_id).await? else {
        delete(db, &record).await?;
        crate::audit!(
            "audit.impersonation.invalidated",
            impersonation_id = tracing::field::display(&record_id_string(&record.id)),
            actor_user_id = tracing::field::display(&record_id_string(&record.actor_user)),
            subject_user_id = tracing::field::display(&subject_user_id),
            reason = tracing::field::display("subject_unavailable")
            ; "impersonation invalidated"
        );
        return Ok(None);
    };
    Ok(Some((
        record.clone(),
        compose_subject_context(actor, subject, &record),
    )))
}

pub async fn load_actor_context(
    db: &Database,
    primary_session_id: Option<&str>,
) -> Result<Option<AuthorizationContext>, AppError> {
    let Some(session_id) = primary_session_id else {
        return Ok(None);
    };
    let Some(ctx) = load_authorization_context(db, session_id).await? else {
        return Ok(None);
    };
    if ctx.session.expired {
        return Ok(None);
    }
    Ok(Some(ctx))
}

pub fn status_from_record(
    enabled: bool,
    record: &ImpersonationRecord,
    subject: shared::user::User,
) -> ImpersonationStatus {
    ImpersonationStatus {
        enabled,
        active: true,
        impersonation_id: Some(record_id_string(&record.id)),
        subject: Some(subject),
        started_at: Some(record.created_at.into()),
    }
}

pub fn primary_cookie_value(req: &actix_web::HttpRequest, cfg: &CookieConfig) -> Option<String> {
    req.cookie(&cfg.name)
        .map(|cookie| cookie.value().to_owned())
}

/// Attach the effective context and impersonation links for auth endpoints that
/// authenticate the primary session independently of `RequireUser`.
pub fn attach_request_context(req: &HttpRequest, ctx: AuthorizationContext) {
    req.extensions_mut()
        .insert(AuditSessionId(ctx.session.id.clone()));
    if let Some(impersonation) = ctx.impersonation.as_ref() {
        req.extensions_mut()
            .insert(AuditActorUserId(ctx.actor.id.clone()));
        req.extensions_mut()
            .insert(AuditImpersonationId(impersonation.id.clone()));
        tracing::Span::current().record("actor_user_id", tracing::field::display(&ctx.actor.id));
        tracing::Span::current().record(
            "impersonation_id",
            tracing::field::display(&impersonation.id),
        );
    }
    tracing::Span::current().record("user_id", tracing::field::display(&ctx.user.id));
    req.extensions_mut().insert(ctx);
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::auth::context::{AuthorizedSession, AuthorizedTeam, AuthorizedUser};
    use shared::user::Role;
    use std::sync::Arc;

    fn context(id: &str, role: Role) -> AuthorizationContext {
        let user = AuthorizedUser {
            id: id.into(),
            email: format!("{id}@test.local"),
            role,
            oauth_picture_url: None,
            oauth_avatar_blob_id: None,
            avatar_blob_id: None,
        };
        AuthorizationContext {
            session: AuthorizedSession {
                id: format!("session-{id}"),
                expired: false,
            },
            actor: user.clone(),
            user,
            teams: Arc::new([]) as Arc<[AuthorizedTeam]>,
            impersonation: None,
        }
    }

    #[test]
    fn credentials_are_hashed_without_revealing_the_credential() {
        let credential = "opaque-support-secret";
        let hash = credential_hash(credential);
        assert_eq!(hash.len(), 64);
        assert_ne!(hash, credential);
        assert_eq!(hash, credential_hash(credential));
        assert_ne!(hash, credential_hash("another-secret"));
    }

    #[test]
    fn cookie_has_browser_session_security_attributes() {
        let cfg = ImpersonationConfig {
            enabled: true,
            cookie_name: "wv_impersonation".into(),
            secure: true,
        };
        let cookie = new_cookie("credential", &cfg);
        assert_eq!(cookie.name(), "wv_impersonation");
        assert_eq!(cookie.value(), "credential");
        assert!(cookie.http_only().unwrap_or(false));
        assert_eq!(cookie.same_site(), Some(SameSite::Lax));
        assert!(cookie.secure().unwrap_or(false));
        assert_eq!(cookie.path(), Some("/"));
        assert_eq!(clear_cookie(&cfg).max_age(), Some(CookieDuration::ZERO));
    }

    #[test]
    fn composition_preserves_actor_and_uses_subject_acl_context() {
        let actor = context("admin", Role::Admin);
        let subject = context("subject", Role::Default);
        let record = ImpersonationRecord {
            id: RecordId::new("impersonation_session", "imp-1"),
            actor_session: RecordId::new("session", "session-admin"),
            actor_user: RecordId::new("user", "admin"),
            subject_user: RecordId::new("user", "subject"),
            credential_hash: credential_hash("credential"),
            created_at: Datetime::from(Utc::now()),
        };
        let composed = compose_subject_context(actor.clone(), subject, &record);
        assert_eq!(composed.user.id, "subject");
        assert_eq!(composed.actor.id, "admin");
        assert_eq!(composed.session.id, "session-admin");
        assert_eq!(composed.impersonation.unwrap().id, "imp-1");
    }
}
