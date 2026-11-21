//! Version-matched Tauri installers downloaded from the public GitHub release.

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{Duration, Instant};

use actix_files::NamedFile;
use actix_web::http::header::{self, HeaderValue};
use actix_web::{HttpRequest, HttpResponse, get, web};
use futures_util::future::join_all;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use shared::{
    DesktopInstaller, DesktopInstallerCatalog, DesktopInstallerFormat, DesktopInstallerManifest,
    DesktopInstallerPlatform, DesktopInstallerRelease, DesktopInstallerStatus, error::Problem,
};
use tokio::sync::{Mutex, RwLock};
use tracing::warn;

use crate::error::AppError;

const GITHUB_REPOSITORY: &str = "xilefmusics/worshipviewer";
const GITHUB_API: &str = "https://api.github.com";
const INSTALLER_CACHE_ENV: &str = "INSTALLER_CACHE_DIR";
const RELEASE_CATALOG_TTL: Duration = Duration::from_secs(10 * 60);
static NEXT_PART_FILE: AtomicU64 = AtomicU64::new(0);

/// Same build version passed to Vite as `VITE_APP_VERSION`.
pub const APP_VERSION: &str = match option_env!("APP_VERSION") {
    Some(version) => version,
    None => "0.0.0-dev",
};

#[derive(Clone)]
struct CachedInstaller {
    metadata: DesktopInstaller,
    path: PathBuf,
}

#[derive(Clone)]
struct InstallerSnapshot {
    manifest: DesktopInstallerManifest,
    files: HashMap<String, CachedInstaller>,
}

#[derive(Serialize, Deserialize)]
struct PersistedInstallerManifest {
    version: String,
    installers: Vec<DesktopInstaller>,
}

/// Installer status shared by the public manifest and file download routes.
#[derive(Clone)]
pub struct InstallerService {
    snapshot: Arc<RwLock<InstallerSnapshot>>,
    cache_root: PathBuf,
    catalog: Arc<RwLock<Option<(Instant, DesktopInstallerCatalog)>>>,
    persist_lock: Arc<Mutex<()>>,
}

impl InstallerService {
    /// Start the release check immediately without delaying the HTTP listener.
    pub fn start_download() -> Self {
        let version = APP_VERSION.to_owned();
        let cache_root = installer_cache_root();
        let service = Self {
            snapshot: Arc::new(RwLock::new(InstallerSnapshot::empty(
                version.clone(),
                DesktopInstallerStatus::Checking,
            ))),
            cache_root,
            catalog: Arc::new(RwLock::new(None)),
            persist_lock: Arc::new(Mutex::new(())),
        };
        let task_service = service.clone();
        tokio::spawn(async move {
            task_service.load_persisted_cache(&version).await;
            task_service.download_version(version).await;
        });
        service
    }

    pub fn unavailable(version: impl Into<String>) -> Self {
        Self {
            snapshot: Arc::new(RwLock::new(InstallerSnapshot::empty(
                version.into(),
                DesktopInstallerStatus::Unavailable,
            ))),
            cache_root: installer_cache_root(),
            catalog: Arc::new(RwLock::new(None)),
            persist_lock: Arc::new(Mutex::new(())),
        }
    }

    async fn load_persisted_cache(&self, version: &str) {
        if !is_plain_release_version(version) {
            return;
        }
        let version_dir = self.cache_root.join(version);
        let manifest_path = version_dir.join("manifest.json");
        let manifest_bytes = match tokio::fs::read(&manifest_path).await {
            Ok(bytes) => bytes,
            Err(err) if err.kind() == std::io::ErrorKind::NotFound => return,
            Err(err) => {
                warn!(version, error = %err, "could not read persisted installer manifest");
                return;
            }
        };
        let persisted = match serde_json::from_slice::<PersistedInstallerManifest>(&manifest_bytes)
        {
            Ok(manifest) if manifest.version == version => manifest,
            Ok(_) => {
                warn!(
                    version,
                    "persisted installer manifest has a different version"
                );
                return;
            }
            Err(err) => {
                warn!(version, error = %err, "could not parse persisted installer manifest");
                return;
            }
        };

        let mut files = HashMap::new();
        for mut metadata in persisted.installers {
            if !expected_assets()
                .iter()
                .any(|expected| expected.id == metadata.id)
            {
                continue;
            }
            let path = version_dir.join(&metadata.id);
            if tokio::fs::metadata(&path)
                .await
                .is_ok_and(|file| file.is_file())
            {
                metadata.download_url = format!("/api/v1/installers/{}/download", metadata.id);
                files.insert(metadata.id.clone(), CachedInstaller { metadata, path });
            }
        }

        let mut snapshot = self.snapshot.write().await;
        if snapshot.manifest.version == version {
            snapshot.manifest.installers = sorted_metadata(&files);
            snapshot.files = files;
        }
    }

