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

The Tauri window loads Vite on `127.0.0.1:5173`, and its API proxy uses the configured local backend. To sign in automatically with the local backend's `admin` test session, start the backend with `INITIAL_ADMIN_USER_TEST_SESSION=true` and run:

```bash
WORSHIPVIEWER_LOCAL_ADMIN=1 \
VITE_DEV_PROXY_TARGET=http://127.0.0.1:17771 \
PORT=5173 HOST=127.0.0.1 \
pnpm --filter app tauri:dev --config '{"identifier":"com.worshipviewer.desktop.preview"}'
```

Use the port configured for your local backend (the default is 8080). This opt-in session is only available from a loopback-bound Vite development server with a loopback backend; it is not part of the production build.

To build an installer locally:

```bash
pnpm --filter app tauri:build
```

The release workflow builds `.dmg` files for Apple Silicon and Intel Macs, an NSIS installer for Windows x64, and `.deb` plus AppImage packages for Linux x64. It runs for plain semantic version tags such as `0.17.0`. macOS signing and notarization use the `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`, `APPLE_ID`, `APPLE_PASSWORD`, and `APPLE_TEAM_ID` repository secrets. Windows signing uses `WINDOWS_CERTIFICATE` (base64 PFX) and `WINDOWS_CERTIFICATE_PASSWORD`. When those credentials are not configured, the corresponding platform build is unsigned.

## Presentation outputs

In AV mode, press the output button in the player toolbar. If an external display is connected, the presentation opens fullscreen on it automatically. Otherwise, a separate window with standard window controls opens for use with Teams, Zoom, OBS, and similar applications. Press the output button again to stop the presentation. The browser version retains its existing output window.

AirPlay on macOS and Miracast on Windows work when connected through the operating system as an **extended** display. Pairing is managed in system settings. The app does not implement Google Cast: a future integration needs a hosted and registered custom receiver, a compatible sender and a secure way to synchronize presentation state and assets. The existing projection command and slide renderer provide the foundation for that work.

The desktop shell and hosted web app update independently; install a current desktop release if the output button reports that native controls are unavailable. Monitor names are not guaranteed to be unique or stable. If the chosen display is disconnected, the app waits for it to return while the AV controller is open. On Linux, especially Wayland, the compositor may refuse window positioning or fullscreen placement. Windows display scaling and system focus policies can affect placement. On macOS, external display output uses simple fullscreen to avoid switching Spaces. Tauri can request reduced background throttling on macOS 14 and later, but does not support that setting on Windows or Linux. These behaviors depend on the window manager and webview.

The share window is a visible application window, not a virtual display, virtual camera, or offscreen renderer. Do not minimize it during a session. Capture of an occluded window and continued video or animation rendering vary by OS and conferencing app; verify the result in the sharing preview. For reliable headless output, investigate an OBS-compatible offscreen rendering integration before introducing virtual display drivers or camera extensions.

### Manual verification checklist

- With two physical monitors, start display output and check fullscreen placement and controller focus.
- With one monitor, open a share window and select it in Teams or Zoom; advance slides while the controller has focus.
- Cover and uncover each output, checking text, animations, timed media, and the capture preview without minimizing it.
- Disconnect and reconnect the selected display during a presentation; change its resolution and scale and check recovery.
- Connect an AirPlay display on macOS and a Miracast display on Windows as extended displays, then repeat the display test.
- Open multiple outputs, change slides, and close each independently.
- Google Cast is not implemented; test it only after a receiver and sender integration exists.
