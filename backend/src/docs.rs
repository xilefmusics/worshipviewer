use utoipa::openapi::external_docs::ExternalDocs;
use utoipa::openapi::info::ContactBuilder;
use utoipa::openapi::security::{ApiKey, ApiKeyValue, SecurityScheme};
use utoipa::{Modify, OpenApi};

use crate::settings::Settings;
use shared::AboutResponse;

use crate::resources::blob::PatchBlob;
use crate::resources::collection::PatchCollection;
use crate::resources::monitoring::{
    HttpAuditLog, MonitoringDurationMetrics, MonitoringMetricWindow, MonitoringMetricsDay,
    MonitoringMetricsQuery, MonitoringRequestMetrics, MonitoringUserMetrics,
};
use crate::resources::setlist::PatchSetlist;
use crate::resources::song::{PatchSong, PatchSongData};
use crate::resources::user::Role;
use crate::resources::{
    Blob, Collection, CreateBlob, CreateCollection, CreateSetlist, CreateSong, CreateUser, Setlist,
    Song, UpdateBlob, UpdateCollection, UpdateSetlist, UpdateSong, User,
};
use shared::MoveOwner;
use shared::api::SongListQuery;
use shared::auth::otp::{OtpRequest, OtpVerify};
use shared::blob::{BlobLink, FileType};
use shared::collection::{TransferCollectionSong, TransferCollectionSongResult};
pub use shared::error::{ErrorResponse, Problem, ProblemDetails};
use shared::like::LikeStatus;
use shared::player::{
    Orientation, Player, PlayerBlobItem, PlayerChordsItem, PlayerItem, ScrollType, TocItem,
};
use shared::song::{
    ChordKindSchema, ChordSchema, LineSchema, Link as SongLink, PartSchema, RootSpellingHintSchema,
    SectionSchema, SimpleChordSchema, SongDataSchema, SongUserSpecificAddons,
};
use shared::team::{
    CreateTeam, PatchTeam, Team, TeamInvitation, TeamMember, TeamMemberInput, TeamRole, TeamUser,
    TeamUserRef, UpdateTeam,
};
use shared::user::{HttpAuditMetrics, SessionBody, SessionUserBody};

pub mod rest {
    use super::{Settings, openapi_document};
    use utoipa_swagger_ui::SwaggerUi;

    pub fn scope(settings: Settings) -> SwaggerUi {
        SwaggerUi::new("/api/docs/{_:.*}")
            .url("/api/docs/openapi.json", openapi_document(&settings))
    }
}

/// Apply OpenAPI metadata that depends on deployment (env-backed [`Settings`]) and tag [`externalDocs`].
pub fn openapi_document(settings: &Settings) -> utoipa::openapi::OpenApi {
    let mut doc = ApiDoc::openapi();
    apply_openapi_runtime_metadata(&mut doc, settings);
    doc
}

const BLC_GITHUB_BASE: &str =
    "https://github.com/xilefmusics/worshipviewer/blob/main/docs/business-logic-constraints/";

fn apply_openapi_runtime_metadata(doc: &mut utoipa::openapi::OpenApi, settings: &Settings) {
    let tag_docs: &[(&str, &str)] = &[
        ("Auth", "authentication.md"),
        ("Monitoring", "monitoring.md"),
        ("Users", "user.md"),
        ("Songs", "song.md"),
        ("Collections", "collection.md"),
        ("Blobs", "blob.md"),
        ("Setlists", "setlist.md"),
        ("Teams", "team.md"),
    ];
    if let Some(tags) = doc.tags.as_mut() {
        for tag in tags.iter_mut() {
            if let Some((_, file)) = tag_docs.iter().find(|(n, _)| *n == tag.name) {
                let url = format!("{BLC_GITHUB_BASE}{file}");
                let mut ext = ExternalDocs::new(url);
                ext.description =
                    Some("Business logic constraints (markdown in repository).".into());
                tag.external_docs = Some(ext);
            }
        }
    }
    if settings.openapi_contact_email.is_some() || settings.openapi_imprint_url.is_some() {
        let contact = ContactBuilder::new()
            .name(Some("Worship Viewer"))
            .email(settings.openapi_contact_email.clone())
            .url(settings.openapi_imprint_url.clone())
            .build();
        doc.info.contact = Some(contact);
    }
}