    async fn download_version(&self, version: String) {
        if !is_plain_release_version(&version) {
            warn!(
                version = %version,
                "no matching desktop release installers: app version is not a plain release tag"
            );
            self.finish_startup_check(&version).await;
            return;
        }

        let client = match Client::builder()
            .connect_timeout(std::time::Duration::from_secs(10))
            .user_agent(concat!("WorshipViewer/", env!("CARGO_PKG_VERSION")))
            .build()
        {
            Ok(client) => client,
            Err(err) => {
                warn!(version = %version, error = %err, "could not create GitHub installer client");
                self.finish_startup_check(&version).await;
                return;
            }
        };

        let release_url = format!("{GITHUB_API}/repos/{GITHUB_REPOSITORY}/releases/tags/{version}");
        let release = match client
            .get(release_url)
            .header("Accept", "application/vnd.github+json")
            .timeout(std::time::Duration::from_secs(20))
            .send()
            .await
            .and_then(reqwest::Response::error_for_status)
        {
            Ok(response) => match response.json::<GitHubRelease>().await {
                Ok(release) if release.tag_name == version => release,
                Ok(release) => {
                    warn!(
                        version = %version,
                        tag = %release.tag_name,
                        "GitHub returned a desktop release with a different tag"
                    );
                    self.finish_startup_check(&version).await;
                    return;
                }
                Err(err) => {
                    warn!(version = %version, error = %err, "could not read GitHub desktop release");
                    self.finish_startup_check(&version).await;
                    return;
                }
            },
            Err(err) => {
                warn!(version = %version, error = %err, "matching GitHub desktop release is unavailable");
                self.finish_startup_check(&version).await;
                return;
            }
        };

        let cache_dir = self.cache_root.join(&version);
        if let Err(err) = tokio::fs::create_dir_all(&cache_dir).await {
            warn!(version = %version, error = %err, "could not create installer cache");
            self.finish_startup_check(&version).await;
            return;
        }

        let cached_ids: std::collections::HashSet<String> =
            self.snapshot.read().await.files.keys().cloned().collect();
        let mut downloads = Vec::new();
        for expected in expected_assets() {
            let Some(asset) = find_asset(&release.assets, &version, &expected) else {
                warn!(
                    version = %version,
                    installer = expected.id,
                    "matching installer is missing from the GitHub release"
                );
                continue;
            };

            let id = expected.id.to_owned();
            let path = cache_dir.join(expected.id);
            let metadata = DesktopInstaller {
                id: id.clone(),
                platform: expected.platform,
                architecture: expected.architecture.to_owned(),
                format: expected.format,
                filename: asset.name.clone(),
                download_url: format!("/api/v1/installers/{}/download", expected.id),
            };
            if cached_ids.contains(&id)
                && tokio::fs::metadata(&path)
                    .await
                    .is_ok_and(|file| file.is_file())
            {
                continue;
            }
            if tokio::fs::metadata(&path)
                .await
                .is_ok_and(|file| file.is_file())
            {
                self.snapshot.write().await.files.insert(
                    id.clone(),
                    CachedInstaller {
                        metadata: metadata.clone(),
                        path: path.clone(),
                    },
                );
                continue;
            }
            let client = client.clone();
            let download_url = asset.browser_download_url.clone();
            downloads.push(async move {
                let result = download_asset(&client, &download_url, &path)
                    .await
                    .map(|()| CachedInstaller { metadata, path });
                (id, result)
            });
        }

        let mut files = self.snapshot.read().await.files.clone();
        for (id, result) in join_all(downloads).await {
            match result {
                Ok(cached) => {
                    files.insert(id, cached);
                }
                Err(err) => warn!(
                    version = %version,
                    installer = %id,
                    error = %err,
                    "could not download GitHub installer"
                ),
            }
        }

        let metadata = sorted_metadata(&files);
        let persisted = PersistedInstallerManifest {
            version: version.clone(),
            installers: metadata.clone(),
        };
        if let Err(err) = self.persist_manifest(&version, &persisted).await {
            warn!(version = %version, error = %err, "could not persist installer manifest");
        }
        let mut snapshot = self.snapshot.write().await;
        if snapshot.manifest.version == version {
            snapshot.manifest.installers = metadata;
            snapshot.manifest.status = if files.is_empty() {
                DesktopInstallerStatus::Unavailable
            } else {
                DesktopInstallerStatus::Ready
            };
            snapshot.files = files;
        }
    }

