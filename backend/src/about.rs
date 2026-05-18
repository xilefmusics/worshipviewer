//! Public deployment metadata (`GET /api/v1/about`).

use actix_web::{HttpResponse, get};
use shared::AboutResponse;

use crate::observability;

const SERVICE_NAME: &str = "worshipviewer-backend";

/// Public metadata: which build is running (no authentication).
#[utoipa::path(
    get,
    path = "/api/v1/about",
    responses(
        (status = 200, description = "Deployed backend metadata", body = AboutResponse),
    ),
    tag = "About",
)]
#[get("/about")]
pub async fn get_about() -> HttpResponse {
    HttpResponse::Ok().json(AboutResponse {
        service: SERVICE_NAME.into(),
        version: env!("CARGO_PKG_VERSION").into(),
        git_commit: option_env!("GIT_COMMIT_SHA").map(String::from),
        production: observability::is_production(),
    })
}
