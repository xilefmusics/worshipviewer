use serde::{Deserialize, Serialize};

#[cfg(feature = "backend")]
use utoipa::ToSchema;

/// Operating system for a published Tauri installer.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
#[cfg_attr(feature = "backend", derive(ToSchema))]
pub enum DesktopInstallerPlatform {
    Macos,
    Windows,
    Linux,
}

/// Installer package format published by the desktop release workflow.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
#[cfg_attr(feature = "backend", derive(ToSchema))]
pub enum DesktopInstallerFormat {
    Dmg,
    Nsis,
    Deb,
    Appimage,
}

/// Startup check state for the server's installer cache.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
#[cfg_attr(feature = "backend", derive(ToSchema))]
pub enum DesktopInstallerStatus {
    Checking,
    Ready,
    Unavailable,
}

/// One installer that the running server has downloaded and can serve.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[cfg_attr(feature = "backend", derive(ToSchema))]
pub struct DesktopInstaller {
    /// Stable identifier used by the installer download endpoint.
    pub id: String,
    pub platform: DesktopInstallerPlatform,
    /// Tauri architecture suffix, such as `aarch64`, `x64`, or `amd64`.
    pub architecture: String,
    pub format: DesktopInstallerFormat,
    /// Original GitHub release asset filename.
    pub filename: String,
    /// Download URL for this installer, either same-origin or a GitHub release asset.
    pub download_url: String,
}

/// Installers successfully cached for the frontend's exact release version.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[cfg_attr(feature = "backend", derive(ToSchema))]
pub struct DesktopInstallerManifest {
    pub version: String,
    pub status: DesktopInstallerStatus,
    pub installers: Vec<DesktopInstaller>,
}

/// A GitHub release and its supported Tauri installer assets.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[cfg_attr(feature = "backend", derive(ToSchema))]
pub struct DesktopInstallerRelease {
    pub version: String,
    pub installers: Vec<DesktopInstaller>,
}

/// Installer releases available for manual selection on the install page.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[cfg_attr(feature = "backend", derive(ToSchema))]
pub struct DesktopInstallerCatalog {
    pub current_version: String,
    pub releases: Vec<DesktopInstallerRelease>,
}
