use std::fmt;
use std::path::Path;

use serde::Deserialize;

#[derive(Clone, Debug)]
pub struct CookieConfig {
    pub name: String,
    pub secure: bool,
    pub session_ttl_seconds: u64,
    pub post_login_path: String,
}

#[derive(Clone, Debug)]
pub struct OtpConfig {
    pub ttl_seconds: u64,
    pub pepper: String,
    pub max_attempts: u32,
    /// When false, OTP verify rejects unknown emails instead of creating a user.
    pub allow_self_signup: bool,
}

#[derive(Clone, Deserialize)]
#[serde(default)]
pub struct Settings {
    pub host: String,
    pub port: u16,
    pub post_login_path: String,
    pub cookie_name: String,
    pub cookie_secure: bool,
    pub session_ttl_seconds: u64,

    pub otp_ttl_seconds: u64,
    pub otp_pepper: String,
    pub otp_max_attempts: u32,
    /// When false, `/auth/otp/verify` requires an existing user (no implicit signup). Default true.
    #[serde(default = "default_otp_allow_self_signup")]
    pub otp_allow_self_signup: bool,

    pub db_address: String,
    pub db_namespace: String,
    pub db_database: String,
    pub db_username: Option<String>,
    pub db_password: Option<String>,
    pub db_migration_path: String,

    pub oidc_issuer_url: String,
    pub oidc_client_id: String,
    pub oidc_client_secret: Option<String>,
    pub oidc_redirect_url: String,
    pub oidc_scopes: Vec<String>,

    pub initial_admin_user_email: Option<String>,
    pub initial_admin_user_test_session: bool,

    /// Optional startup demodata scenario, for example `generic`.
    #[serde(default)]
    pub demodata: Option<String>,

    pub gmail_app_password: String,
    pub gmail_from: String,

    pub static_dir: String,
    pub blob_dir: String,
    /// Maximum allowed size (in bytes) for binary blob uploads via `PUT /blobs/{id}/data`.
    /// Default: 20 MiB.
    pub blob_upload_max_bytes: usize,

    /// Max size for profile picture uploads and OAuth profile image fetches. Default: 2 MiB.
    #[serde(default = "default_avatar_upload_max_bytes")]
    pub avatar_upload_max_bytes: usize,

    /// Directory for media upload staging files. Default: `media-staging`.
    #[serde(default = "default_media_staging_dir")]
    pub media_staging_dir: String,
    /// Directory for promoted final media asset files. Default: `media-assets`.
    #[serde(default = "default_media_final_dir")]
    pub media_final_dir: String,
    /// Default max source video upload size. Default: 2 GiB.
    #[serde(default = "default_media_video_upload_max_bytes")]
    pub media_video_upload_max_bytes: usize,
    /// Default max source audio upload size. Default: 500 MiB.
    #[serde(default = "default_media_audio_upload_max_bytes")]
    pub media_audio_upload_max_bytes: usize,
    /// Default max source PDF upload size. Default: 100 MiB.
    #[serde(default = "default_media_pdf_upload_max_bytes")]
    pub media_pdf_upload_max_bytes: usize,
    /// Default max source image upload size. Default: 25 MiB.
    #[serde(default = "default_media_image_upload_max_bytes")]
    pub media_image_upload_max_bytes: usize,
    /// Bounded processing timeout for in-process slide-deck expansion (seconds). Default: 3600.
    #[serde(default = "default_media_deck_processing_timeout_seconds")]
    pub media_deck_processing_timeout_seconds: u64,
    /// Maximum resulting pages in a slide deck. Default: 500.
    #[serde(default = "default_media_deck_max_pages")]
    pub media_deck_max_pages: u32,
    /// Delete abandoned staging files older than this (seconds). Default: 86400.
    #[serde(default = "default_media_staging_max_age_seconds")]
    pub media_staging_max_age_seconds: u64,
    /// Interval between staging reconciliation runs (seconds). Default: 3600.
    #[serde(default = "default_media_reconciliation_interval_seconds")]
    pub media_reconciliation_interval_seconds: u64,

    /// Requests per second allowed per IP on sensitive auth endpoints (OTP + login).
    /// Default: 1 request per second with a burst of 5.
    pub auth_rate_limit_rps: u64,
    pub auth_rate_limit_burst: u32,

