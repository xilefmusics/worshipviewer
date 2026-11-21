use std::{convert::Infallible, sync::Arc};

use actix_web::{
    HttpRequest, HttpResponse, post,
    web::{self, Data},
};
use bytes::Bytes;
use futures_util::{StreamExt, TryStreamExt};
use http_body_util::{BodyExt, Full};
use rmcp::{
    ErrorData, RoleServer, ServerHandler,
    handler::server::wrapper::Parameters,
    model::{CallToolResult, Implementation, ProtocolVersion, ServerCapabilities, ServerConfig},
    service::RequestContext,
    tool, tool_handler, tool_router,
    transport::streamable_http_server::{
        StreamableHttpServerConfig, StreamableHttpService, session::never::NeverSessionManager,
    },
};
use serde::Deserialize;
use serde_json::{Value, json};
use shared::api::{ListQuery, SongListQuery};

use crate::{
    auth::AuthorizationContext,
    error::AppError,
    resources::{
        collection::service::CollectionServiceHandle, setlist::service::SetlistServiceHandle,
        song::service::SongServiceHandle,
    },
};

#[derive(Clone)]
pub struct McpIdentity {
    pub authorization: AuthorizationContext,
}

#[derive(Clone)]
struct McpServer {
    songs: SongServiceHandle,
    setlists: SetlistServiceHandle,
    collections: CollectionServiceHandle,
}

#[derive(Debug, Deserialize, rmcp::schemars::JsonSchema)]
struct SearchArgs {
    #[serde(default)]
    q: Option<String>,
    #[serde(default)]
    team: Option<String>,
    #[serde(default)]
    page: Option<u32>,
    #[serde(default)]
    page_size: Option<u32>,
}

#[derive(Debug, Deserialize, rmcp::schemars::JsonSchema)]
struct IdArgs {
    id: String,
}

#[tool_router]
impl McpServer {
    #[tool(
        name = "search_songs",
        description = "Search songs the signed-in user can read. Supports q, team, page, and page_size."
    )]
    async fn search_songs(
        &self,
        Parameters(args): Parameters<SearchArgs>,
        context: RequestContext<RoleServer>,
    ) -> Result<CallToolResult, ErrorData> {
        let authorization = request_authorization(&context)?;
        let page = bounded_page_size(args.page_size)?;
        let query = SongListQuery {
            page: args.page,
            page_size: Some(page),
            q: bounded_query(args.q)?,
            team: args.team,
            ..SongListQuery::default()
        };
        let songs = self
            .songs
            .list_songs_for_user(&authorization, query.clone())
            .await
            .map_err(tool_error)?;
        let total = self
            .songs
            .count_songs_for_user(&authorization, &query)
            .await
            .map_err(tool_error)?;
        structured(json!({ "items": songs, "total": total }))
    }

    #[tool(
        name = "get_song",
        description = "Get one song by id if the signed-in user can read it."
    )]
    async fn get_song(
        &self,
        Parameters(args): Parameters<IdArgs>,
        context: RequestContext<RoleServer>,
    ) -> Result<CallToolResult, ErrorData> {
        let authorization = request_authorization(&context)?;
        let song = self
            .songs
            .get_song_for_user(&authorization, &args.id)
            .await
            .map_err(tool_error)?;
        structured(json!(song))
    }

    #[tool(
        name = "search_setlists",
        description = "Search setlists the signed-in user can read. Supports q, team, page, and page_size."
    )]
    async fn search_setlists(
        &self,
        Parameters(args): Parameters<SearchArgs>,
        context: RequestContext<RoleServer>,
    ) -> Result<CallToolResult, ErrorData> {
        let authorization = request_authorization(&context)?;
        let query = list_query(args)?;
        let setlists = self
            .setlists
            .list_setlists_for_user(&authorization, query.clone())
            .await
            .map_err(tool_error)?;
        let total = self
            .setlists
            .count_setlists_for_user(&authorization, &query)
            .await
            .map_err(tool_error)?;
        structured(json!({ "items": setlists, "total": total }))
    }

    #[tool(
        name = "get_setlist",
        description = "Get one setlist by id if the signed-in user can read it."
    )]
    async fn get_setlist(
        &self,
        Parameters(args): Parameters<IdArgs>,
        context: RequestContext<RoleServer>,
    ) -> Result<CallToolResult, ErrorData> {
        let authorization = request_authorization(&context)?;
        let setlist = self
            .setlists
            .get_setlist_for_user(&authorization, &args.id)
            .await
            .map_err(tool_error)?;
        structured(json!(setlist))
    }

    #[tool(
        name = "search_collections",
        description = "Search collections the signed-in user can read. Supports q, team, page, and page_size."
    )]
    async fn search_collections(
        &self,
        Parameters(args): Parameters<SearchArgs>,
        context: RequestContext<RoleServer>,
    ) -> Result<CallToolResult, ErrorData> {
        let authorization = request_authorization(&context)?;
        let query = list_query(args)?;
        let collections = self
            .collections
            .list_collections_for_user(&authorization, query.clone())
            .await
            .map_err(tool_error)?;
        let total = self
            .collections
            .count_collections_for_user(&authorization, &query)
            .await
            .map_err(tool_error)?;
        structured(json!({ "items": collections, "total": total }))
    }

    #[tool(
        name = "get_collection",
        description = "Get one collection by id if the signed-in user can read it."
    )]
    async fn get_collection(
        &self,
        Parameters(args): Parameters<IdArgs>,
        context: RequestContext<RoleServer>,
    ) -> Result<CallToolResult, ErrorData> {
        let authorization = request_authorization(&context)?;
        let collection = self
            .collections
            .get_collection_for_user(&authorization, &args.id)
            .await
            .map_err(tool_error)?;
        structured(json!(collection))
    }
}

