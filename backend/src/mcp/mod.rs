pub mod oauth;
pub(crate) mod server;

pub use oauth::McpOauthConfig;
pub use server::{McpGateway, McpIdentity};

pub fn oauth_scope(
    auth_rate_limit_rps: u64,
    auth_rate_limit_burst: u32,
    api_rate_limit_rps: u64,
    api_rate_limit_burst: u32,
) -> actix_web::Scope {
    oauth::scope(
        auth_rate_limit_rps,
        auth_rate_limit_burst,
        api_rate_limit_rps,
        api_rate_limit_burst,
    )
}

pub fn endpoint_scope(rate_limit_rps: u64, rate_limit_burst: u32) -> actix_web::Scope {
    let governor = actix_governor::GovernorConfigBuilder::default()
        .requests_per_second(rate_limit_rps)
        .burst_size(rate_limit_burst)
        .key_extractor(crate::governor_peer::ProblemJsonPeerIpKeyExtractor)
        .finish()
        .expect("valid MCP rate limit configuration");
    let limited = actix_web::web::scope("")
        .wrap(crate::governor_audit::AuditRateLimit429)
        .wrap(actix_governor::Governor::new(&governor))
        .service(server::handle);
    actix_web::web::scope("/mcp").service(limited)
}