    /// Per-IP rate limit for `/api/v1/*` (token bucket). Defaults are generous for local development.
    pub api_rate_limit_rps: u64,
    pub api_rate_limit_burst: u32,

    /// Shown under `info.contact.email` in OpenAPI when set (`OPENAPI_CONTACT_EMAIL`).
    #[serde(default)]
    pub openapi_contact_email: Option<String>,
    /// Legal imprint / contact page URL under `info.contact.url` when set (`OPENAPI_IMPRINT_URL`).
    #[serde(default)]
    pub openapi_imprint_url: Option<String>,
}

impl fmt::Debug for Settings {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("Settings")
            .field("host", &self.host)
            .field("port", &self.port)
            .field("post_login_path", &self.post_login_path)
            .field("cookie_name", &self.cookie_name)
            .field("cookie_secure", &self.cookie_secure)
            .field("session_ttl_seconds", &self.session_ttl_seconds)
            .field("otp_ttl_seconds", &self.otp_ttl_seconds)
            .field("otp_pepper", &"<redacted>")
            .field("otp_max_attempts", &self.otp_max_attempts)
            .field("otp_allow_self_signup", &self.otp_allow_self_signup)
            .field("db_address", &self.db_address)
            .field("db_namespace", &self.db_namespace)
            .field("db_database", &self.db_database)
            .field("db_username", &self.db_username)
            .field(
                "db_password",
                &self.db_password.as_ref().map(|_| "<redacted>"),
            )
            .field("db_migration_path", &self.db_migration_path)
            .field("oidc_issuer_url", &self.oidc_issuer_url)
            .field("oidc_client_id", &self.oidc_client_id)
            .field(
                "oidc_client_secret",
                &self.oidc_client_secret.as_ref().map(|_| "<redacted>"),
            )
            .field("oidc_redirect_url", &self.oidc_redirect_url)
            .field("oidc_scopes", &self.oidc_scopes)
            .field("initial_admin_user_email", &self.initial_admin_user_email)
            .field("demodata", &self.demodata)
            .field(
                "initial_admin_user_test_session",
                &self.initial_admin_user_test_session,
            )
            .field("gmail_app_password", &"<redacted>")
            .field("gmail_from", &self.gmail_from)
            .field("static_dir", &self.static_dir)
            .field("blob_dir", &self.blob_dir)
            .field("blob_upload_max_bytes", &self.blob_upload_max_bytes)
            .field("avatar_upload_max_bytes", &self.avatar_upload_max_bytes)
            .field("media_staging_dir", &self.media_staging_dir)
            .field("media_final_dir", &self.media_final_dir)
            .field(
                "media_video_upload_max_bytes",
                &self.media_video_upload_max_bytes,
            )
            .field(
                "media_audio_upload_max_bytes",
                &self.media_audio_upload_max_bytes,
            )
            .field(
                "media_pdf_upload_max_bytes",
                &self.media_pdf_upload_max_bytes,
            )
            .field(
                "media_image_upload_max_bytes",
                &self.media_image_upload_max_bytes,
            )
            .field(
                "media_deck_processing_timeout_seconds",
                &self.media_deck_processing_timeout_seconds,
            )
            .field("media_deck_max_pages", &self.media_deck_max_pages)
            .field(
                "media_staging_max_age_seconds",
                &self.media_staging_max_age_seconds,
            )
            .field(
                "media_reconciliation_interval_seconds",
                &self.media_reconciliation_interval_seconds,
            )
            .field("auth_rate_limit_rps", &self.auth_rate_limit_rps)
            .field("auth_rate_limit_burst", &self.auth_rate_limit_burst)
            .field("api_rate_limit_rps", &self.api_rate_limit_rps)
            .field("api_rate_limit_burst", &self.api_rate_limit_burst)
            .field("openapi_contact_email", &self.openapi_contact_email)
            .field("openapi_imprint_url", &self.openapi_imprint_url)
            .finish()
    }
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            host: "127.0.0.1".into(),
            port: 8080,
            post_login_path: "/".into(),
            cookie_name: "sso_session".into(),
            cookie_secure: false,
            session_ttl_seconds: 31536000,
            otp_ttl_seconds: 300,
            otp_pepper: "changeme".into(),
            otp_max_attempts: 5,
            otp_allow_self_signup: true,
            db_address: "mem://".into(),
            db_namespace: "main".into(),
            db_database: "main".into(),
            db_username: None,
            db_password: None,
            db_migration_path: "db-migrations".into(),
            oidc_issuer_url: "https://accounts.google.com".into(),
            oidc_client_id: String::new(),
            oidc_client_secret: None,
            oidc_redirect_url: "http://localhost:8080/auth/callback".into(),
            oidc_scopes: vec!["openid".into(), "profile".into(), "email".into()],
            initial_admin_user_email: None,
            initial_admin_user_test_session: false,
            demodata: None,
            gmail_app_password: String::new(),
            gmail_from: String::new(),
            static_dir: "static".into(),
            blob_dir: "blobs".into(),
            blob_upload_max_bytes: 20 * 1024 * 1024,
            avatar_upload_max_bytes: default_avatar_upload_max_bytes(),
            media_staging_dir: default_media_staging_dir(),
            media_final_dir: default_media_final_dir(),
            media_video_upload_max_bytes: default_media_video_upload_max_bytes(),
            media_audio_upload_max_bytes: default_media_audio_upload_max_bytes(),
            media_pdf_upload_max_bytes: default_media_pdf_upload_max_bytes(),
            media_image_upload_max_bytes: default_media_image_upload_max_bytes(),
            media_deck_processing_timeout_seconds: default_media_deck_processing_timeout_seconds(),
            media_deck_max_pages: default_media_deck_max_pages(),
            media_staging_max_age_seconds: default_media_staging_max_age_seconds(),
            media_reconciliation_interval_seconds: default_media_reconciliation_interval_seconds(),
            auth_rate_limit_rps: 1,
            auth_rate_limit_burst: 5,
            api_rate_limit_rps: 50,
            api_rate_limit_burst: 200,
            openapi_contact_email: None,
            openapi_imprint_url: None,
        }
    }
}

