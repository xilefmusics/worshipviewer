# Contributing to Worship Viewer

Thank you for helping improve Worship Viewer. This document covers the workflows contributors use most often.

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

## Before opening a PR

### Backend / shared / CLI

```bash
cargo fmt --manifest-path backend/Cargo.toml
cargo fmt --manifest-path shared/Cargo.toml
cargo fmt --manifest-path cli/Cargo.toml
cd backend && cargo clippy -- -D warnings
cd backend && cargo test -- --test-threads=4
cargo audit --manifest-path backend/Cargo.toml
```

### Frontend

```bash
pnpm -C frontend install
pnpm -C frontend build:wasm
pnpm -C frontend test
pnpm -C frontend lint
pnpm -C frontend typecheck
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
2. Never edit shipped migrations — add a forward script instead.
3. Read [`backend/db-migrations/README.md`](backend/db-migrations/README.md).
4. Run `cargo test database::migrations::tests` in `backend/`.

## CI overview

| Workflow | When | What |
|----------|------|------|
| [Backend CI](.github/workflows/backend-ci.yml) | PRs to `main`; pushes to non-`main` branches | `cargo test`, clippy, fmt, Spectral, OpenAPI tri-copy, `cargo audit` |
| [Frontend CI](.github/workflows/frontend-ci.yml) | PRs / pushes touching `frontend/` | Vitest, lint, typecheck, build, `pnpm audit` |
| Docker publish | Push to `main` or tags | Build image; **Venom** integration tests run in the `tester` stage |

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
