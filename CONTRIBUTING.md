# Contributing to Worship Viewer

Thank you for helping improve Worship Viewer. This document covers the workflows contributors use most often.

**AI coding agents:** read [AGENTS.md](AGENTS.md) in addition to this file. Agents must not commit code that has not been autoformatted, linted, and unit-tested.

## Prerequisites

| Stack     | Version / tool                     |
| --------- | ---------------------------------- |
| Rust      | **1.98.1** (`rust-toolchain.toml`) |
| Node.js   | **26**                             |
| pnpm      | **12.6.0**                          |
| wasm-pack | **0.15.0**                          |

There is **no root `Cargo.toml`**. Rust crates are standalone:

- `backend/` — HTTP API and SPA static server
- `cli/` — `worshipviewer` CLI
- `shared/` — DTOs shared by backend, CLI, and WASM
- `frontend/crates/chordlib-wasm/` — WASM wrapper around the external **[chordlib](https://crates.io/crates/chordlib)** crate (not vendored in this repo)

## Quick start

```bash
# Terminal 1 — backend
cd backend && cp .env.example .env   # optional; edit as needed
# Uncomment INITIAL_ADMIN_USER_* in `.env` for a local test admin session.
cargo run

# Terminal 2 — frontend dev server (proxies /api to :8080)
npm install --global pnpm@12.6.0
pnpm -C frontend install
pnpm -C frontend dev
```

See [README.md](README.md) for production-like single-process runs, Playwright e2e (port **8788** for the bundled backend), and Docker.

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

Run checks in this order: **format → lint/typecheck → unit tests → build**. Apply fixes and re-run until clean. The one-shot script `./scripts/verify-ci.sh` runs the full CI-equivalent gate and is recommended before opening a PR.

### Documentation-only changes

For changes limited to Markdown or other documentation, check every edited relative link and verify the rendered headings, lists, tables, and code blocks. Code-formatting, lint, and test gates are not required unless the documentation change also updates generated or executable files.

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
pnpm -C frontend install --frozen-lockfile

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

| Workflow                                                    | Trigger                                                | Coverage                                                                                                        |
| ----------------------------------------------------------- | ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| [Backend CI](.github/workflows/backend-ci.yml) — validation | PRs to `main`; pushes to non-`main` branches           | `cargo test`, clippy, fmt, Spectral, OpenAPI tri-copy, `cargo audit` (backend, cli, shared, `chordlib-wasm`)    |
| [Frontend CI](.github/workflows/frontend-ci.yml)            | PRs to `main`; pushes to `main` that touch `frontend/` | Vitest, flow lint, typecheck, OpenAPI `schema.d.ts` drift, lint, build, `pnpm audit`                            |
| [Backend CI](.github/workflows/backend-ci.yml) — publish    | Pushes to `main` or a tag matching build paths         | Builds and publishes `ghcr.io/xilefmusics/worshipviewer`; **Venom** integration tests run in the `tester` stage |

Validation jobs cancel superseded runs for the same PR/ref. Publishing is excluded
from cancellation. Frontend CI caches Rust/WASM build artifacts and builds WASM
once during dependency installation. Docker builds the backend and frontend in
independent stages, with cached frontend dependency installation and a separate
cached WASM stage. The backend stage copies only build/test inputs so local runtime
data cannot invalidate compilation; the final image still
depends on the Venom tester stage. Docker's GitHub Actions layer cache uses scope
`worshipviewer-amd64` with `mode=max`. The scratch tester and runtime include a
writable `/tmp` directory for temporary files, including amd64 emulation.

### GHCR publishing setup

The publishing job authenticates to `ghcr.io` with `GITHUB_TOKEN` and job-scoped
`packages: write`; Docker Hub credentials are no longer used. Existing Docker Hub
images and secrets can remain in place. The image remains `linux/amd64`:

- Default-branch builds publish `ghcr.io/xilefmusics/worshipviewer:main`.
- Tag builds publish the Git tag and update `:latest`, as before.
- The OCI source label associates the image with this repository.

New GHCR packages are private by default. After the first publish, a package admin
must open the `worshipviewer` package settings and change its visibility to
**Public**. If the package already exists, ensure this repository has Actions write
access. See [GitHub's container registry documentation](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry).
Verify the published tags and an unauthenticated pull after changing visibility.
The workflow does not change package visibility automatically.

### Integration checks

**Playwright e2e** (`pnpm test:e2e` in `frontend/`) is **local-only** and intentionally not part of CI. Run it against the real backend on port 8788 before release.

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

Record user-visible changes in [CHANGELOG.md](CHANGELOG.md) under `[Unreleased]` before your PR is merged.

## License

Contributions are licensed under the same terms as the project ([AGPL-3.0](LICENSE)). By submitting a PR you agree your work can be distributed under that license.