#[derive(OpenApi)]
#[openapi(
    info(
        title = "Worship Viewer API",
        version = "2.0.0",
        description = "Versioned REST API under `/api/v1`. Authentication flows live at `/auth/*` (unversioned); clients should treat that split as stable for this major API generation. Public deployment metadata is available at `GET /api/v1/about` (no authentication).\n\n\
            **Breaking 2.0:** See `docs/api-breaking-2-0.md` for migration (`PlayerItem`, `Song.blobs` as link objects, `Session` wire model, `Problem` without `error`, PUT bodies use `Update*` types in the spec).\n\n\
            **Timestamps:** All timestamps are UTC and use RFC 3339 with a `Z` suffix (e.g. `2026-04-18T12:00:00Z`).\n\n\
            **Identifiers:** Resource IDs are opaque printable strings returned by the API; treat them as opaque and do not parse their internal structure.\n\n\
            **References & expand:** Cross-resource links use objects such as `BlobLink` (`{ \"id\": \"…\" }`) instead of bare id strings where noted. Session list/detail responses default to a narrow `user` link (`id` + `email`); pass `expand=user` (comma-separated with other tokens as added) to embed the full `User`. HTTP audit request counts and last-used timestamps for a single user or session are available from `GET .../metrics` routes next to each single-resource user/session endpoint, not on the `User` / `SessionBody` objects themselves.\n\n\
            **JSON naming:** Object keys use `snake_case`. Enum wire values use the casing shown in each schema (broader enum casing standardization is planned).\n\n\
            **Pagination:** List endpoints accept `page` (0-based) and `page_size` (1–500, default 50). Responses include `X-Total-Count` with the total matching rows before pagination and RFC 5988 `Link` headers (relations: first, prev, next, last) where applicable.\n\n\
            **Rate limiting:** Versioned `/api/v1/*` routes use token-bucket limits per client IP (`Retry-After`, `X-RateLimit-*` on **429**; configurable via server settings).\n\n\
            **Errors:** Failed requests return `Content-Type: application/problem+json` ([RFC 9457](https://www.rfc-editor.org/rfc/rfc9457) Problem Details, formerly RFC 7807) with a `Problem` body (`type`, `title`, `status`, `code`, optional `detail` / `instance`). Use `detail` for human-readable text; stable machine-readable `code` values include: `unauthorized`, `forbidden`, `not_found`, `invalid_request`, `invalid_page_size`, `conflict`, `too_many_requests`, `not_acceptable`, `precondition_failed`, `internal`. Legacy schemas `ErrorResponse` and `ProblemDetails` remain listed for one release but are deprecated in favor of `Problem`.\n\n\
            **CSRF:** Cookie sessions use `SameSite=Lax`; state-changing methods are `POST`/`PUT`/`PATCH`/`DELETE` (not `GET`). Cross-site simple requests cannot mutate state via cookies under typical browser rules. Browser `fetch` from the SPA uses `credentials: 'include'` on same-origin API calls (see `frontend/app/src/api/client.ts`). API clients using bearer tokens should still avoid exposing tokens to third-party origins.\n\n\
            **Examples:** See schema `example` fields on core DTOs in the components section.",
        license(name = "MIT", url = "https://opensource.org/licenses/MIT")
    ),
    servers(
        (url = "/", description = "Same origin as the web app (override per deployment)."),
        (url = "https://app.worshipviewer.com", description = "Production deployment (public web app).")
    ),
    paths(
        crate::about::get_about,
        crate::auth::oidc::rest::login,
        crate::auth::oidc::rest::callback,
        crate::auth::otp::rest::otp_request,
        crate::auth::otp::rest::otp_verify,
        crate::auth::rest::logout,
        crate::resources::user::rest::get_users_me_metrics,
        crate::resources::user::rest::get_user_metrics,
        crate::resources::user::rest::get_users_me,
        crate::resources::user::rest::put_profile_picture,
        crate::resources::user::rest::delete_profile_picture,
        crate::resources::user::rest::get_users,
        crate::resources::user::rest::get_user,
        crate::resources::user::rest::create_user,
        crate::resources::user::rest::delete_user,
        crate::resources::user::session::rest::get_current_session_metrics,
        crate::resources::user::session::rest::get_current_session_for_user,
        crate::resources::user::session::rest::get_sessions_for_current_user,
        crate::resources::user::session::rest::get_session_for_current_user_metrics,
        crate::resources::user::session::rest::get_session_for_current_user,
        crate::resources::user::session::rest::delete_session_for_current_user,
        crate::resources::user::session::rest::get_sessions_for_user,
        crate::resources::user::session::rest::get_session_for_user_metrics,
        crate::resources::user::session::rest::get_session_for_user,
        crate::resources::user::session::rest::create_session_for_user,
        crate::resources::user::session::rest::delete_session_for_user,
        crate::resources::song::rest::get_songs,
        crate::resources::song::rest::get_song,
        crate::resources::song::rest::get_song_player,
        crate::resources::song::rest::create_song,
        crate::resources::song::rest::update_song,
        crate::resources::song::rest::patch_song,
        crate::resources::song::rest::move_song,
        crate::resources::song::rest::delete_song,
        crate::resources::song::rest::get_song_like_status,
        crate::resources::song::rest::put_song_like,
        crate::resources::song::rest::delete_song_like,
        crate::resources::collection::rest::get_collections,
        crate::resources::collection::rest::get_collection,
        crate::resources::collection::rest::get_collection_player,
        crate::resources::collection::rest::get_collection_songs,
        crate::resources::collection::rest::create_collection,
        crate::resources::collection::rest::update_collection,
        crate::resources::collection::rest::put_collection_cover,
        crate::resources::collection::rest::patch_collection,
        crate::resources::collection::rest::move_collection,
        crate::resources::collection::rest::transfer_collection_song,
        crate::resources::collection::rest::delete_collection,
        crate::resources::blob::rest::get_blobs,
        crate::resources::blob::rest::get_blob,
        crate::resources::blob::rest::create_blob,
        crate::resources::blob::rest::update_blob,
        crate::resources::blob::rest::patch_blob,
        crate::resources::blob::rest::move_blob,
        crate::resources::blob::rest::delete_blob,
        crate::resources::blob::rest::download_blob_image,
        crate::resources::blob::rest::upload_blob_data,
        crate::resources::setlist::rest::get_setlists,
        crate::resources::setlist::rest::get_setlist,
        crate::resources::setlist::rest::get_setlist_player,
        crate::resources::setlist::rest::get_setlist_songs,
        crate::resources::setlist::rest::create_setlist,
        crate::resources::setlist::rest::update_setlist,
        crate::resources::setlist::rest::patch_setlist,
        crate::resources::setlist::rest::move_setlist,
        crate::resources::setlist::rest::delete_setlist,
        crate::resources::team::rest::get_teams,
        crate::resources::team::rest::get_team,
        crate::resources::team::rest::create_team,
        crate::resources::team::rest::update_team,
        crate::resources::team::rest::patch_team,
        crate::resources::team::rest::put_team_cover,
        crate::resources::team::rest::delete_team,
        crate::resources::team::invitation::rest::create_team_invitation,
        crate::resources::team::invitation::rest::list_team_invitations,
        crate::resources::team::invitation::rest::get_team_invitation,
        crate::resources::team::invitation::rest::delete_team_invitation,
        crate::resources::team::invitation::rest::accept_team_invitation_under_team,
        crate::resources::team::invitation::rest::accept_team_invitation,
        crate::resources::monitoring::rest::list_http_audit_logs,
        crate::resources::monitoring::rest::get_monitoring_metrics
    ),
    components(
        schemas(
            AboutResponse,
            HttpAuditMetrics,
            User,
            SessionBody,
            SessionUserBody,
            Role,
            CreateUser,
            OtpRequest,
            OtpVerify,
            SongListQuery,
            Problem,
            ErrorResponse,
            ProblemDetails,
            MoveOwner,
            Song,
            CreateSong,
            UpdateSong,
            PatchSong,
            PatchSongData,
            SongDataSchema,
            SimpleChordSchema,
            ChordKindSchema,
            RootSpellingHintSchema,
            ChordSchema,
            PartSchema,
            LineSchema,
            SectionSchema,
            SongUserSpecificAddons,
            Collection,
            CreateCollection,
            UpdateCollection,
            PatchCollection,
            TransferCollectionSong,
            TransferCollectionSongResult,
            Setlist,
            CreateSetlist,
            UpdateSetlist,
            PatchSetlist,
            Blob,
            BlobLink,
            CreateBlob,
            UpdateBlob,
            PatchBlob,
            FileType,
            SongLink,
            LikeStatus,
            Player,
            PlayerItem,
            PlayerBlobItem,
            PlayerChordsItem,
            TocItem,
            ScrollType,
            Orientation,
            Team,
            TeamMember,
            TeamRole,
            TeamUser,
            TeamUserRef,
            CreateTeam,
            UpdateTeam,
            PatchTeam,
            TeamMemberInput,
            TeamInvitation,
            HttpAuditLog,
            MonitoringMetricsQuery,
            MonitoringMetricsDay,
            MonitoringMetricWindow,
            MonitoringUserMetrics,
            MonitoringRequestMetrics,
            MonitoringDurationMetrics
        )
    ),
    tags(
        (name = "About", description = "Public server build and environment metadata (`GET /api/v1/about`)."),
        (name = "Auth", description = "OAuth/OIDC login, OTP email codes, and logout. Session cookies are set on successful auth (see authentication BLC)."),
        (name = "Monitoring", description = "Admin-only operational metrics and request audit listings under `/monitoring/`."),
        (name = "Users", description = "Current user (`/users/me`), directory listing, sessions (own and admin), and admin user lifecycle."),
        (name = "Songs", description = "Song CRUD, player JSON, likes, search/sort listing."),
        (name = "Collections", description = "Owned song collections, nested songs, and player views."),
        (name = "Blobs", description = "Binary image assets: metadata, byte upload/download with cache headers."),
        (name = "Setlists", description = "Ordered sets of songs and player payloads for services."),
        (name = "Teams", description = "Team membership, roles, and invitations (nested under `/teams/{id}/invitations`).")
    ),
    modifiers(&SessionSecurity)
)]
pub struct ApiDoc;