#[tool_handler]
impl ServerHandler for McpServer {
    fn get_info(&self) -> ServerConfig {
        ServerConfig::new(ServerCapabilities::builder().enable_tools().build())
            .with_protocol_version(ProtocolVersion::V_2026_07_28)
            .with_server_info(Implementation::new("worshipviewer", env!("CARGO_PKG_VERSION")))
            .with_instructions("Read-only access to songs, setlists, and collections available to your WorshipViewer account.")
    }

    fn supported_protocol_versions(&self) -> std::borrow::Cow<'static, [ProtocolVersion]> {
        std::borrow::Cow::Borrowed(&[ProtocolVersion::V_2026_07_28])
    }
}

fn request_authorization(
    context: &RequestContext<RoleServer>,
) -> Result<AuthorizationContext, ErrorData> {
    let parts = context
        .extensions
        .get::<http::request::Parts>()
        .ok_or_else(|| ErrorData::internal_error("Missing HTTP request context", None))?;
    let identity = parts
        .extensions
        .get::<McpIdentity>()
        .ok_or_else(|| ErrorData::internal_error("Missing authenticated MCP identity", None))?;
    Ok(identity.authorization.clone())
}

fn bounded_query(query: Option<String>) -> Result<Option<String>, ErrorData> {
    let Some(query) = query else {
        return Ok(None);
    };
    let query = query.trim();
    if query.len() > 200 {
        return Err(ErrorData::invalid_params(
            "q must be 200 characters or fewer",
            None,
        ));
    }
    Ok((!query.is_empty()).then(|| query.to_owned()))
}

fn bounded_page_size(page_size: Option<u32>) -> Result<u32, ErrorData> {
    let page_size = page_size.unwrap_or(20);
    if page_size == 0 || page_size > 100 {
        return Err(ErrorData::invalid_params(
            "page_size must be between 1 and 100",
            None,
        ));
    }
    Ok(page_size)
}

fn list_query(args: SearchArgs) -> Result<ListQuery, ErrorData> {
    let query = ListQuery {
        page: args.page,
        page_size: Some(bounded_page_size(args.page_size)?),
        q: bounded_query(args.q)?,
        team: args.team,
    };
    query
        .validate()
        .map_err(|message| ErrorData::invalid_params(message, None))
}

fn structured(value: Value) -> Result<CallToolResult, ErrorData> {
    Ok(CallToolResult::structured(value))
}

fn tool_error(error: AppError) -> ErrorData {
    let _ = error;
    ErrorData::internal_error("The requested Worship Viewer data could not be read", None)
}

#[derive(Clone)]
pub struct McpGateway {
    service: StreamableHttpService<McpServer, NeverSessionManager>,
}