    async fn finish_startup_check(&self, version: &str) {
        let mut snapshot = self.snapshot.write().await;
        if snapshot.manifest.version == version {
            snapshot.manifest.status = if snapshot.files.is_empty() {
                DesktopInstallerStatus::Unavailable
            } else {
                DesktopInstallerStatus::Ready
            };
        }
    }

    async fn persist_manifest(
        &self,
        version: &str,
        manifest: &PersistedInstallerManifest,
    ) -> Result<(), String> {
        let _guard = self.persist_lock.lock().await;
        let version_dir = self.cache_root.join(version);
        tokio::fs::create_dir_all(&version_dir)
            .await
            .map_err(|err| err.to_string())?;
        let manifest_path = version_dir.join("manifest.json");
        let mut part_path = manifest_path.as_os_str().to_owned();
        part_path.push(format!(".{}.part", std::process::id()));
        let part_path = PathBuf::from(part_path);
        let contents = serde_json::to_vec_pretty(manifest).map_err(|err| err.to_string())?;
        tokio::fs::write(&part_path, contents)
            .await
            .map_err(|err| err.to_string())?;
        tokio::fs::rename(&part_path, &manifest_path)
            .await
            .map_err(|err| err.to_string())
    }

    pub async fn manifest(&self) -> DesktopInstallerManifest {
        self.snapshot.read().await.manifest.clone()
    }

    async fn release_catalog(&self) -> Result<DesktopInstallerCatalog, String> {
        if let Some((fetched_at, catalog)) = self.catalog.read().await.as_ref()
            && fetched_at.elapsed() < RELEASE_CATALOG_TTL
        {
            return Ok(catalog.clone());
        }

        let client = Client::builder()
            .connect_timeout(Duration::from_secs(10))
            .user_agent(concat!("WorshipViewer/", env!("CARGO_PKG_VERSION")))
            .build()
            .map_err(|err| err.to_string())?;
        let releases = client
            .get(format!(
                "{GITHUB_API}/repos/{GITHUB_REPOSITORY}/releases?per_page=100"
            ))
            .header("Accept", "application/vnd.github+json")
            .timeout(Duration::from_secs(20))
            .send()
            .await
            .map_err(|err| err.to_string())?
            .error_for_status()
            .map_err(|err| err.to_string())?
            .json::<Vec<GitHubRelease>>()
            .await
            .map_err(|err| err.to_string())?;

        let mut releases: Vec<_> = releases
            .into_iter()
            .filter(|release| is_plain_release_version(&release.tag_name))
            .map(release_to_catalog_entry)
            .filter(|release| !release.installers.is_empty())
            .collect();
        releases.sort_by(|left, right| compare_versions(&right.version, &left.version));
        let catalog = DesktopInstallerCatalog {
            current_version: APP_VERSION.to_owned(),
            releases,
        };
        *self.catalog.write().await = Some((Instant::now(), catalog.clone()));
        Ok(catalog)
    }

    async fn file(&self, installer_id: &str) -> Option<CachedInstaller> {
        self.snapshot.read().await.files.get(installer_id).cloned()
    }

    #[cfg(test)]
    fn with_file_for_test(version: &str, metadata: DesktopInstaller, path: PathBuf) -> Self {
        let mut files = HashMap::new();
        files.insert(metadata.id.clone(), CachedInstaller { metadata, path });
        Self {
            snapshot: Arc::new(RwLock::new(InstallerSnapshot::from_cached(
                version.to_owned(),
                files,
            ))),
            cache_root: installer_cache_root(),
            catalog: Arc::new(RwLock::new(None)),
            persist_lock: Arc::new(Mutex::new(())),
        }
    }
}

