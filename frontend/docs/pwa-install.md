# PWA installation and service worker

## Manifest

- `manifest.webmanifest` (or Vite-generated equivalent):
  - `name` — **Worship Viewer**; `short_name` — **Worship** (see [branding](./branding.md))
  - `display: "standalone"` — fullscreen-like on mobile
  - `display_override` — include `"window-controls-overlay"` where useful for desktop installed PWAs
  - `start_url: "/"` — scope `/`
  - `theme_color` — **primary** brand color (matches `tokens.css` — **`oklch(0.55 0.21 27)`** or hex fallback **`#d01d21`**)
  - `background_color` — matches the **active** shell background (light or dark theme)
  - **Icons**: 192×192, 512×512, **maskable** 512×512 with safe padding

## iOS (Safari / Add to Home Screen)

- iOS **does not** fire `beforeinstallprompt`.
- **Profile menu → Install**: show a **modal sheet** with steps: Share → Add to Home Screen → Open fullscreen.
- **Meta tags**: `apple-mobile-web-app-capable`, `apple-mobile-web-app-status-bar-style`, `apple-touch-icon` (180×180).

## Android / Chrome / Edge (desktop)

- Listen for **`beforeinstallprompt`**; store the event; **Profile menu → Install** calls `prompt()` when user taps.
- Hide Install entry when `getInstalledRelatedApps` or standalone display mode indicates already installed.

## Service worker (vite-plugin-pwa + Workbox)

**MVP rule:** Keep the service worker **minimal** until **E4** offline (Dexie) work lands — **precache + SPA navigation fallback** only. Do **not** add Workbox **runtime** caching for `/api/*`, player JSON, or blob URLs in MVP; [Architecture](./architecture.md) + TanStack Query + Dexie own those data paths (avoids competing caches and keeps later offline options open).

| Strategy | Use case |
|----------|----------|
| **Precache** | Hashed JS/CSS, `index.html`, fonts, shell chunks — **StaleWhileRevalidate** or **CacheFirst** for versioned assets. |
| **Navigation fallback** | SPA: all navigations → `index.html`. |
| **Runtime** | **Not used for API/player data in MVP** — see architecture doc for Dexie mirroring rules when offline ships. |

## Updates

- On new SW activation, show a **non-blocking toast**: “New version available — Reload”.
- One-tap reload applies new precache.
- **MVP + default long-term:** Do **not** force reload after the toast is ignored — the user **always** controls reload, even if the precached shell is **very** stale. **No** automated escalation to mandatory reload (including post-MVP) unless a **separate, explicit** security or compliance policy is adopted by the product.

## Staging vs production installs

- Use **separate hostnames or origins** per environment (e.g. staging vs prod) so installed PWAs do not share `start_url`, scope, or identity — avoids wrong-environment home-screen installs on the same device.

## Private browsing and fragile storage

- **Do not** treat install as available when the browser cannot provide **durable** IndexedDB for offline mode; **hide or disable** **Install** and features that **promise** offline playback in those environments while keeping **online** browsing usable.

## Related docs

- [Architecture](./architecture.md) — offline mirroring
- [Branding](./branding.md) — icons
