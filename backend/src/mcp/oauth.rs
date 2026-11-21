use std::time::Duration;

use actix_web::{
    HttpRequest, HttpResponse, Scope, delete, get, post,
    web::{self, Data, Json, Path, Query},
};
use chrono::{DateTime, TimeDelta, Utc};
use ring::{
    digest::{SHA256, digest},
    rand::{SecureRandom, SystemRandom},
};
use serde::{Deserialize, Serialize};
use serde_json::json;
use subtle::ConstantTimeEq;
use surrealdb::types::{Datetime, SurrealValue};
use url::Url;

use crate::{
    auth::{AuthorizationContext, load_authorization_context},
    database::Database,
    error::AppError,
    settings::CookieConfig,
};

const SCOPE: &str = "music:read";
const ACCESS_TOKEN_TTL_SECONDS: i64 = 15 * 60;
const REFRESH_TOKEN_TTL_SECONDS: i64 = 30 * 24 * 60 * 60;
const AUTHORIZATION_CODE_TTL_SECONDS: i64 = 10 * 60;
const CIMD_MAX_BYTES: usize = 64 * 1024;

#[derive(Clone)]
pub struct McpOauthConfig {
    pub public_base_url: String,
}

impl McpOauthConfig {
    pub fn new(public_base_url: String) -> anyhow::Result<Self> {
        let public_url = Url::parse(public_base_url.trim())
            .map_err(|error| anyhow::anyhow!("PUBLIC_BASE_URL is invalid: {error}"))?;
        if !matches!(public_url.scheme(), "http" | "https")
            || public_url.host_str().is_none()
            || !public_url.username().is_empty()
            || public_url.password().is_some()
            || public_url.path() != "/"
            || public_url.query().is_some()
            || public_url.fragment().is_some()
        {
            anyhow::bail!("PUBLIC_BASE_URL must be an HTTP(S) origin without a path");
        }
        let public_base_url = public_url.origin().ascii_serialization();
        if public_base_url == "null" {
            anyhow::bail!("PUBLIC_BASE_URL must have a valid HTTP(S) origin");
        }
        Ok(Self { public_base_url })
    }

    pub fn issuer(&self) -> &str {
        &self.public_base_url
    }

    pub fn resource(&self) -> String {
        format!("{}/mcp", self.public_base_url)
    }

    pub(super) fn endpoint(&self, path: &str) -> String {
        format!("{}{}", self.public_base_url, path)
    }
}

pub fn scope(
    auth_rate_limit_rps: u64,
    auth_rate_limit_burst: u32,
    api_rate_limit_rps: u64,
    api_rate_limit_burst: u32,
) -> Scope {
    let auth_governor = actix_governor::GovernorConfigBuilder::default()
        .requests_per_second(auth_rate_limit_rps)
        .burst_size(auth_rate_limit_burst)
        .key_extractor(crate::governor_peer::ProblemJsonPeerIpKeyExtractor)
        .finish()
        .expect("valid OAuth rate limit configuration");
    let api_governor = actix_governor::GovernorConfigBuilder::default()
        .requests_per_second(api_rate_limit_rps)
        .burst_size(api_rate_limit_burst)
        .key_extractor(crate::governor_peer::ProblemJsonPeerIpKeyExtractor)
        .finish()
        .expect("valid OAuth API rate limit configuration");
    web::scope("")
        .service(authorization_server_metadata)
        .service(protected_resource_root)
        .service(protected_resource_mcp)
        .service(
            web::scope("/oauth")
                .wrap(crate::governor_audit::AuditRateLimit429)
                .wrap(actix_governor::Governor::new(&auth_governor))
                .service(authorize)
                .service(token)
                .service(revoke),
        )
        .service(
            web::scope("/api/v1/mcp/oauth")
                .wrap(crate::governor_audit::AuditRateLimit429)
                .wrap(actix_governor::Governor::new(&api_governor))
                .service(get_consent_request)
                .service(decide_consent)
                .service(get_grants)
                .service(revoke_grant),
        )
}

