use crate::auth::AuthorizationContext;
#[allow(unused_imports)]
use crate::docs::Problem;
use crate::error::AppError;
use actix_web::http::header;
use actix_web::{
    HttpRequest, HttpResponse, Scope, delete, get, patch, post, put,
    web::{self, Data, Json, Path, Query, ReqData},
};
use shared::api::{ListQuery, PAGE_SIZE_DEFAULT};
#[allow(unused_imports)]
use shared::team::Team;
use shared::team::{CreateTeam, PatchTeam, UpdateTeam};

use super::invitation;
use super::service::TeamServiceHandle;

pub fn scope() -> Scope {
    web::scope("/teams")
        .service(invitation::rest::team_invitations_scope())
        .service(get_teams)
        .service(get_team)
        .service(create_team)
        .service(update_team)
        .service(patch_team)
        .service(delete_team)
}

#[utoipa::path(
    get,
    path = "/api/v1/teams",
    params(
        ("page" = Option<u32>, Query, description = "Page index, zero-based; defaults to 0.", minimum = 0, nullable = true),
        ("page_size" = Option<u32>, Query, description = "Items per page. Must be 1–500. Defaults to 50 when omitted.", minimum = 1, maximum = 500, example = 50, nullable = true),
        ("q" = Option<String>, Query, description = "Optional search: full-text on team name; case-insensitive substring on team id, personal owner email, and member emails. Whitespace-only is treated as absent."),
    ),
    responses(
        (status = 200, description = "Teams readable by the current user; platform admins receive all teams (except internal public). `X-Total-Count` is the total before paging.", body = [Team]),
        (status = 400, description = "Invalid pagination parameters", body = Problem, content_type = "application/problem+json"),
        (status = 401, description = "Authentication required", body = Problem, content_type = "application/problem+json"),
        (status = 429, description = "API rate limit exceeded; see `Retry-After` and `X-RateLimit-*` response headers", body = Problem, content_type = "application/problem+json"),
        (status = 500, description = "Failed to list teams", body = Problem, content_type = "application/problem+json")
    ),
    tag = "Teams",
    security(
        ("SessionCookie" = []),
        ("SessionToken" = [])
    )
)]
#[get("")]
async fn get_teams(
    req: HttpRequest,
    svc: Data<TeamServiceHandle>,
    ctx: ReqData<AuthorizationContext>,
    query: Query<ListQuery>,
) -> Result<HttpResponse, AppError> {
    let acting = ctx.acting_user();
    let query = query
        .into_inner()
        .validate()
        .map_err(crate::error::map_list_query_error)?;
    let q_link = query.clone();
    let cur_page = query.page.unwrap_or(0);
    let page_size = query.page_size.unwrap_or(PAGE_SIZE_DEFAULT);
    let q_trimmed = query.q.as_ref().map(|s| s.trim()).filter(|s| !s.is_empty());
    let (teams_page, total) = if let Some(qt) = q_trimmed {
        let total = svc.count_teams_for_user_search(&acting, qt).await?;
        let teams = svc.list_teams_for_user_search(&acting, &query, qt).await?;
        (teams, total)
    } else {
        let teams = svc.list_teams_for_user(&acting).await?;
        ListQuery::paginate_vec(teams, &query)
    };
    Ok(HttpResponse::Ok()
        .insert_header((
            header::HeaderName::from_static("x-total-count"),
            total.to_string(),
        ))
        .insert_header((
            header::LINK,
            crate::request_link::list_link_header(
                &req,
                |p| q_link.query_string_for_page(p),
                cur_page,
                page_size,
                total,
            ),
        ))
        .json(teams_page))
}

#[utoipa::path(
    get,
    path = "/api/v1/teams/{id}",
    params(
        ("id" = String, Path, description = "Team identifier")
    ),
    responses(
        (status = 200, description = "Team details; platform admins may read any team except internal public", body = Team),
        (status = 401, description = "Authentication required", body = Problem, content_type = "application/problem+json"),
        (status = 429, description = "API rate limit exceeded; see `Retry-After` and `X-RateLimit-*` response headers", body = Problem, content_type = "application/problem+json"),
        (status = 404, description = "Team not found", body = Problem, content_type = "application/problem+json"),
        (status = 500, description = "Failed to fetch team", body = Problem, content_type = "application/problem+json")
    ),
    tag = "Teams",
    security(
        ("SessionCookie" = []),
        ("SessionToken" = [])
    )
)]
#[get("/{id}")]
async fn get_team(
    svc: Data<TeamServiceHandle>,
    ctx: ReqData<AuthorizationContext>,
    id: Path<String>,
) -> Result<HttpResponse, AppError> {
    let acting = ctx.acting_user();
    Ok(HttpResponse::Ok().json(svc.get_team_for_user(&acting, &id).await?))
}

