use super::{blob, collection, monitoring, setlist, song, team, user};
use crate::about;
use crate::auth::middleware::RequireUser;
use crate::governor_audit::AuditRateLimit429;
use crate::governor_peer::PeerOrFallbackIpKeyExtractor;
use actix_governor::{Governor, GovernorConfigBuilder};
use actix_web::{dev::HttpServiceFactory, web};

pub fn scope(
    blob_upload_max_bytes: usize,
    avatar_upload_max_bytes: usize,
    api_rate_limit_rps: u64,
    api_rate_limit_burst: u32,
) -> impl HttpServiceFactory {
    let api_governor = GovernorConfigBuilder::default()
        .requests_per_second(api_rate_limit_rps)
        .burst_size(api_rate_limit_burst)
        .key_extractor(PeerOrFallbackIpKeyExtractor)
        .use_headers()
        .finish()
        .expect("API rate-limit configuration");
    web::scope("/api/v1")
        .wrap(Governor::new(&api_governor))
        .wrap(AuditRateLimit429)
        .service(about::get_about)
        .service(
            web::scope("")
                .wrap(RequireUser)
                .service(blob::rest::scope(blob_upload_max_bytes))
                .service(collection::rest::scope(blob_upload_max_bytes))
                .service(setlist::rest::scope())
                .service(song::rest::scope())
                .service(team::rest::scope(blob_upload_max_bytes))
                .service(team::invitations_accept_scope())
                .service(monitoring::rest::scope())
                .service(user::rest::scope(avatar_upload_max_bytes)),
        )
}