#[derive(Debug, Serialize)]
struct AuthorizationServerMetadata<'a> {
    issuer: &'a str,
    authorization_endpoint: String,
    token_endpoint: String,
    revocation_endpoint: String,
    response_types_supported: [&'static str; 1],
    grant_types_supported: [&'static str; 2],
    code_challenge_methods_supported: [&'static str; 1],
    scopes_supported: [&'static str; 1],
    token_endpoint_auth_methods_supported: [&'static str; 1],
    client_id_metadata_document_supported: bool,
    authorization_response_iss_parameter_supported: bool,
}

#[utoipa::path(
    get,
    path = "/.well-known/oauth-authorization-server",
    responses((status = 200, description = "OAuth authorization server metadata including authorization code with PKCE endpoints")),
    tag = "MCP OAuth"
)]
#[get("/.well-known/oauth-authorization-server")]
pub(crate) async fn authorization_server_metadata(config: Data<McpOauthConfig>) -> HttpResponse {
    HttpResponse::Ok().json(AuthorizationServerMetadata {
        issuer: config.issuer(),
        authorization_endpoint: config.endpoint("/oauth/authorize"),
        token_endpoint: config.endpoint("/oauth/token"),
        revocation_endpoint: config.endpoint("/oauth/revoke"),
        response_types_supported: ["code"],
        grant_types_supported: ["authorization_code", "refresh_token"],
        code_challenge_methods_supported: ["S256"],
        scopes_supported: [SCOPE],
        token_endpoint_auth_methods_supported: ["none"],
        client_id_metadata_document_supported: true,
        authorization_response_iss_parameter_supported: true,
    })
}

#[derive(Debug, Serialize)]
struct ProtectedResourceMetadata {
    resource: String,
    authorization_servers: Vec<String>,
    bearer_methods_supported: [&'static str; 1],
    scopes_supported: [&'static str; 1],
}

#[utoipa::path(
    get,
    path = "/.well-known/oauth-protected-resource",
    responses((status = 200, description = "Protected resource metadata for the remote MCP endpoint")),
    tag = "MCP OAuth"
)]
#[get("/.well-known/oauth-protected-resource")]
pub(crate) async fn protected_resource_root(config: Data<McpOauthConfig>) -> HttpResponse {
    resource_metadata(config.get_ref(), config.resource())
}

#[utoipa::path(
    get,
    path = "/.well-known/oauth-protected-resource/mcp",
    responses((status = 200, description = "Protected resource metadata for /mcp")),
    tag = "MCP OAuth"
)]
#[get("/.well-known/oauth-protected-resource/mcp")]
pub(crate) async fn protected_resource_mcp(config: Data<McpOauthConfig>) -> HttpResponse {
    resource_metadata(config.get_ref(), config.resource())
}

fn resource_metadata(config: &McpOauthConfig, resource: String) -> HttpResponse {
    HttpResponse::Ok().json(ProtectedResourceMetadata {
        resource,
        authorization_servers: vec![config.issuer().to_owned()],
        bearer_methods_supported: ["header"],
        scopes_supported: [SCOPE],
    })
}

#[derive(Debug, Deserialize, utoipa::IntoParams)]
#[into_params(parameter_in = Query)]
pub(crate) struct AuthorizeQuery {
    response_type: String,
    client_id: String,
    redirect_uri: String,
    code_challenge: String,
    code_challenge_method: String,
    state: String,
    scope: String,
    resource: String,
}

#[derive(Debug, Deserialize)]
struct ClientMetadataDocument {
    client_id: String,
    client_name: Option<String>,
    redirect_uris: Vec<String>,
}

#[derive(Debug, Deserialize, SurrealValue)]
struct AuthorizationRequestRecord {
    client_id: String,
    client_name: String,
    redirect_uri: String,
    code_challenge: String,
    state: String,
    scope: String,
    resource: String,
    expires_at: Datetime,
}

#[derive(Debug, Deserialize, SurrealValue)]
struct AuthorizationCodeRecord {
    user_id: String,
    client_id: String,
    client_name: String,
    redirect_uri: String,
    code_challenge: String,
    scope: String,
    resource: String,
    grant_id: String,
    expires_at: Datetime,
}

#[derive(Debug, Deserialize, SurrealValue)]
struct GrantRecord {
    user_id: String,
    client_id: String,
    client_name: String,
    scope: String,
    created_at: Datetime,
}

#[derive(Debug, Deserialize, SurrealValue)]
struct AccessTokenRecord {
    user_id: String,
    client_id: String,
    grant_id: String,
    scope: String,
    resource: String,
    expires_at: Datetime,
}

#[derive(Debug, Deserialize, SurrealValue)]
struct RefreshTokenRecord {
    user_id: String,
    client_id: String,
    grant_id: String,
    scope: String,
    resource: String,
    expires_at: Datetime,
}