struct SessionSecurity;

impl Modify for SessionSecurity {
    fn modify(&self, openapi: &mut utoipa::openapi::OpenApi) {
        let components = openapi.components.get_or_insert_with(Default::default);
        components.add_security_scheme(
            "SessionCookie",
            SecurityScheme::ApiKey(ApiKey::Cookie(ApiKeyValue::with_description(
                "sso_session",
                "Session cookie returned after a successful authentication flow",
            ))),
        );
        components.add_security_scheme(
            "SessionToken",
            SecurityScheme::ApiKey(ApiKey::Header(ApiKeyValue::with_description(
                "Authorization",
                "Session override using `Authorization: Bearer <session>` header",
            ))),
        );
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn openapi_includes_tag_external_docs() {
        let doc = openapi_document(&Settings::default());
        let v = serde_json::to_value(doc).expect("openapi json");
        let tags = v["tags"].as_array().expect("tags");
        let auth = tags.iter().find(|t| t["name"] == "Auth").expect("Auth tag");
        assert!(
            auth["externalDocs"]["url"]
                .as_str()
                .expect("url")
                .contains("authentication.md")
        );
        let monitoring = tags
            .iter()
            .find(|t| t["name"] == "Monitoring")
            .expect("Monitoring tag");
        assert!(
            monitoring["externalDocs"]["url"]
                .as_str()
                .expect("url")
                .contains("monitoring.md")
        );
    }

    #[test]
    fn openapi_contact_reflects_settings() {
        let s = Settings {
            openapi_contact_email: Some("ops@example.com".into()),
            openapi_imprint_url: Some("https://example.com/imprint".into()),
            ..Default::default()
        };
        let doc = openapi_document(&s);
        let v = serde_json::to_value(doc).expect("openapi json");
        assert_eq!(v["info"]["contact"]["email"], "ops@example.com");
        assert_eq!(v["info"]["contact"]["url"], "https://example.com/imprint");
    }

    /// Normalize JSON object key order for stable snapshot comparison (`backend/openapi.json`).
    fn sort_json_value(v: &mut serde_json::Value) {
        match v {
            serde_json::Value::Object(map) => {
                let keys: Vec<String> = map.keys().cloned().collect();
                let mut sorted = serde_json::Map::new();
                let mut keys = keys;
                keys.sort();
                for k in keys {
                    let mut val = map.remove(&k).unwrap();
                    sort_json_value(&mut val);
                    sorted.insert(k, val);
                }
                *map = sorted;
            }
            serde_json::Value::Array(items) => {
                for item in items.iter_mut() {
                    sort_json_value(item);
                }
            }
            _ => {}
        }
    }

    #[test]
    fn openapi_snapshot_matches_committed_file() {
        let mut got =
            serde_json::to_value(openapi_document(&Settings::default())).expect("openapi json");
        sort_json_value(&mut got);
        let mut expected: serde_json::Value = serde_json::from_str(include_str!(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/openapi.json"
        )))
        .expect("parse backend/openapi.json");
        sort_json_value(&mut expected);
        assert_eq!(
            got, expected,
            "OpenAPI drift: regenerate with `cargo run --example print_openapi --quiet | python3 -c \"import json,sys; json.dump(json.load(sys.stdin), sys.stdout, indent=2, sort_keys=True, ensure_ascii=False)\" > backend/openapi.json`"
        );
    }
}
