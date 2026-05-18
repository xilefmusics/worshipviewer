# Worship Viewer — frontend

pnpm monorepo with the Vite SPA in [`app/`](app/). Product and API contracts live under [`docs/`](docs/).

## Scripts (repo root)

| Script | Purpose |
|--------|---------|
| `pnpm dev` | Start Vite dev server (`app`) |
| `pnpm build` | Production build |
| `pnpm lint` | ESLint |
| `pnpm typecheck` | TypeScript |
| `pnpm test` | Vitest (pure helpers) |
| `pnpm openapi:sync` | Copy vendored [`docs/openapi.json`](docs/openapi.json) into the app and regenerate `app/src/api/schema.d.ts` |

## Local API topology

**Recommended:** leave **`VITE_API_BASE_URL` unset** (empty) so requests stay same-origin. Configure the dev proxy target (defaults to `http://127.0.0.1:8080`):

```bash
# app/.env.development.local
VITE_DEV_PROXY_TARGET=http://127.0.0.1:8080
```

The Vite dev server proxies **`/api`** and **`/auth`** to that origin so session cookies behave like production (same host/port as the SPA).

**Alternate:** point the client at another origin:

```bash
VITE_API_BASE_URL=https://api.example.com
```

You must align **CORS**, **SameSite** cookie settings, and HTTPS with the backend; cookie auth is intended for same-site deployment in production.

## OpenAPI

Refresh the canonical spec in [`docs/openapi.json`](docs/openapi.json), then run `pnpm openapi:sync` and commit the updated generated types in the same change when possible (see [`docs/api-integration.md`](docs/api-integration.md)).

## QA locale override

Append **`?lang=en`** or **`?lang=de`** to any URL to force the UI language for that load (see [`docs/epic-e1-action-plan.md`](docs/epic-e1-action-plan.md) §8).

## Related docs

- [Epic E1 action plan](docs/epic-e1-action-plan.md)
- [Epic E2 action plan](docs/epic-e2-action-plan.md)
- [Roadmap](docs/roadmap.md)