#[utoipa::path(
    get,
    path = "/oauth/authorize",
    params(AuthorizeQuery),
    responses(
        (status = 302, description = "Redirects to app login or the OAuth client's registered callback after consent"),
        (status = 400, description = "Invalid OAuth request or client metadata document")
    ),
    tag = "MCP OAuth"
)]
#[get("/authorize")]
pub(crate) async fn authorize(
    request: HttpRequest,
    query: Query<AuthorizeQuery>,
    db: Data<Database>,
    config: Data<McpOauthConfig>,
    cookie_config: Data<CookieConfig>,
) -> Result<HttpResponse, AppError> {
    let query = query.into_inner();
    if query.response_type != "code"
        || query.code_challenge_method != "S256"
        || query.code_challenge.len() != 43
        || query.state.is_empty()
        || query.scope.split_whitespace().collect::<Vec<_>>() != [SCOPE]
        || query.resource != config.resource()
    {
        return Ok(HttpResponse::BadRequest().body("Invalid OAuth authorization request"));
    }
    cleanup_expired_oauth_records(db.get_ref()).await?;

    let Some(client) = fetch_cimd(&query.client_id).await else {
        return Ok(HttpResponse::BadRequest().body("The OAuth client metadata document is invalid"));
    };
    if query.client_id.len() > 2048
        || query.state.len() > 1024
        || !valid_code_challenge(&query.code_challenge)
        || client.client_id != query.client_id
        || !client
            .redirect_uris
            .iter()
            .any(|uri| uri == &query.redirect_uri)
        || !valid_redirect_uri(&query.redirect_uri)
    {
        return Ok(HttpResponse::BadRequest().body("The OAuth redirect URI is not registered"));
    }

    let request_id = random_token()?;
    let record = AuthorizationRequestRecord {
        client_id: query.client_id,
        client_name: client_name(client.client_name),
        redirect_uri: query.redirect_uri,
        code_challenge: query.code_challenge,
        state: query.state,
        scope: SCOPE.to_owned(),
        resource: query.resource,
        expires_at: Datetime::from(Utc::now() + TimeDelta::seconds(AUTHORIZATION_CODE_TTL_SECONDS)),
    };
    create_record(db.get_ref(), "mcp_oauth_request", &request_id, record).await?;

    let consent_url = format!("/oauth/consent?request_id={request_id}");
    let Some(ctx) = load_request_context(db.get_ref(), &request, &cookie_config).await? else {
        let mut login = Url::parse(&config.endpoint("/login"))
            .map_err(|_| AppError::database("invalid PUBLIC_BASE_URL"))?;
        login
            .query_pairs_mut()
            .append_pair("return_to", &consent_url);
        return Ok(HttpResponse::Found()
            .append_header((actix_web::http::header::LOCATION, login.to_string()))
            .finish());
    };
    let _ = ctx;
    Ok(HttpResponse::Found()
        .append_header((
            actix_web::http::header::LOCATION,
            config.endpoint(&consent_url),
        ))
        .finish())
}

async fn fetch_cimd(client_id: &str) -> Option<ClientMetadataDocument> {
    if client_id.len() > 2048 {
        return None;
    }
    let url = Url::parse(client_id).ok()?;
    let host = url.host_str()?.trim_end_matches('.').to_ascii_lowercase();
    if url.scheme() != "https"
        || !url.username().is_empty()
        || url.password().is_some()
        || url.port().is_some()
        || !(host == "chatgpt.com"
            || host.ends_with(".chatgpt.com")
            || host == "openai.com"
            || host.ends_with(".openai.com"))
    {
        return None;
    }
    let response = reqwest::Client::builder()
        .timeout(Duration::from_secs(5))
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .ok()?
        .get(url)
        .header(reqwest::header::ACCEPT, "application/json")
        .send()
        .await
        .ok()?;
    if !response.status().is_success()
        || response
            .content_length()
            .is_some_and(|length| length > CIMD_MAX_BYTES as u64)
    {
        return None;
    }
    let mut response = response;
    let mut bytes = bytes::BytesMut::new();
    while let Some(chunk) = response.chunk().await.ok()? {
        if bytes.len().saturating_add(chunk.len()) > CIMD_MAX_BYTES {
            return None;
        }
        bytes.extend_from_slice(&chunk);
    }
    serde_json::from_slice(&bytes).ok()
}

fn client_name(name: Option<String>) -> String {
    name.filter(|name| !name.trim().is_empty())
        .map(|name| {
            name.chars()
                .filter(|ch| !ch.is_control())
                .take(100)
                .collect()
        })
        .filter(|name: &String| !name.trim().is_empty())
        .unwrap_or_else(|| "Connected application".to_owned())
}

fn valid_redirect_uri(raw: &str) -> bool {
    Url::parse(raw).is_ok_and(|url| {
        url.scheme() == "https"
            && url.host_str().is_some()
            && url.username().is_empty()
            && url.password().is_none()
            && url.fragment().is_none()
    })
}

async fn load_request_context(
    db: &Database,
    request: &HttpRequest,
    cookie_config: &CookieConfig,
) -> Result<Option<AuthorizationContext>, AppError> {
    let Some(session_id) = request
        .cookie(&cookie_config.name)
        .map(|cookie| cookie.value().to_owned())
    else {
        return Ok(None);
    };
    Ok(load_authorization_context(db, &session_id)
        .await?
        .filter(|ctx| !ctx.session.expired))
}

#[derive(Debug, Serialize)]
struct ConsentRequestResponse {
    client_id: String,
    client_name: String,
    scope: String,
}