fn installer_cache_root() -> PathBuf {
    std::env::var_os(INSTALLER_CACHE_ENV)
        .filter(|path| !path.is_empty())
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("installer-cache"))
}

fn sorted_metadata(files: &HashMap<String, CachedInstaller>) -> Vec<DesktopInstaller> {
    let mut installers: Vec<_> = files
        .values()
        .map(|cached| cached.metadata.clone())
        .collect();
    installers.sort_by(|left, right| left.id.cmp(&right.id));
    installers
}

fn compare_versions(left: &str, right: &str) -> std::cmp::Ordering {
    let parse = |version: &str| {
        let mut parts = version
            .split('.')
            .map(|part| part.parse::<u64>().unwrap_or(0));
        (
            parts.next().unwrap_or(0),
            parts.next().unwrap_or(0),
            parts.next().unwrap_or(0),
        )
    };
    parse(left).cmp(&parse(right))
}

fn release_to_catalog_entry(release: GitHubRelease) -> DesktopInstallerRelease {
    let version = release.tag_name;
    let installers = expected_assets()
        .into_iter()
        .filter_map(|expected| {
            let asset = find_asset(&release.assets, &version, &expected)?;
            Some(DesktopInstaller {
                id: expected.id.to_owned(),
                platform: expected.platform,
                architecture: expected.architecture.to_owned(),
                format: expected.format,
                filename: asset.name.clone(),
                download_url: asset.browser_download_url.clone(),
            })
        })
        .collect();
    DesktopInstallerRelease {
        version,
        installers,
    }
}

impl InstallerSnapshot {
    fn empty(version: String, status: DesktopInstallerStatus) -> Self {
        Self {
            manifest: DesktopInstallerManifest {
                version,
                status,
                installers: Vec::new(),
            },
            files: HashMap::new(),
        }
    }

    #[cfg(test)]
    fn from_cached(version: String, files: HashMap<String, CachedInstaller>) -> Self {
        let mut installers: Vec<_> = files
            .values()
            .map(|cached| cached.metadata.clone())
            .collect();
        installers.sort_by(|left, right| left.id.cmp(&right.id));
        let status = if installers.is_empty() {
            DesktopInstallerStatus::Unavailable
        } else {
            DesktopInstallerStatus::Ready
        };
        Self {
            manifest: DesktopInstallerManifest {
                version,
                status,
                installers,
            },
            files,
        }
    }
}

struct ExpectedAsset {
    id: &'static str,
    platform: DesktopInstallerPlatform,
    architecture: &'static str,
    format: DesktopInstallerFormat,
    suffix: &'static str,
}

fn expected_assets() -> [ExpectedAsset; 5] {
    [
        ExpectedAsset {
            id: "macos-aarch64-dmg",
            platform: DesktopInstallerPlatform::Macos,
            architecture: "aarch64",
            format: DesktopInstallerFormat::Dmg,
            suffix: "_aarch64.dmg",
        },
        ExpectedAsset {
            id: "macos-x64-dmg",
            platform: DesktopInstallerPlatform::Macos,
            architecture: "x64",
            format: DesktopInstallerFormat::Dmg,
            suffix: "_x64.dmg",
        },
        ExpectedAsset {
            id: "windows-x64-nsis",
            platform: DesktopInstallerPlatform::Windows,
            architecture: "x64",
            format: DesktopInstallerFormat::Nsis,
            suffix: "_x64-setup.exe",
        },
        ExpectedAsset {
            id: "linux-amd64-deb",
            platform: DesktopInstallerPlatform::Linux,
            architecture: "amd64",
            format: DesktopInstallerFormat::Deb,
            suffix: "_amd64.deb",
        },
        ExpectedAsset {
            id: "linux-amd64-appimage",
            platform: DesktopInstallerPlatform::Linux,
            architecture: "amd64",
            format: DesktopInstallerFormat::Appimage,
            suffix: "_amd64.AppImage",
        },
    ]
}

#[derive(Deserialize)]
struct GitHubRelease {
    tag_name: String,
    assets: Vec<GitHubAsset>,
}

#[derive(Deserialize)]
struct GitHubAsset {
    name: String,
    browser_download_url: String,
}