fn default_otp_allow_self_signup() -> bool {
    true
}

fn default_avatar_upload_max_bytes() -> usize {
    2 * 1024 * 1024
}

fn default_media_staging_dir() -> String {
    "media-staging".into()
}

fn default_media_final_dir() -> String {
    "media-assets".into()
}

fn default_media_video_upload_max_bytes() -> usize {
    2 * 1024 * 1024 * 1024
}

fn default_media_audio_upload_max_bytes() -> usize {
    500 * 1024 * 1024
}

fn default_media_pdf_upload_max_bytes() -> usize {
    100 * 1024 * 1024
}

fn default_media_image_upload_max_bytes() -> usize {
    25 * 1024 * 1024
}

fn default_media_deck_processing_timeout_seconds() -> u64 {
    3600
}

fn default_media_deck_max_pages() -> u32 {
    500
}

fn default_media_staging_max_age_seconds() -> u64 {
    86_400
}

fn default_media_reconciliation_interval_seconds() -> u64 {
    3600
}

/// Limits for `PUT /users/me/profile-picture` and OAuth profile image fetches.
#[derive(Clone, Copy, Debug)]
pub struct ProfilePictureLimits {
    pub max_bytes: usize,
}

/// Limits for `PUT /collections/{id}/cover`.
#[derive(Clone, Copy, Debug)]
pub struct CoverUploadLimits {
    pub max_bytes: usize,
}

/// Per-kind upload limits for media asset staging.
#[derive(Clone, Copy, Debug)]
pub struct MediaAssetUploadLimits {
    pub video_max_bytes: usize,
    pub audio_max_bytes: usize,
    pub pdf_max_bytes: usize,
    pub image_max_bytes: usize,
    pub svg_max_bytes: usize,
    /// Largest configured limit (for actix `PayloadConfig` ceiling).
    pub payload_ceiling_bytes: usize,
}