#[utoipa::path(
    get,
    path = "/api/v1/mcp/oauth/requests/{request_id}",
    params(("request_id" = String, Path, description = "Short-lived OAuth consent request")),
    responses(
        (status = 200, description = "Consent details for the connected client"),
        (status = 401, description = "App session required", body = crate::docs::Problem, content_type = "application/problem+json"),
        (status = 404, description = "Request expired or not found", body = crate::docs::Problem, content_type = "application/problem+json")
    ),
    security(("SessionCookie" = [])),
    tag = "MCP OAuth"
)]
#[get("/requests/{request_id}")]
pub(crate) async fn get_consent_request(
    request: HttpRequest,
    path: Path<String>,
    db: Data<Database>,
    cookie_config: Data<CookieConfig>,
) -> Result<HttpResponse, AppError> {
    let Some(_) = load_request_context(db.get_ref(), &request, &cookie_config).await? else {
        return Err(AppError::unauthorized());
    };
    let Some(record) =
        select_record::<AuthorizationRequestRecord>(db.get_ref(), "mcp_oauth_request", &path)
            .await?
            .filter(|record| not_expired(record.expires_at))
    else {
        return Err(AppError::NotFound("authorization request not found".into()));
    };
    Ok(HttpResponse::Ok().json(ConsentRequestResponse {
        client_id: record.client_id,
        client_name: record.client_name,
        scope: record.scope,
    }))
}

#[derive(Debug, Deserialize, utoipa::ToSchema)]
pub(crate) struct ConsentDecision {
    allow: bool,
}

#[utoipa::path(
    post,
    path = "/api/v1/mcp/oauth/requests/{request_id}",
    params(("request_id" = String, Path, description = "Short-lived OAuth consent request")),
    request_body = ConsentDecision,
    responses(
        (status = 200, description = "Redirect URI with the issued code or access_denied result"),
        (status = 401, description = "App session required", body = crate::docs::Problem, content_type = "application/problem+json"),
        (status = 403, description = "Cross-origin consent rejected", body = crate::docs::Problem, content_type = "application/problem+json"),
        (status = 404, description = "Request expired or not found", body = crate::docs::Problem, content_type = "application/problem+json")
    ),
    security(("SessionCookie" = [])),
    tag = "MCP OAuth"
)]
#[post("/requests/{request_id}")]
pub(crate) async fn decide_consent(
    request: HttpRequest,
    path: Path<String>,
    body: Json<ConsentDecision>,
    db: Data<Database>,
    config: Data<McpOauthConfig>,
    cookie_config: Data<CookieConfig>,
) -> Result<HttpResponse, AppError> {
    if !same_origin(&request, &config) {
        return Err(AppError::forbidden());
    }
    let Some(ctx) = load_request_context(db.get_ref(), &request, &cookie_config).await? else {
        return Err(AppError::unauthorized());
    };
    let Some(record) =
        take_record::<AuthorizationRequestRecord>(db.get_ref(), "mcp_oauth_request", &path)
            .await?
            .filter(|record| not_expired(record.expires_at))
    else {
        return Err(AppError::NotFound("authorization request not found".into()));
    };
    let redirect_uri = Url::parse(&record.redirect_uri)
        .map_err(|_| AppError::invalid_request("invalid registered redirect URI"))?;
    let mut redirect = redirect_uri;
    if !body.allow {
        redirect
            .query_pairs_mut()
            .append_pair("error", "access_denied")
            .append_pair("state", &record.state)
            .append_pair("iss", config.issuer());
        return Ok(HttpResponse::Ok().json(json!({ "redirect_to": redirect.to_string() })));
    }

    let grant_id = random_token()?;
    let grant = GrantRecord {
        user_id: ctx.user.id.clone(),
        client_id: record.client_id.clone(),
        client_name: record.client_name.clone(),
        scope: record.scope.clone(),
        created_at: Datetime::from(Utc::now()),
    };
    create_record(db.get_ref(), "mcp_oauth_grant", &grant_id, grant).await?;
    let code = random_token()?;
    let code_record = AuthorizationCodeRecord {
        user_id: ctx.user.id,
        client_id: record.client_id,
        client_name: record.client_name,
        redirect_uri: record.redirect_uri,
        code_challenge: record.code_challenge,
        scope: record.scope,
        resource: record.resource,
        grant_id,
        expires_at: Datetime::from(Utc::now() + TimeDelta::seconds(AUTHORIZATION_CODE_TTL_SECONDS)),
    };
    create_record(db.get_ref(), "mcp_oauth_code", &hash(&code), code_record).await?;
    redirect
        .query_pairs_mut()
        .append_pair("code", &code)
        .append_pair("state", &record.state)
        .append_pair("iss", config.issuer());
    Ok(HttpResponse::Ok().json(json!({ "redirect_to": redirect.to_string() })))
}

#[derive(Debug, Deserialize, utoipa::ToSchema)]
pub(crate) struct TokenRequest {
    grant_type: String,
    #[serde(default)]
    code: Option<String>,
    #[serde(default)]
    refresh_token: Option<String>,
    #[serde(default)]
    client_id: Option<String>,
    #[serde(default)]
    redirect_uri: Option<String>,
    #[serde(default)]
    code_verifier: Option<String>,
    #[serde(default)]
    resource: Option<String>,
    #[serde(default)]
    scope: Option<String>,
}

#[derive(Debug, Serialize)]
struct TokenResponse {
    access_token: String,
    token_type: &'static str,
    expires_in: i64,
    refresh_token: String,
    scope: String,
}

