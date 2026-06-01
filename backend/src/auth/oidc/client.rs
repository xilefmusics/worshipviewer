use std::fmt;
use std::str::FromStr;
use std::sync::Arc;

use anyhow::{Context, Result as AnyResult};
use openidconnect::core::{CoreClient, CoreProviderMetadata};
use openidconnect::reqwest::Client as OidcHttpClient;
use openidconnect::{ClientId, ClientSecret, IssuerUrl, RedirectUrl};
use openidconnect::{EndpointMaybeSet, EndpointNotSet, EndpointSet};
use tracing::info;

use crate::settings::Settings;

/// [`CoreClient`] after discovery: auth endpoint set, token endpoint may be present from metadata.
pub type DiscoveredOidcClient = CoreClient<
    EndpointSet,
    EndpointNotSet,
    EndpointNotSet,
    EndpointNotSet,
    EndpointMaybeSet,
    EndpointMaybeSet,
>;

/// Supported OIDC identity provider (Google only in this deployment).
#[derive(Clone, Copy, Debug, Eq, PartialEq, Hash)]
pub enum OidcProvider {
    Google,
}

impl OidcProvider {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Google => "google",
        }
    }
}

impl fmt::Display for OidcProvider {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.as_str())
    }
}

impl FromStr for OidcProvider {
    type Err = ();

    fn from_str(value: &str) -> Result<Self, Self::Err> {
        match value.to_ascii_lowercase().as_str() {
            "google" => Ok(Self::Google),
            _ => Err(()),
        }
    }
}

#[derive(Debug)]
pub struct OidcClientRegistration {
    client: Arc<DiscoveredOidcClient>,
    http: OidcHttpClient,
    scopes: Vec<String>,
}

impl OidcClientRegistration {
    pub fn client(&self) -> &DiscoveredOidcClient {
        self.client.as_ref()
    }

    pub fn http(&self) -> &OidcHttpClient {
        &self.http
    }

    pub fn scopes(&self) -> &[String] {
        &self.scopes
    }
}

#[derive(Debug)]
pub struct OidcClients {
    google: OidcClientRegistration,
}

impl OidcClients {
    pub fn get(&self, provider: &OidcProvider) -> Option<&OidcClientRegistration> {
        match provider {
            OidcProvider::Google => Some(&self.google),
        }
    }

    pub fn default_provider(&self) -> OidcProvider {
        OidcProvider::Google
    }

    /// Short names of OIDC providers with clients in this process (keep in sync with [`build_clients`]).
    pub fn registered_provider_ids(&self) -> Vec<&'static str> {
        vec![OidcProvider::Google.as_str()]
    }
}

pub async fn build_clients(settings: &Settings) -> AnyResult<OidcClients> {
    let (google_client, google_http) = build_client(
        OidcProvider::Google,
        &settings.oidc_issuer_url,
        &settings.oidc_client_id,
        settings.oidc_client_secret.as_deref(),
        &settings.oidc_redirect_url,
    )
    .await?;

    info!(
        event = "oidc.provider.registered",
        provider = %OidcProvider::Google,
        issuer = %settings.oidc_issuer_url,
        scopes = ?settings.oidc_scopes.as_slice(),
        "registered OIDC provider"
    );

    Ok(OidcClients {
        google: OidcClientRegistration {
            client: Arc::new(google_client),
            http: google_http,
            scopes: settings.oidc_scopes.clone(),
        },
    })
}

async fn build_client(
    _provider: OidcProvider,
    issuer_url: &str,
    client_id: &str,
    client_secret: Option<&str>,
    redirect_url: &str,
) -> AnyResult<(DiscoveredOidcClient, OidcHttpClient)> {
    let http = OidcHttpClient::builder()
        // Following redirects opens the client up to SSRF vulnerabilities.
        .redirect(openidconnect::reqwest::redirect::Policy::none())
        .build()
        .context("build OIDC HTTP client")?;
    let issuer = IssuerUrl::new(issuer_url.to_string())
        .with_context(|| "invalid GOOGLE_ISSUER_URL value")?;
    let metadata = CoreProviderMetadata::discover_async(issuer, &http)
        .await
        .with_context(|| "unable to fetch Google provider metadata")?;
    let redirect = RedirectUrl::new(redirect_url.to_string())
        .with_context(|| "invalid GOOGLE_REDIRECT_URL value")?;

    Ok((
        CoreClient::from_provider_metadata(
            metadata,
            ClientId::new(client_id.to_string()),
            client_secret.map(|secret| ClientSecret::new(secret.to_owned())),
        )
        .set_redirect_uri(redirect),
        http,
    ))
}