async fn download_asset(client: &Client, url: &str, destination: &PathBuf) -> Result<(), String> {
    use tokio::io::AsyncWriteExt;

    let part_path = destination.with_file_name(format!(
        "{}.{}.{}.part",
        destination
            .file_name()
            .unwrap_or_default()
            .to_string_lossy(),
        std::process::id(),
        NEXT_PART_FILE.fetch_add(1, Ordering::Relaxed)
    ));
    let result = async {
        let mut response = client
            .get(url)
            .timeout(std::time::Duration::from_secs(600))
            .send()
            .await
            .map_err(|err| err.to_string())?
            .error_for_status()
            .map_err(|err| err.to_string())?;
        let mut file = tokio::fs::File::create(&part_path)
            .await
            .map_err(|err| err.to_string())?;
        while let Some(chunk) = response.chunk().await.map_err(|err| err.to_string())? {
            file.write_all(&chunk)
                .await
                .map_err(|err| err.to_string())?;
        }
        file.flush().await.map_err(|err| err.to_string())?;
        tokio::fs::rename(&part_path, destination)
            .await
            .map_err(|err| err.to_string())?;
        Ok(())
    }
    .await;

    if result.is_err() {
        let _ = tokio::fs::remove_file(part_path).await;
    }
    result
}

fn is_plain_release_version(version: &str) -> bool {
    let parts: Vec<_> = version.split('.').collect();
    parts.len() == 3
        && parts
            .iter()
            .all(|part| !part.is_empty() && part.bytes().all(|byte| byte.is_ascii_digit()))
}

fn asset_matches(name: &str, version: &str, expected: &ExpectedAsset) -> bool {
    let lower = name.to_ascii_lowercase();
    let version_token = format!("_{version}_").to_ascii_lowercase();
    lower.contains(&version_token) && lower.ends_with(&expected.suffix.to_ascii_lowercase())
}

fn find_asset<'a>(
    assets: &'a [GitHubAsset],
    version: &str,
    expected: &ExpectedAsset,
) -> Option<&'a GitHubAsset> {
    assets
        .iter()
        .find(|asset| asset_matches(&asset.name, version, expected))
}

#[utoipa::path(
    get,
    path = "/api/v1/installers",
    responses(
        (status = 200, description = "Installers cached for the running app version", body = DesktopInstallerManifest)
    ),
    tag = "Installers"
)]
#[get("/installers")]
pub async fn list_installers(installers: web::Data<InstallerService>) -> HttpResponse {
    HttpResponse::Ok().json(installers.manifest().await)
}

#[utoipa::path(
    get,
    path = "/api/v1/installers/releases",
    responses(
        (status = 200, description = "Published desktop releases and their available installer assets", body = DesktopInstallerCatalog)
    ),
    tag = "Installers"
)]
#[get("/installers/releases")]
pub async fn list_installer_releases(
    installers: web::Data<InstallerService>,
) -> Result<HttpResponse, AppError> {
    match installers.release_catalog().await {
        Ok(catalog) => Ok(HttpResponse::Ok().json(catalog)),
        Err(err) => {
            warn!(error = %err, "could not list GitHub desktop installer releases");
            Err(AppError::Internal(err))
        }
    }
}

#[utoipa::path(
    get,
    path = "/api/v1/installers/{installer_id}/download",
    params(("installer_id" = String, Path, description = "Installer id from the manifest")),
    responses(
        (status = 200, description = "Installer file download", content_type = "application/octet-stream"),
        (status = 404, description = "Installer is not available", body = Problem, content_type = "application/problem+json")
    ),
    tag = "Installers"
)]
#[get("/installers/{installer_id}/download")]
pub async fn download_installer(
    req: HttpRequest,
    path: web::Path<String>,
    installers: web::Data<InstallerService>,
) -> Result<HttpResponse, AppError> {
    let installer_id = path.into_inner();
    let cached = installers
        .file(&installer_id)
        .await
        .ok_or_else(|| AppError::NotFound("installer is unavailable".into()))?;
    let file = NamedFile::open(&cached.path)
        .map_err(|_| AppError::NotFound("installer is unavailable".into()))?;
    let response = file.into_response(&req);
    let safe_filename: String = cached
        .metadata
        .filename
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || "._- ".contains(ch) {
                ch
            } else {
                '_'
            }
        })
        .collect();
    let disposition = HeaderValue::from_str(&format!("attachment; filename=\"{safe_filename}\""))
        .map_err(|err| AppError::Internal(err.to_string()))?;
    let mut response = response;
    response
        .headers_mut()
        .insert(header::CONTENT_DISPOSITION, disposition);
    response.headers_mut().insert(
        header::CONTENT_TYPE,
        HeaderValue::from_static("application/octet-stream"),
    );
    Ok(response)
}