#[utoipa::path(
    post,
    path = "/oauth/token",
    request_body(content = TokenRequest, content_type = "application/x-www-form-urlencoded"),
    responses(
        (status = 200, description = "Opaque bearer access token and rotated refresh token"),
        (status = 400, description = "OAuth token request rejected")
    ),
    tag = "MCP OAuth"
)]
#[post("/token")]
pub(crate) async fn token(
    _request: HttpRequest,
    db: Data<Database>,
    config: Data<McpOauthConfig>,
    form: web::Form<TokenRequest>,
) -> Result<HttpResponse, AppError> {
    let form = form.into_inner();
    let issued = match form.grant_type.as_str() {
        "authorization_code" => {
            let (Some(code), Some(client_id), Some(redirect_uri), Some(verifier), Some(resource)) = (
                form.code,
                form.client_id,
                form.redirect_uri,
                form.code_verifier,
                form.resource,
            ) else {
                return Ok(oauth_error(
                    "invalid_request",
                    "Missing required token parameters",
                ));
            };
            let Some(code_record) = take_record::<AuthorizationCodeRecord>(
                db.get_ref(),
                "mcp_oauth_code",
                &hash(&code),
            )
            .await?
            .filter(|record| not_expired(record.expires_at)) else {
                return Ok(oauth_error(
                    "invalid_grant",
                    "Authorization code is invalid or expired",
                ));
            };
            if code_record.client_id != client_id
                || code_record.redirect_uri != redirect_uri
                || code_record.resource != resource
                || resource != config.resource()
                || !verify_pkce(&verifier, &code_record.code_challenge)
            {
                return Ok(oauth_error(
                    "invalid_grant",
                    "Authorization code validation failed",
                ));
            }
            issue_tokens(
                db.get_ref(),
                code_record.user_id,
                code_record.client_id,
                code_record.grant_id,
                code_record.scope,
                code_record.resource,
                Utc::now() + TimeDelta::seconds(REFRESH_TOKEN_TTL_SECONDS),
            )
            .await?
        }
        "refresh_token" => {
            let (Some(refresh), Some(client_id), Some(resource)) =
                (form.refresh_token, form.client_id, form.resource)
            else {
                return Ok(oauth_error(
                    "invalid_request",
                    "Missing required refresh parameters",
                ));
            };
            let Some(observed_record) = select_record::<RefreshTokenRecord>(
                db.get_ref(),
                "mcp_oauth_refresh",
                &hash(&refresh),
            )
            .await?
            .filter(|record| not_expired(record.expires_at)) else {
                return Ok(oauth_error(
                    "invalid_grant",
                    "Refresh token is invalid or expired",
                ));
            };
            let requested_scope = form.scope.as_deref().unwrap_or(&observed_record.scope);
            if observed_record.client_id != client_id
                || observed_record.resource != resource
                || resource != config.resource()
                || requested_scope != observed_record.scope
                || !grant_exists(
                    db.get_ref(),
                    &observed_record.grant_id,
                    &observed_record.user_id,
                )
                .await?
            {
                return Ok(oauth_error(
                    "invalid_grant",
                    "Refresh token validation failed",
                ));
            }
            let Some(refresh_record) = take_record::<RefreshTokenRecord>(
                db.get_ref(),
                "mcp_oauth_refresh",
                &hash(&refresh),
            )
            .await?
            .filter(|record| not_expired(record.expires_at)) else {
                return Ok(oauth_error(
                    "invalid_grant",
                    "Refresh token is invalid or already used",
                ));
            };
            issue_tokens(
                db.get_ref(),
                refresh_record.user_id,
                refresh_record.client_id,
                refresh_record.grant_id,
                refresh_record.scope,
                refresh_record.resource,
                DateTime::<Utc>::from(refresh_record.expires_at),
            )
            .await?
        }
        _ => {
            return Ok(oauth_error(
                "unsupported_grant_type",
                "Grant type is not supported",
            ));
        }
    };
    Ok(HttpResponse::Ok()
        .insert_header((actix_web::http::header::CACHE_CONTROL, "no-store"))
        .insert_header((actix_web::http::header::PRAGMA, "no-cache"))
        .json(issued))
}

async fn issue_tokens(
    db: &Database,
    user_id: String,
    client_id: String,
    grant_id: String,
    scope: String,
    resource: String,
    refresh_expires_at: DateTime<Utc>,
) -> Result<TokenResponse, AppError> {
    let access_token = random_token()?;
    let refresh_token = random_token()?;
    create_record(
        db,
        "mcp_oauth_access",
        &hash(&access_token),
        AccessTokenRecord {
            user_id: user_id.clone(),
            client_id: client_id.clone(),
            grant_id: grant_id.clone(),
            scope: scope.clone(),
            resource: resource.clone(),
            expires_at: Datetime::from(Utc::now() + TimeDelta::seconds(ACCESS_TOKEN_TTL_SECONDS)),
        },
    )
    .await?;
    create_record(
        db,
        "mcp_oauth_refresh",
        &hash(&refresh_token),
        RefreshTokenRecord {
            user_id,
            client_id,
            grant_id,
            scope: scope.clone(),
            resource,
            expires_at: Datetime::from(refresh_expires_at),
        },
    )
    .await?;
    Ok(TokenResponse {
        access_token,
        token_type: "Bearer",
        expires_in: ACCESS_TOKEN_TTL_SECONDS,
        refresh_token,
        scope,
    })
}

