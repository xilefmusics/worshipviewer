use std::env;
use std::fs;
use std::io;
use std::path::PathBuf;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use toml::de::Error as TomlError;

use dirs::home_dir;

use shared::net::HttpClientConfig;

const DEFAULT_BASE_URL: &str = "http://127.0.0.1:8080";

#[derive(Debug, Clone, Default)]
pub struct BuildConfigOptions {
    pub base_url: Option<String>,
    pub sso_session: Option<String>,
    pub bearer_token: Option<String>,
    pub timeout_secs: Option<u64>,
}

impl BuildConfigOptions {
    pub fn from_cli(cli: &crate::commands::Cli) -> Self {
        Self {
            base_url: cli.base_url.clone(),
            sso_session: cli.sso_session.clone(),
            bearer_token: cli.bearer_token.clone(),
            timeout_secs: cli.timeout_secs,
        }
    }
}

#[derive(Debug, Deserialize, Serialize, Default)]
pub struct FileConfig {
    pub base_url: Option<String>,
    pub sso_session: Option<String>,
}

pub fn load_file_config() -> Result<FileConfig, Box<dyn std::error::Error>> {
    let home: PathBuf = home_dir().ok_or_else(|| {
        io::Error::other("failed to determine home directory")
    })?;

    let path = home.join(".worshipviewer").join("config.toml");
    let contents = match fs::read_to_string(&path) {
        Ok(c) => c,
        Err(err) if err.kind() == io::ErrorKind::NotFound => {
            let dir = path.parent().unwrap();
            fs::create_dir_all(dir)?;
            let default_cfg = FileConfig {
                base_url: Some(DEFAULT_BASE_URL.into()),
                sso_session: None,
            };
            let toml_str = toml::to_string(&default_cfg)
                .map_err(|e: toml::ser::Error| -> Box<dyn std::error::Error> { Box::new(e) })?;
            fs::write(&path, toml_str)?;
            return Ok(default_cfg);
        }
        Err(err) => return Err(Box::new(err)),
    };

    let cfg: FileConfig = toml::from_str(&contents)
        .map_err(|e: TomlError| -> Box<dyn std::error::Error> { Box::new(e) })?;
    Ok(cfg)
}

fn resolve_base_url(cli_base: Option<String>, file_cfg: &FileConfig) -> String {
    let env_base = env::var("WORSHIPVIEWER_BASE_URL").ok();
    cli_base
        .or(env_base)
        .or(file_cfg.base_url.clone())
        .unwrap_or_else(|| DEFAULT_BASE_URL.to_string())
}

fn resolve_sso_session(cli_sso: Option<String>, file_cfg: &FileConfig) -> Option<String> {
    let env_sso = env::var("WORSHIPVIEWER_SSO_SESSION").ok();
    cli_sso.or(env_sso).or(file_cfg.sso_session.clone())
}

pub fn build_http_client_config(
    options: &BuildConfigOptions,
) -> Result<(HttpClientConfig, String), Box<dyn std::error::Error>> {
    let file_config = load_file_config().unwrap_or_default();
    let base_url = resolve_base_url(options.base_url.clone(), &file_config);
    let sso_session = resolve_sso_session(options.sso_session.clone(), &file_config);
    let timeout = options
        .timeout_secs
        .map(|secs| Duration::from_secs(secs.max(1)));
    let config = HttpClientConfig {
        base_url: base_url.clone(),
        timeout,
        session_cookie: sso_session,
        bearer_token: options.bearer_token.clone(),
        client_ident: Some(concat!("worshipviewer-cli/", env!("CARGO_PKG_VERSION")).to_string()),
    };
    Ok((config, base_url))
}