#[cfg(test)]
mod tests {
    use super::{
        Client, ExpectedAsset, GitHubAsset, GitHubRelease, InstallerService,
        PersistedInstallerManifest, asset_matches, download_asset, download_installer,
        expected_assets, find_asset, is_plain_release_version, list_installer_releases,
        list_installers, release_to_catalog_entry,
    };
    use actix_web::{App, http::StatusCode, test as actix_test, web};
    use shared::{
        DesktopInstaller, DesktopInstallerCatalog, DesktopInstallerFormat,
        DesktopInstallerPlatform, DesktopInstallerRelease,
    };
    use std::time::Instant;

    #[test]
    fn accepts_only_plain_three_part_release_versions() {
        assert!(is_plain_release_version("0.17.0"));
        assert!(!is_plain_release_version("0.17.0-5-g123abc"));
        assert!(!is_plain_release_version("main"));
        assert!(!is_plain_release_version("0.17"));
    }

    #[test]
    fn matches_an_asset_only_for_the_exact_version_and_expected_suffix() {
        let expected = ExpectedAsset {
            id: "macos-aarch64-dmg",
            platform: DesktopInstallerPlatform::Macos,
            architecture: "aarch64",
            format: DesktopInstallerFormat::Dmg,
            suffix: "_aarch64.dmg",
        };
        assert!(asset_matches(
            "Worship Viewer_0.17.0_aarch64.dmg",
            "0.17.0",
            &expected
        ));
        assert!(!asset_matches(
            "Worship Viewer_0.16.0_aarch64.dmg",
            "0.17.0",
            &expected
        ));
        assert!(!asset_matches(
            "Worship Viewer_0.17.0_x64.dmg",
            "0.17.0",
            &expected
        ));
    }

    #[test]
    fn missing_release_asset_is_not_selected() {
        let expected = ExpectedAsset {
            id: "windows-x64-nsis",
            platform: DesktopInstallerPlatform::Windows,
            architecture: "x64",
            format: DesktopInstallerFormat::Nsis,
            suffix: "_x64-setup.exe",
        };
        let assets = [GitHubAsset {
            name: "Worship Viewer_0.17.0_aarch64.dmg".into(),
            browser_download_url: "https://github.com/example/installer.dmg".into(),
        }];
        assert!(find_asset(&assets, "0.17.0", &expected).is_none());
    }

    #[test]
    fn release_catalog_includes_each_supported_asset_with_its_github_download_url() {
        let assets = expected_assets()
            .into_iter()
            .map(|expected| GitHubAsset {
                name: format!("Worship Viewer_0.16.0{}", expected.suffix),
                browser_download_url: format!("https://github.com/example/{}", expected.id),
            })
            .collect();
        let entry = release_to_catalog_entry(GitHubRelease {
            tag_name: "0.16.0".into(),
            assets,
        });

        assert_eq!(entry.installers.len(), 5);
        assert!(entry.installers.iter().all(|installer| {
            installer
                .download_url
                .starts_with("https://github.com/example/")
        }));
    }

    #[tokio::test]
    async fn failed_download_leaves_no_partial_or_cached_file() {
        let dir = tempfile::tempdir().expect("temp dir");
        let destination = dir.path().join("installer.exe");
        let result = download_asset(&Client::new(), "not a valid URL", &destination).await;
        assert!(result.is_err());
        assert!(!destination.exists());
        let mut entries = tokio::fs::read_dir(dir.path())
            .await
            .expect("read temp dir");
        assert!(entries.next_entry().await.expect("read entry").is_none());
    }