#[derive(Debug, Deserialize, utoipa::ToSchema)]
pub(crate) struct RevocationRequest {
    token: String,
    #[serde(default)]
    token_type_hint: Option<String>,
}

#[utoipa::path(
    post,
    path = "/oauth/revoke",
    request_body(content = RevocationRequest, content_type = "application/x-www-form-urlencoded"),
    responses((status = 200, description = "Token revocation result; unknown tokens are treated as revoked")),
    tag = "MCP OAuth"
)]
#[post("/revoke")]
pub(crate) async fn revoke(
    db: Data<Database>,
    form: web::Form<RevocationRequest>,
) -> Result<HttpResponse, AppError> {
    let token_hash = hash(&form.token);
    let access =
        select_record::<AccessTokenRecord>(db.get_ref(), "mcp_oauth_access", &token_hash).await?;
    let refresh =
        select_record::<RefreshTokenRecord>(db.get_ref(), "mcp_oauth_refresh", &token_hash).await?;
    let grant_id = access
        .map(|record| record.grant_id)
        .or_else(|| refresh.map(|record| record.grant_id));
    if let Some(grant_id) = grant_id {
        delete_grant_family(db.get_ref(), &grant_id).await?;
    }
    let _ = form.token_type_hint.as_deref();
    Ok(HttpResponse::Ok().finish())
}

#[derive(Debug, Serialize, utoipa::ToSchema)]
pub(crate) struct ConnectedGrant {
    id: String,
    client_id: String,
    client_name: String,
    scope: String,
    created_at: DateTime<Utc>,
}

#[utoipa::path(
    get,
    path = "/api/v1/mcp/oauth/grants",
    responses(
        (status = 200, description = "Connected MCP apps for the current user"),
        (status = 401, description = "App session required", body = crate::docs::Problem, content_type = "application/problem+json")
    ),
    security(("SessionCookie" = [])),
    tag = "MCP OAuth"
)]
#[get("/grants")]
pub(crate) async fn get_grants(
    request: HttpRequest,
    db: Data<Database>,
    cookie_config: Data<CookieConfig>,
) -> Result<HttpResponse, AppError> {
    let Some(ctx) = load_request_context(db.get_ref(), &request, &cookie_config).await? else {
        return Err(AppError::unauthorized());
    };
    let mut response = db
        .db
        .query("SELECT id, client_id, client_name, scope, created_at FROM mcp_oauth_grant WHERE user_id = $user_id ORDER BY created_at DESC")
        .bind(("user_id", ctx.user.id))
        .await
        .map_err(|error| crate::log_and_convert!(AppError::database, "mcp_oauth.grants.list", error))?;
    let rows: Vec<GrantListRow> = response.take(0).map_err(|error| {
        crate::log_and_convert!(AppError::database, "mcp_oauth.grants.decode", error)
    })?;
    Ok(HttpResponse::Ok().json(
        rows.into_iter()
            .map(ConnectedGrant::from)
            .collect::<Vec<_>>(),
    ))
}

#[derive(Debug, Deserialize, SurrealValue)]
struct GrantListRow {
    id: surrealdb::types::RecordId,
    client_id: String,
    client_name: String,
    scope: String,
    created_at: Datetime,
}

impl From<GrantListRow> for ConnectedGrant {
    fn from(row: GrantListRow) -> Self {
        ConnectedGrant {
            id: crate::database::record_id_string(&row.id),
            client_id: row.client_id,
            client_name: row.client_name,
            scope: row.scope,
            created_at: DateTime::<Utc>::from(row.created_at),
        }
    }
}

#[utoipa::path(
    delete,
    path = "/api/v1/mcp/oauth/grants/{grant_id}",
    params(("grant_id" = String, Path, description = "OAuth grant to disconnect")),
    responses(
        (status = 204, description = "Grant and its tokens revoked"),
        (status = 401, description = "App session required", body = crate::docs::Problem, content_type = "application/problem+json"),
        (status = 403, description = "Cross-origin request rejected", body = crate::docs::Problem, content_type = "application/problem+json"),
        (status = 404, description = "Grant not found", body = crate::docs::Problem, content_type = "application/problem+json")
    ),
    security(("SessionCookie" = [])),
    tag = "MCP OAuth"
)]
#[delete("/grants/{grant_id}")]
pub(crate) async fn revoke_grant(
    request: HttpRequest,
    path: Path<String>,
    db: Data<Database>,
    cookie_config: Data<CookieConfig>,
    config: Data<McpOauthConfig>,
) -> Result<HttpResponse, AppError> {
    if !same_origin(&request, &config) {
        return Err(AppError::forbidden());
    }
    let Some(ctx) = load_request_context(db.get_ref(), &request, &cookie_config).await? else {
        return Err(AppError::unauthorized());
    };
    if !grant_exists(db.get_ref(), &path, &ctx.user.id).await? {
        return Err(AppError::NotFound("OAuth grant not found".into()));
    }
    delete_grant_family(db.get_ref(), &path).await?;
    Ok(HttpResponse::NoContent().finish())
}