impl McpGateway {
    pub fn new(
        songs: SongServiceHandle,
        setlists: SetlistServiceHandle,
        collections: CollectionServiceHandle,
        public_base_url: &str,
    ) -> Self {
        let authority = url::Url::parse(public_base_url)
            .ok()
            .and_then(|url| {
                url.host_str().map(|host| match url.port() {
                    Some(port) => format!("{host}:{port}"),
                    None => host.to_owned(),
                })
            })
            .unwrap_or_else(|| "localhost".to_owned());
        let config = StreamableHttpServerConfig::default()
            .with_legacy_session_mode(false)
            .with_json_response(true)
            .with_stateless_protocol_metadata_required(true)
            .with_allowed_hosts([authority, "localhost".to_owned(), "127.0.0.1".to_owned()]);
        let server = McpServer {
            songs,
            setlists,
            collections,
        };
        let manager = Arc::new(NeverSessionManager::default());
        let service = StreamableHttpService::new(move || Ok(server.clone()), manager, config);
        Self { service }
    }
}

#[utoipa::path(
    post,
    path = "/mcp",
    responses(
        (status = 200, description = "MCP Streamable HTTP response"),
        (status = 401, description = "A valid OAuth bearer token is required", headers(("WWW-Authenticate" = String, description = "Protected resource metadata URL"))),
        (status = 413, description = "MCP request exceeds the 4 MiB body limit")
    ),
    security(("McpAccessToken" = [])),
    tag = "MCP"
)]
#[post("")]
pub(crate) async fn handle(
    request: HttpRequest,
    payload: web::Payload,
    gateway: Data<McpGateway>,
    db: Data<crate::database::Database>,
    oauth_config: Data<super::oauth::McpOauthConfig>,
) -> HttpResponse {
    let Some((scheme, token)) = request
        .headers()
        .get(actix_web::http::header::AUTHORIZATION)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.split_once(' '))
    else {
        return oauth_challenge(&oauth_config, "invalid_token");
    };
    if !scheme.eq_ignore_ascii_case("Bearer") || token.trim().is_empty() {
        return oauth_challenge(&oauth_config, "invalid_token");
    }
    let Some(identity) = super::oauth::authenticate_access_token(
        db.get_ref(),
        token.trim(),
        oauth_config.resource(),
    )
    .await
    else {
        return oauth_challenge(&oauth_config, "invalid_token");
    };

    let mut payload = payload;
    let mut body = bytes::BytesMut::new();
    while let Some(chunk) = payload.next().await {
        let Ok(chunk) = chunk else {
            return HttpResponse::BadRequest().finish();
        };
        if body.len().saturating_add(chunk.len()) > 4 * 1024 * 1024 {
            return HttpResponse::PayloadTooLarge().finish();
        }
        body.extend_from_slice(&chunk);
    }

    let mut builder = http::Request::builder()
        .method(request.method().as_str())
        .uri(request.uri().to_string());
    if let Some(headers) = builder.headers_mut() {
        for (name, value) in request.headers() {
            if name != actix_web::http::header::AUTHORIZATION
                && let (Ok(name), Ok(value)) = (
                    http::header::HeaderName::from_bytes(name.as_str().as_bytes()),
                    http::header::HeaderValue::from_bytes(value.as_bytes()),
                )
            {
                headers.append(name, value);
            }
        }
    }
    let mut http_request = match builder.body(Full::new(Bytes::from(body))) {
        Ok(request) => request,
        Err(_) => return HttpResponse::BadRequest().finish(),
    };
    http_request.extensions_mut().insert(identity);

    let mut service = gateway.service.clone();
    let response = match tower_service::Service::call(&mut service, http_request).await {
        Ok(response) => response,
        Err(never) => match never {},
    };
    let (parts, body) = response.into_parts();
    let mut response_builder = HttpResponse::build(
        actix_web::http::StatusCode::from_u16(parts.status.as_u16())
            .unwrap_or(actix_web::http::StatusCode::INTERNAL_SERVER_ERROR),
    );
    for (name, value) in &parts.headers {
        if let (Ok(name), Ok(value)) = (
            actix_web::http::header::HeaderName::from_bytes(name.as_str().as_bytes()),
            actix_web::http::header::HeaderValue::from_bytes(value.as_bytes()),
        ) {
            response_builder.insert_header((name, value));
        }
    }
    let stream = body
        .into_data_stream()
        .map_err(|never: Infallible| match never {});
    response_builder.streaming(stream)
}

fn oauth_challenge(config: &super::oauth::McpOauthConfig, error: &str) -> HttpResponse {
    let resource_metadata = config.endpoint("/.well-known/oauth-protected-resource/mcp");
    HttpResponse::Unauthorized()
        .insert_header((
            actix_web::http::header::WWW_AUTHENTICATE,
            format!("Bearer resource_metadata=\"{resource_metadata}\", error=\"{error}\""),
        ))
        .finish()
}