    #[tokio::test]
    async fn persisted_installers_load_again_after_service_restart() {
        let dir = tempfile::tempdir().expect("temp dir");
        let version_dir = dir.path().join("0.17.0");
        let path = version_dir.join("macos-aarch64-dmg");
        let metadata = DesktopInstaller {
            id: "macos-aarch64-dmg".into(),
            platform: DesktopInstallerPlatform::Macos,
            architecture: "aarch64".into(),
            format: DesktopInstallerFormat::Dmg,
            filename: "Worship Viewer_0.17.0_aarch64.dmg".into(),
            download_url: String::new(),
        };
        let persisted = PersistedInstallerManifest {
            version: "0.17.0".into(),
            installers: vec![metadata],
        };
        let mut original_service = InstallerService::unavailable("0.17.0");
        original_service.cache_root = dir.path().to_path_buf();
        original_service
            .persist_manifest("0.17.0", &persisted)
            .await
            .expect("persist manifest");
        tokio::fs::write(&path, b"installer bytes")
            .await
            .expect("write installer");

        let mut service = InstallerService::unavailable("0.17.0");
        service.cache_root = dir.path().to_path_buf();
        service.snapshot.write().await.manifest.status = shared::DesktopInstallerStatus::Checking;
        service.load_persisted_cache("0.17.0").await;

        let manifest = service.manifest().await;
        assert_eq!(manifest.status, shared::DesktopInstallerStatus::Checking);
        assert_eq!(manifest.installers.len(), 1);
        assert_eq!(
            manifest.installers[0].download_url,
            "/api/v1/installers/macos-aarch64-dmg/download"
        );
    }

    #[actix_web::test]
    async fn release_catalog_is_public_and_returns_cached_catalog_data() {
        let service = InstallerService::unavailable("0.17.0");
        let catalog = DesktopInstallerCatalog {
            current_version: "0.17.0".into(),
            releases: vec![DesktopInstallerRelease {
                version: "0.16.0".into(),
                installers: vec![],
            }],
        };
        *service.catalog.write().await = Some((Instant::now(), catalog));
        let app = actix_test::init_service(
            App::new()
                .app_data(web::Data::new(service))
                .service(web::scope("/api/v1").service(list_installer_releases)),
        )
        .await;
        let response = actix_test::call_service(
            &app,
            actix_test::TestRequest::get()
                .uri("/api/v1/installers/releases")
                .to_request(),
        )
        .await;

        assert_eq!(response.status(), StatusCode::OK);
        let body: serde_json::Value = actix_test::read_body_json(response).await;
        assert_eq!(body["current_version"], "0.17.0");
        assert_eq!(body["releases"][0]["version"], "0.16.0");
    }

    #[actix_web::test]
    async fn manifest_lists_cached_assets_and_download_serves_as_attachment() {
        let dir = tempfile::tempdir().expect("temp dir");
        let path = dir.path().join("installer.dmg");
        tokio::fs::write(&path, b"installer bytes")
            .await
            .expect("write installer");
        let service = InstallerService::with_file_for_test(
            "0.17.0",
            DesktopInstaller {
                id: "macos-aarch64-dmg".into(),
                platform: DesktopInstallerPlatform::Macos,
                architecture: "aarch64".into(),
                format: DesktopInstallerFormat::Dmg,
                filename: "Worship Viewer_0.17.0_aarch64.dmg".into(),
                download_url: "/api/v1/installers/macos-aarch64-dmg/download".into(),
            },
            path,
        );
        let app = actix_test::init_service(
            App::new()
                .app_data(web::Data::new(service))
                .service(list_installers)
                .service(download_installer),
        )
        .await;

        let manifest = actix_test::call_service(
            &app,
            actix_test::TestRequest::get()
                .uri("/installers")
                .to_request(),
        )
        .await;
        assert_eq!(manifest.status(), StatusCode::OK);
        let manifest_body: serde_json::Value = actix_test::read_body_json(manifest).await;
        assert_eq!(manifest_body["status"], "ready");
        assert_eq!(manifest_body["installers"][0]["id"], "macos-aarch64-dmg");

        let download = actix_test::call_service(
            &app,
            actix_test::TestRequest::get()
                .uri("/installers/macos-aarch64-dmg/download")
                .to_request(),
        )
        .await;
        assert_eq!(download.status(), StatusCode::OK);
        assert_eq!(
            download.headers().get("content-disposition").unwrap(),
            "attachment; filename=\"Worship Viewer_0.17.0_aarch64.dmg\""
        );
        assert_eq!(
            actix_test::read_body(download).await.as_ref(),
            b"installer bytes"
        );
    }
}