/// Load `.env.local` then `.env` without overriding variables already in the process.
///
/// Higher-priority files are applied first so later loads cannot clobber them.
/// Missing files are ignored. Looks in the current directory (and parents for `.env`)
/// and next to the crate via `CARGO_MANIFEST_DIR` so `cargo run` from the repo root
/// still picks up `backend/.env`.
fn load_dotenv_files() {
    let _ = dotenvy::from_filename(".env.local");
    let crate_dir = option_env!("CARGO_MANIFEST_DIR").map(Path::new);
    if let Some(dir) = crate_dir {
        let _ = dotenvy::from_path(dir.join(".env.local"));
    }
    let _ = dotenvy::dotenv();
    if let Some(dir) = crate_dir {
        let _ = dotenvy::from_path(dir.join(".env"));
    }
}

impl Settings {
    pub fn profile_picture_limits(&self) -> ProfilePictureLimits {
        ProfilePictureLimits {
            max_bytes: self.avatar_upload_max_bytes,
        }
    }

    pub fn cover_upload_limits(&self) -> CoverUploadLimits {
        CoverUploadLimits {
            max_bytes: self.blob_upload_max_bytes,
        }
    }

    pub fn media_asset_upload_limits(&self) -> MediaAssetUploadLimits {
        let svg_max_bytes = self.media_image_upload_max_bytes;
        let payload_ceiling_bytes = [
            self.media_video_upload_max_bytes,
            self.media_audio_upload_max_bytes,
            self.media_pdf_upload_max_bytes,
            self.media_image_upload_max_bytes,
            svg_max_bytes,
        ]
        .into_iter()
        .max()
        .unwrap_or(self.media_video_upload_max_bytes);
        MediaAssetUploadLimits {
            video_max_bytes: self.media_video_upload_max_bytes,
            audio_max_bytes: self.media_audio_upload_max_bytes,
            pdf_max_bytes: self.media_pdf_upload_max_bytes,
            image_max_bytes: self.media_image_upload_max_bytes,
            svg_max_bytes,
            payload_ceiling_bytes,
        }
    }

    pub fn media_deck_processing_timeout(&self) -> std::time::Duration {
        std::time::Duration::from_secs(self.media_deck_processing_timeout_seconds)
    }

    pub fn from_env() -> Result<Self, envy::Error> {
        load_dotenv_files();
        let mut s = envy::from_env::<Self>()?;
        if let Ok(v) = std::env::var("WORSHIP_OTP_ALLOW_SELF_SIGNUP") {
            s.otp_allow_self_signup =
                !(v == "0" || v.eq_ignore_ascii_case("false") || v.eq_ignore_ascii_case("no"));
        }
        Ok(s)
    }

    pub fn cookie_config(&self) -> CookieConfig {
        CookieConfig {
            name: self.cookie_name.clone(),
            secure: self.cookie_secure,
            session_ttl_seconds: self.session_ttl_seconds,
            post_login_path: self.post_login_path.clone(),
        }
    }

    pub fn otp_config(&self) -> OtpConfig {
        OtpConfig {
            ttl_seconds: self.otp_ttl_seconds,
            pepper: self.otp_pepper.clone(),
            max_attempts: self.otp_max_attempts,
            allow_self_signup: self.otp_allow_self_signup,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::Settings;

    #[test]
    fn settings_debug_redacts_secrets() {
        let s = Settings {
            otp_pepper: "unique_pepper_value_123".into(),
            gmail_app_password: "unique_gmail_secret_456".into(),
            db_password: Some("unique_db_pass_789".into()),
            oidc_client_secret: Some("unique_oidc_secret_abc".into()),
            ..Default::default()
        };

        let out = format!("{s:?}");
        assert!(!out.contains("unique_pepper_value_123"));
        assert!(!out.contains("unique_gmail_secret_456"));
        assert!(!out.contains("unique_db_pass_789"));
        assert!(!out.contains("unique_oidc_secret_abc"));
        assert!(out.contains("<redacted>"));
    }

    #[test]
    fn media_asset_upload_limits_defaults() {
        let s = Settings::default();
        let limits = s.media_asset_upload_limits();
        assert_eq!(limits.video_max_bytes, 2 * 1024 * 1024 * 1024);
        assert_eq!(limits.audio_max_bytes, 500 * 1024 * 1024);
        assert_eq!(limits.pdf_max_bytes, 100 * 1024 * 1024);
        assert_eq!(limits.image_max_bytes, 25 * 1024 * 1024);
        assert_eq!(limits.payload_ceiling_bytes, limits.video_max_bytes);
    }
}
