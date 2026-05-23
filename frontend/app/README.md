# `app/` — Vite SPA

## Brand assets

- **Fonts:** self-hosted Rubik WOFF2 files live under `public/fonts/` (see `src/styles/fonts.css`).
- **Icons:** PNG exports for PWA and favicon live under `public/brand/` and `public/favicon.png`. Source rasters are in the repo root [`resources/`](../resources/). Regenerate with:

```bash
pnpm exec node scripts/generate-brand-icons.mjs
```

Requires the `sharp` dev dependency (already in this package).

## Environment

| Variable | Description |
|----------|-------------|
| `VITE_API_BASE_URL` | API base URL. Default **empty** = same origin as the SPA. |
| `VITE_DEV_PROXY_TARGET` | Backend origin for Vite dev proxy (`/api`, `/auth`). Default `http://127.0.0.1:8080`. |

See the [root README](../README.md) for proxy vs cross-origin notes.