pub(super) async fn authenticate_access_token(
    db: &Database,
    access_token: &str,
    resource: String,
) -> Option<super::McpIdentity> {
    if access_token.len() < 40 || access_token.len() > 128 {
        return None;
    }
    let record = select_record::<AccessTokenRecord>(db, "mcp_oauth_access", &hash(access_token))
        .await
        .ok()??;
    if !not_expired(record.expires_at)
        || record.scope.split_whitespace().all(|scope| scope != SCOPE)
        || record.resource != resource
    {
        return None;
    }
    if !grant_exists(db, &record.grant_id, &record.user_id)
        .await
        .ok()?
    {
        return None;
    }
    let ctx = crate::auth::load_authorization_context_for_user(db, &record.user_id)
        .await
        .ok()??;
    Some(super::McpIdentity { authorization: ctx })
}

async fn grant_exists(db: &Database, grant_id: &str, user_id: &str) -> Result<bool, AppError> {
    Ok(
        select_record::<GrantRecord>(db, "mcp_oauth_grant", grant_id)
            .await?
            .is_some_and(|record| record.user_id == user_id),
    )
}

async fn delete_grant_family(db: &Database, grant_id: &str) -> Result<(), AppError> {
    let mut response = db
        .db
        .query(
            "BEGIN TRANSACTION;\
             DELETE mcp_oauth_access WHERE grant_id = $grant_id;\
             DELETE mcp_oauth_refresh WHERE grant_id = $grant_id;\
             DELETE type::record('mcp_oauth_grant', $grant_id);\
             COMMIT;",
        )
        .bind(("grant_id", grant_id.to_owned()))
        .await
        .map_err(|error| {
            crate::log_and_convert!(AppError::database, "mcp_oauth.grant.revoke", error)
        })?;
    crate::database::surreal_take_errors("mcp_oauth.grant.revoke", &mut response)?;
    response.check().map_err(|error| {
        crate::log_and_convert!(AppError::database, "mcp_oauth.grant.revoke", error)
    })?;
    Ok(())
}

async fn cleanup_expired_oauth_records(db: &Database) -> Result<(), AppError> {
    let mut response = db
        .db
        .query(
            "DELETE mcp_oauth_request WHERE expires_at <= time::now();\
             DELETE mcp_oauth_code WHERE expires_at <= time::now();\
             DELETE mcp_oauth_access WHERE expires_at <= time::now();\
             DELETE mcp_oauth_refresh WHERE expires_at <= time::now();",
        )
        .await
        .map_err(|error| crate::log_and_convert!(AppError::database, "mcp_oauth.cleanup", error))?;
    crate::database::surreal_take_errors("mcp_oauth.cleanup", &mut response)?;
    response
        .check()
        .map_err(|error| crate::log_and_convert!(AppError::database, "mcp_oauth.cleanup", error))?;
    Ok(())
}

async fn create_record<T: SurrealValue>(
    db: &Database,
    table: &str,
    id: &str,
    record: T,
) -> Result<(), AppError> {
    db.db
        .create::<Option<surrealdb::types::Value>>((table, id.to_owned()))
        .content(record)
        .await
        .map_err(|error| {
            crate::log_and_convert!(AppError::database, "mcp_oauth.record.create", error)
        })?;
    Ok(())
}

async fn select_record<T: SurrealValue>(
    db: &Database,
    table: &str,
    id: &str,
) -> Result<Option<T>, AppError> {
    db.db.select((table, id.to_owned())).await.map_err(|error| {
        crate::log_and_convert!(AppError::database, "mcp_oauth.record.select", error)
    })
}

async fn take_record<T: SurrealValue>(
    db: &Database,
    table: &str,
    id: &str,
) -> Result<Option<T>, AppError> {
    let mut response = db
        .db
        .query("DELETE FROM type::record($table, $id) RETURN BEFORE")
        .bind(("table", table.to_owned()))
        .bind(("id", id.to_owned()))
        .await
        .map_err(|error| {
            crate::log_and_convert!(AppError::database, "mcp_oauth.record.take", error)
        })?;
    response.take(0).map_err(|error| {
        crate::log_and_convert!(AppError::database, "mcp_oauth.record.take_decode", error)
    })
}

fn not_expired(expires_at: Datetime) -> bool {
    DateTime::<Utc>::from(expires_at) > Utc::now()
}