#[utoipa::path(
    post,
    path = "/api/v1/teams",
    request_body = CreateTeam,
    responses(
        (status = 201, description = "Shared team created", body = Team),
        (status = 400, description = "Invalid request", body = Problem, content_type = "application/problem+json"),
        (status = 401, description = "Authentication required", body = Problem, content_type = "application/problem+json"),
        (status = 429, description = "API rate limit exceeded; see `Retry-After` and `X-RateLimit-*` response headers", body = Problem, content_type = "application/problem+json"),
        (status = 500, description = "Failed to create team", body = Problem, content_type = "application/problem+json")
    ),
    tag = "Teams",
    security(
        ("SessionCookie" = []),
        ("SessionToken" = [])
    )
)]
#[post("")]
async fn create_team(
    svc: Data<TeamServiceHandle>,
    ctx: ReqData<AuthorizationContext>,
    payload: Json<CreateTeam>,
) -> Result<HttpResponse, AppError> {
    let acting = ctx.acting_user();
    let payload = payload.into_inner();
    payload.validate().map_err(AppError::invalid_request)?;
    Ok(HttpResponse::Created().json(svc.create_shared_team_for_user(&acting, payload).await?))
}

#[utoipa::path(
    put,
    path = "/api/v1/teams/{id}",
    params(
        ("id" = String, Path, description = "Team identifier")
    ),
    request_body = UpdateTeam,
    responses(
        (status = 200, description = "Team updated", body = Team),
        (status = 400, description = "Invalid request", body = Problem, content_type = "application/problem+json"),
        (status = 401, description = "Authentication required", body = Problem, content_type = "application/problem+json"),
        (status = 429, description = "API rate limit exceeded; see `Retry-After` and `X-RateLimit-*` response headers", body = Problem, content_type = "application/problem+json"),
        (status = 403, description = "Insufficient team role", body = Problem, content_type = "application/problem+json"),
        (status = 404, description = "Team not found", body = Problem, content_type = "application/problem+json"),
        (status = 409, description = "Sole admin cannot remove all admins", body = Problem, content_type = "application/problem+json"),
        (status = 500, description = "Failed to update team", body = Problem, content_type = "application/problem+json")
    ),
    tag = "Teams",
    security(
        ("SessionCookie" = []),
        ("SessionToken" = [])
    )
)]
#[put("/{id}")]
async fn update_team(
    svc: Data<TeamServiceHandle>,
    ctx: ReqData<AuthorizationContext>,
    id: Path<String>,
    payload: Json<UpdateTeam>,
) -> Result<HttpResponse, AppError> {
    let acting = ctx.acting_user();
    let payload = payload.into_inner();
    payload.validate().map_err(AppError::invalid_request)?;
    Ok(HttpResponse::Ok().json(svc.update_team_for_user(&acting, &id, payload).await?))
}

#[utoipa::path(
    patch,
    path = "/api/v1/teams/{id}",
    params(
        ("id" = String, Path, description = "Team identifier")
    ),
    request_body = PatchTeam,
    responses(
        (status = 200, description = "Team partially updated", body = Team),
        (status = 400, description = "Invalid request", body = Problem, content_type = "application/problem+json"),
        (status = 401, description = "Authentication required", body = Problem, content_type = "application/problem+json"),
        (status = 429, description = "API rate limit exceeded; see `Retry-After` and `X-RateLimit-*` response headers", body = Problem, content_type = "application/problem+json"),
        (status = 403, description = "Insufficient team role", body = Problem, content_type = "application/problem+json"),
        (status = 404, description = "Team not found", body = Problem, content_type = "application/problem+json"),
        (status = 409, description = "Sole admin cannot remove all admins", body = Problem, content_type = "application/problem+json"),
        (status = 500, description = "Failed to update team", body = Problem, content_type = "application/problem+json")
    ),
    tag = "Teams",
    security(
        ("SessionCookie" = []),
        ("SessionToken" = [])
    )
)]
#[patch("/{id}")]
async fn patch_team(
    svc: Data<TeamServiceHandle>,
    ctx: ReqData<AuthorizationContext>,
    id: Path<String>,
    payload: Json<PatchTeam>,
) -> Result<HttpResponse, AppError> {
    let acting = ctx.acting_user();
    Ok(HttpResponse::Ok().json(
        svc.patch_team_for_user(&acting, &id, payload.into_inner())
            .await?,
    ))
}

#[utoipa::path(
    delete,
    path = "/api/v1/teams/{id}",
    params(
        ("id" = String, Path, description = "Team identifier")
    ),
    responses(
        (status = 204, description = "Team deleted"),
        (status = 401, description = "Authentication required", body = Problem, content_type = "application/problem+json"),
        (status = 429, description = "API rate limit exceeded; see `Retry-After` and `X-RateLimit-*` response headers", body = Problem, content_type = "application/problem+json"),
        (status = 403, description = "Cannot delete personal team or insufficient role", body = Problem, content_type = "application/problem+json"),
        (status = 404, description = "Team not found", body = Problem, content_type = "application/problem+json"),
        (status = 500, description = "Failed to delete team", body = Problem, content_type = "application/problem+json")
    ),
    tag = "Teams",
    security(
        ("SessionCookie" = []),
        ("SessionToken" = [])
    )
)]
#[delete("/{id}")]
async fn delete_team(
    svc: Data<TeamServiceHandle>,
    ctx: ReqData<AuthorizationContext>,
    id: Path<String>,
) -> Result<HttpResponse, AppError> {
    svc.delete_team_for_user(&ctx, &id).await?;
    Ok(HttpResponse::NoContent().finish())
}
