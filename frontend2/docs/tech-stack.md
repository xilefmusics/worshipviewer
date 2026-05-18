# Tech stack

This document records the chosen libraries, how they fit together, and alternatives we rejected.

## Core

| Layer | Choice | Role |
|-------|--------|------|
| Build | **Vite** | Fast dev server, native ESM, first-class WASM support, static `dist/` for same-origin hosting and future Tauri embedding. |
| UI | **React 19** + **TypeScript** (strict) | Component model, ecosystem, AI-friendly patterns. |
| Styling | **Tailwind CSS v4** | Utility-first; pairs with design tokens in CSS variables. |
| Components | **shadcn/ui** (Radix primitives) | Accessible, copy-paste components; not a black-box dependency. |
| Routing | **TanStack Router** | File-based, type-safe routes; excellent for AI-generated route modules. |
| Server state | **TanStack Query** | Caching, retries, `useInfiniteQuery` for “load more” pagination. |
| Client UI state | **Zustand** | Small stores: command palette (tablet/desktop), **appearance** (light / dark / system — system follows `prefers-color-scheme`), player session, view preferences. Persist user-chosen **locale** and **appearance** (and any “use browser default” flags) so reload and PWA standalone restore behavior. |
| Offline persistence | **Dexie** | IndexedDB wrapper for cached setlist players and blob bytes. |
| PWA | **vite-plugin-pwa** (Workbox) | Service worker, precache, runtime caching strategies. |
| API types | **openapi-typescript** + **openapi-fetch** | Generated types and typed client from OpenAPI; `credentials: 'include'` for cookies. |
| Command palette | **cmdk** | Cmd-K / Ctrl-K on **tablet and desktop** only; **phones** use **simple header search** (no palette). Wrap with an action registry; **Navigate** lists every routable destination. |
| Strings | **i18next** (early scaffold) | **MVP** ships **English** and **German**; other locales are **out of scope** until a later release. Wrap user-facing copy from the start so adding locales stays mechanical. **Settings** exposes a **language** control: pick a supported locale **or** “use browser default” (detect via browser language preferences). **Unsupported** or **unmapped** languages **fall back to English**. |

## Monorepo / packages

- **pnpm workspaces**: root `package.json` + `app/` (Vite SPA) + `packages/chordlib-wasm` (wasm-pack output) + optional future `src-tauri` or separate Tauri package. This layout is the **documented default** until Tauri packaging dictates changes — do not casually relocate the WASM package without updating these docs.
- **Rust**: `crates/chordlib-wasm` wraps [`chordlib`](https://crates.io/crates/chordlib) with `wasm-bindgen`; build outputs to `packages/chordlib-wasm/pkg`.

## Environment

- **`VITE_API_BASE_URL`**: Base URL for API (default **empty** = same origin). **Production** is always **same URL** for the SPA and the API — this is the supported cookie-auth topology — and the SPA is **served at `/`** (no production subpath `base`). A non-empty value remains useful for **local dev** or **staging** on another origin; it is **not** the long-term production split-deploy contract.
- **Deployment**: Same origin as API (e.g. `https://app.worshipviewer.com`) — required posture for cookie-based auth and predictable PWA scope.

## Rejected alternatives

| Alternative | Why not |
|-------------|---------|
| **Next.js (App Router)** | Assumes a Node server; complicates Tauri (static embed), PWA service worker scope, and WASM bundling. A pure SPA matches “runs fully in the browser” and Tauri equally. |
| **Redux Toolkit** | Heavy for an app where TanStack Query owns server cache and Zustand covers UI; more boilerplate for AI and humans. |
| **React Router** | TanStack Router’s type-safe params/search integrate well with codegen and strict TS. |
| **Remote Google Fonts** | Breaks offline-first branding; self-host WOFF2 under `public/` or `src/styles/fonts.css`. |

## Version policy

- Pin major versions in `package.json`; renovate or periodic bumps.
- Regenerate OpenAPI types when the backend bumps `/api/docs/openapi.json`.

## Related docs

- [Architecture](./architecture.md) — how these pieces connect in layers and ports.
- [API integration](./api-integration.md) — codegen and auth details.
