# Worship Viewer desktop app

The desktop app is a native Tauri shell around the hosted Worship Viewer service. It downloads the interface and uses the hosted API, so an internet connection is required. It does not run a local backend or keep the app usable offline.

## Install

The web app's **Install app** page offers the PWA and, when available for your platform, the native installer matching the running web app version. Expand **Other versions and platforms** to download installers for other supported platforms or earlier releases.

The backend stores its current release installers in `INSTALLER_CACHE_DIR` (defaults to `/app/installer-cache` in Docker and `installer-cache` in the server working directory otherwise). Mount persistent storage at that path if you want cache files to survive container replacement. Earlier release downloads go directly to GitHub.

Download the latest installer from the [Worship Viewer GitHub releases](https://github.com/xilefmusics/worshipviewer/releases/latest):

- macOS: open the `.dmg` and move Worship Viewer to Applications.
- Windows: run the `.exe` installer.
- Linux: install the `.deb` package or run the AppImage. Linux desktop WebKitGTK dependencies may be needed on minimal distributions.

Google sign-in opens in the system browser and returns to the desktop app. Email one-time-code sign-in is also available in the app. macOS releases are signed and notarized, and Windows releases are signed, when the platform credentials are configured for the release workflow.

The web interface updates when Worship Viewer is deployed. The native shell is updated by installing a newer release from GitHub; the desktop app does not have an automatic updater.

## Develop

Install the project prerequisites listed in [CONTRIBUTING.md](../CONTRIBUTING.md), plus the [Tauri platform prerequisites](https://v2.tauri.app/start/prerequisites/). Install frontend dependencies, then run:

```bash
pnpm -C frontend install
pnpm --filter app tauri:dev
```

The Tauri window loads Vite on `127.0.0.1:5173`, and its API proxy uses the configured local backend. To build an installer locally:

```bash
pnpm --filter app tauri:build
```

The release workflow builds `.dmg` files for Apple Silicon and Intel Macs, an NSIS installer for Windows x64, and `.deb` plus AppImage packages for Linux x64. It runs for plain semantic version tags such as `0.17.0`. macOS signing and notarization use the `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`, `APPLE_ID`, `APPLE_PASSWORD`, and `APPLE_TEAM_ID` repository secrets. Windows signing uses `WINDOWS_CERTIFICATE` (base64 PFX) and `WINDOWS_CERTIFICATE_PASSWORD`. When those credentials are not configured, the corresponding platform build is unsigned.
