use surrealdb::types::RecordId;
use tracing::instrument;

use super::context::{AuthCtxBootstrapRow, AuthCtxRow, AuthorizationContext};
use crate::database::{Database, surreal_take_errors};
use crate::error::AppError;

#[instrument(
    name = "auth.surreal_repo.load_authorization_context",
    level = "debug",
    skip(db)
)]
pub async fn load_authorization_context(
    db: &Database,
    session_id: &str,
) -> Result<Option<AuthorizationContext>, AppError> {
    let public = RecordId::new("team", "public");
    let mut response = db
        .db
        .query(
            r"
LET $sid = type::record('session', $id);

LET $s = SELECT id, user, expires_at FROM ONLY $sid;

LET $u = IF $s == NONE {
    NONE
} ELSE {
    SELECT id, role, email, oauth_picture_url,
           oauth_avatar_blob AS oauth_avatar_blob_id, avatar_blob AS avatar_blob_id
    FROM ONLY $s.user
};

RETURN IF $s == NONE {
    NONE
} ELSE {
    {
        session: {
            id: $s.id,
            expired: $s.expires_at != NONE AND $s.expires_at <= time::now()
        },
        user: $u,
        teams: IF $u == NONE {
            []
        } ELSE {
            SELECT VALUE {
                id: id,
                owner: owner,
                role: IF owner = $u.id THEN
                    'admin'
                ELSE
                    members[WHERE user = $u.id][0].role
                END
            }
            FROM team
            WHERE id != $public
              AND (owner = $u.id OR members.user CONTAINS $u.id)
        }
    }
};
",
        )
        .bind(("id", session_id.to_owned()))
        .bind(("public", public))
        .await
        .map_err(|e| crate::log_and_convert!(AppError::database, "auth_ctx.query", e))?;

    surreal_take_errors("auth_ctx", &mut response)?;
    response = response
        .check()
        .map_err(|e| crate::log_and_convert!(AppError::database, "auth_ctx.check", e))?;

    let raw: Option<AuthCtxRow> = response
        .take(3)
        .map_err(|e| crate::log_and_convert!(AppError::database, "auth_ctx.take", e))?;

    let Some(row) = raw else {
        return Ok(None);
    };

    AuthorizationContext::try_from(row).map(Some)
}

#[instrument(
    name = "auth.surreal_repo.load_authorization_context_for_user",
    level = "debug",
    skip(db)
)]
pub async fn load_authorization_context_for_user(
    db: &Database,
    user_id: &str,
) -> Result<Option<AuthorizationContext>, AppError> {
    let public = RecordId::new("team", "public");
    let mut response = db
        .db
        .query(
            r"
LET $user_rec = type::record('user', $uid);

LET $u = SELECT id, role, email, oauth_picture_url,
           oauth_avatar_blob AS oauth_avatar_blob_id, avatar_blob AS avatar_blob_id
    FROM ONLY $user_rec;

RETURN IF $u == NONE {
    NONE
} ELSE {
    {
        user: $u,
        teams: SELECT VALUE {
            id: id,
            owner: owner,
            role: IF owner = $u.id THEN
                'admin'
            ELSE
                members[WHERE user = $u.id][0].role
            END
        }
        FROM team
        WHERE id != $public
          AND (owner = $u.id OR members.user CONTAINS $u.id)
    }
};
",
        )
        .bind(("uid", user_id.to_owned()))
        .bind(("public", public))
        .await
        .map_err(|e| crate::log_and_convert!(AppError::database, "auth_ctx_bootstrap.query", e))?;

    surreal_take_errors("auth_ctx_bootstrap", &mut response)?;
    response = response
        .check()
        .map_err(|e| crate::log_and_convert!(AppError::database, "auth_ctx_bootstrap.check", e))?;

    let raw: Option<AuthCtxBootstrapRow> = response
        .take(2)
        .map_err(|e| crate::log_and_convert!(AppError::database, "auth_ctx_bootstrap.take", e))?;

    let Some(row) = raw else {
        return Ok(None);
    };

    AuthorizationContext::try_from(row).map(Some)
}