fn verify_pkce(verifier: &str, expected_challenge: &str) -> bool {
    if !(43..=128).contains(&verifier.len())
        || !verifier
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || b"-._~".contains(&byte))
    {
        return false;
    }
    let digest = digest(&SHA256, verifier.as_bytes());
    let actual = base64_url(digest.as_ref());
    bool::from(actual.as_bytes().ct_eq(expected_challenge.as_bytes()))
}

fn valid_code_challenge(challenge: &str) -> bool {
    challenge.len() == 43
        && challenge
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-' || byte == b'_')
}

fn same_origin(request: &HttpRequest, config: &McpOauthConfig) -> bool {
    let Some(origin) = request
        .headers()
        .get(actix_web::http::header::ORIGIN)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| Url::parse(value).ok())
    else {
        return false;
    };
    let Ok(expected) = Url::parse(config.issuer()) else {
        return false;
    };
    same_url_origin(&origin, &expected)
        || Url::parse(&format!(
            "{}://{}",
            request.connection_info().scheme(),
            request.connection_info().host()
        ))
        .is_ok_and(|request_origin| same_url_origin(&origin, &request_origin))
}

fn same_url_origin(left: &Url, right: &Url) -> bool {
    left.scheme() == right.scheme()
        && left.host_str() == right.host_str()
        && left.port_or_known_default() == right.port_or_known_default()
}

fn random_token() -> Result<String, AppError> {
    let mut bytes = [0u8; 32];
    SystemRandom::new()
        .fill(&mut bytes)
        .map_err(|_| AppError::database("secure random token generation failed"))?;
    Ok(base64_url(&bytes))
}

fn hash(value: &str) -> String {
    hex::encode(digest(&SHA256, value.as_bytes()).as_ref())
}

fn base64_url(input: &[u8]) -> String {
    const ALPHABET: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    let mut output = String::with_capacity(input.len().div_ceil(3) * 4);
    for chunk in input.chunks(3) {
        let a = chunk[0] as usize;
        let b = chunk.get(1).copied().unwrap_or(0) as usize;
        let c = chunk.get(2).copied().unwrap_or(0) as usize;
        output.push(ALPHABET[a >> 2] as char);
        output.push(ALPHABET[((a & 0x03) << 4) | (b >> 4)] as char);
        if chunk.len() > 1 {
            output.push(ALPHABET[((b & 0x0f) << 2) | (c >> 6)] as char);
        }
        if chunk.len() > 2 {
            output.push(ALPHABET[c & 0x3f] as char);
        }
    }
    output
}

fn oauth_error(code: &str, description: &str) -> HttpResponse {
    HttpResponse::BadRequest()
        .insert_header((actix_web::http::header::CACHE_CONTROL, "no-store"))
        .insert_header((actix_web::http::header::PRAGMA, "no-cache"))
        .json(json!({
            "error": code,
            "error_description": description,
        }))
}

#[cfg(test)]
mod tests {
    use actix_web::{App, test, web::Data};
    use serde_json::Value;

    use super::{
        McpOauthConfig, authorization_server_metadata, protected_resource_mcp,
        protected_resource_root,
    };

    #[actix_web::test]
    async fn discovery_metadata_publishes_one_issuer_and_resource() {
        let config = Data::new(
            McpOauthConfig::new("https://app.example.test/".to_owned())
                .expect("valid public origin"),
        );
        let app = test::init_service(
            App::new()
                .app_data(config)
                .service(authorization_server_metadata)
                .service(protected_resource_root)
                .service(protected_resource_mcp),
        )
        .await;

        let authorization_response = test::call_service(
            &app,
            test::TestRequest::get()
                .uri("/.well-known/oauth-authorization-server")
                .to_request(),
        )
        .await;
        assert_eq!(
            authorization_response.status(),
            actix_web::http::StatusCode::OK
        );
        let authorization: Value = test::read_body_json(authorization_response).await;
        assert_eq!(authorization["issuer"], "https://app.example.test");
        assert_eq!(
            authorization["authorization_endpoint"],
            "https://app.example.test/oauth/authorize"
        );
        assert_eq!(
            authorization["token_endpoint"],
            "https://app.example.test/oauth/token"
        );

        for path in [
            "/.well-known/oauth-protected-resource",
            "/.well-known/oauth-protected-resource/mcp",
        ] {
            let response =
                test::call_service(&app, test::TestRequest::get().uri(path).to_request()).await;
            assert_eq!(response.status(), actix_web::http::StatusCode::OK);
            let resource: Value = test::read_body_json(response).await;
            assert_eq!(resource["resource"], "https://app.example.test/mcp");
            assert_eq!(
                resource["authorization_servers"][0],
                authorization["issuer"]
            );
        }
    }

    #[actix_web::test]
    async fn public_base_url_must_be_an_origin() {
        assert!(McpOauthConfig::new("https://app.example.test/nested".to_owned()).is_err());
        assert!(McpOauthConfig::new("file:///tmp".to_owned()).is_err());
        assert!(McpOauthConfig::new("https://user@app.example.test".to_owned()).is_err());
    }
}
