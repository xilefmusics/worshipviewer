# Contributing to Worship Viewer

Thank you for helping improve Worship Viewer. This document covers the workflows contributors use most often.

**AI coding agents:** read [AGENTS.md](AGENTS.md) in addition to this file. Agents must not commit code that has not been autoformatted, linted, and unit-tested.

## Prerequisites

| Stack | Version / tool |
|-------|----------------|
| Rust | **1.96.0** (`rust-toolchain.toml`) |
| Node.js | **20** |
| pnpm | **10.33.0** (via Corepack) |
| wasm-pack | For chordlib WASM builds |

There is **no root `Cargo.toml`**. Rust crates are standalone:

- `backend/` — HTTP API and SPA static server
- `cli/` — `worshipviewer` CLI
- `shared/` — DTOs shared by backend, CLI, and WASM
- `frontend/crates/chordlib-wasm/` — WASM wrapper around the external **[chordlib](https://crates.io/crates/chordlib)** crate (not vendored in this repo)

## Quick start

```bash
# Terminal 1 — backend
cd backend && cp .env.example .env   # optional; edit as needed
INITIAL_ADMIN_USER_EMAIL="admin@example.com" \
  INITIAL_ADMIN_USER_TEST_SESSION=true \
  cargo run

# Terminal 2 — frontend dev server (proxies /api to :8080)
corepack enable && corepack prepare pnpm@10.33.0 --activate
pnpm -C frontend install
pnpm -C frontend build:wasm
pnpm -C frontend dev
```

See [README.md](README.md) for production-like single-process runs, Playwright e2e (port **8788** for bundled backend), and Docker.

### One-shot CI parity (recommended before PR)

```bash
./scripts/verify-ci.sh
```

Runs fmt, audit, backend tests/clippy, OpenAPI tri-copy + Spectral, and the full frontend gate. Does **not** run Playwright e2e or Docker/Venom.

## Commit messages

Use **Conventional Commits** for all commits:

- Format: `type(scope): summary`
- Keep the summary short, imperative, and specific
- Add a commit body that explains the change, the motivation, and any notable tradeoffs
- Use `scope` when it helps clarify the area touched, such as `backend`, `frontend`, or `docs`

Example:

```text
feat(frontend): add song language selector

Explain why the selector is needed, what behavior changed, and any follow-up work or caveats.
```

## Before opening a PR

Run checks in this order: **format → lint/typecheck → unit tests → build**. Apply fixes and re-run until clean. The one-shot script `./scripts/verify-ci.sh` runs the full CI-equivalent gate (recommended).

### Backend / shared / CLI

```bash
# 1. Format (apply locally; CI uses --check)
(cd backend && cargo fmt)
(cd shared && cargo fmt)
(cd cli && cargo fmt)

# 2. Lint
cd backend && cargo clippy -- -D warnings

# 3. Unit tests
cd backend && cargo test -- --test-threads=4

# 4. Supply chain (also in verify-ci.sh)
(cd backend && cargo audit)
(cd cli && cargo audit)
(cd shared && cargo audit)
(cd frontend/crates/chordlib-wasm && cargo audit)

# Verify formatting in CI mode
(cd backend && cargo fmt --check)
(cd shared && cargo fmt --check)
(cd cli && cargo fmt --check)
```

When backend API behavior changes, update the relevant
[`docs/business-logic-constraints/`](docs/business-logic-constraints/) page(s)
in the same PR and add/update HTTP/API tests for the public contract.

### Frontend

```bash
pnpm -C frontend install
pnpm -C frontend build:wasm

# 1. Format (auto-fix ESLint issues where possible)
pnpm --filter app exec eslint . --fix

# 2. Lint and typecheck
pnpm -C frontend lint
pnpm -C frontend typecheck
pnpm --filter app lint:flows

# 3. Unit tests
pnpm -C frontend test

# 4. Build and audit
pnpm -C frontend build
pnpm -C frontend audit --audit-level=high
```

### OpenAPI

The canonical OpenAPI file is [`docs/openapi.json`](docs/openapi.json). Copies live in `backend/openapi.json` and `frontend/app/src/api/openapi.json`.

Regenerate after API changes:

```bash
cd backend
cargo run --example print_openapi --quiet | python3 -c \
  "import json,sys; json.dump(json.load(sys.stdin), sys.stdout, indent=2, sort_keys=True, ensure_ascii=False)" \
  > openapi.json
cp openapi.json ../docs/openapi.json
pnpm -C ../frontend openapi:sync
```

CI fails if the three copies diverge or if `openapi_snapshot_matches_committed_file` drifts.

### Database migrations

1. Add `backend/db-migrations/YYYYMMDDHHMMSS_description.surql`.
2. Never edit any existing shipped database migration script. If a schema change is needed, restore the original script exactly and add a new forward migration instead.
3. Read [`backend/db-migrations/README.md`](backend/db-migrations/README.md).
4. Run `cargo test database::migrations::tests` in `backend/`.

## CI overview

| Workflow | When | What |
|----------|------|------|
| [Backend CI](.github/workflows/backend-ci.yml) | PRs to `main`; pushes to non-`main` branches | `cargo test`, clippy, fmt, Spectral, OpenAPI tri-copy, `cargo audit` (backend, cli, shared, `chordlib-wasm`) |
| [Frontend CI](.github/workflows/frontend-ci.yml) | PRs / pushes touching `frontend/` | Vitest, lint, typecheck, OpenAPI `schema.d.ts` drift, build, `pnpm audit` |
| Docker publish | Push to `main` or tags when `backend/**`, `frontend/**`, or image build inputs change | Build image (backend + frontend); **Venom** integration tests run in the `tester` stage |

**Playwright e2e** (`pnpm test:e2e` in `frontend/`) is **local-only** — intentionally not in CI (see action plan §2.1 deferral). Run against real backend on port 8788 before release.

**Supply chain:** `pnpm audit --audit-level=high` and `cargo audit` on all Rust manifests including `frontend/crates/chordlib-wasm`. The frontend pins `serialize-javascript` ≥7.0.5 via pnpm overrides (build-time transitive from `vite-plugin-pwa`).

Venom HTTP tests are **not** re-run on every PR (they require the full Docker build). Treat a green Docker `main` build as the post-merge integration gate, or run locally:

```bash
docker build --target tester .
```

## Documentation

- Hub index: [`docs/README.md`](docs/README.md)
- Architecture: [`docs/architecture/`](docs/architecture/)
- Business logic constraints: [`docs/business-logic-constraints/`](docs/business-logic-constraints/)
- Logging field catalog: [`docs/logging-review.md`](docs/logging-review.md)

## Release notes

Record user-visible changes in [CHANGELOG.md](CHANGELOG.md) under `[Unreleased]` when your PR merges.

## License

Contributions are licensed under the same terms as the project ([AGPL-3.0](LICENSE)). By submitting a PR you agree your work can be distributed under that license.
