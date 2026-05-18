use std::fmt;

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
            gmail_app_password: String::new(),
            gmail_from: String::new(),
            static_dir: "static".into(),
            blob_dir: "blobs".into(),
            blob_upload_max_bytes: 20 * 1024 * 1024,
            avatar_upload_max_bytes: default_avatar_upload_max_bytes(),
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

    pub fn from_env() -> Result<Self, envy::Error> {
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
}
