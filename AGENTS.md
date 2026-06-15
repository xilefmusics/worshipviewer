# AI agent instructions

This file is for **AI coding agents** (Cursor, Copilot, Codex, etc.). Human contributors should follow [CONTRIBUTING.md](CONTRIBUTING.md); agents must follow **both** documents.

## Non-negotiable rules

1. **Do not create git commits** unless the user explicitly asks. When they do, the commit must contain only code that already passes the quality gates below.
2. **Never bypass hooks** (`--no-verify`, `--no-gpg-sign`, etc.) unless the user explicitly requests it.
3. **Never commit failing code.** If format, lint, or unit tests fail, fix the failures first. Do not commit and promise to fix later.
4. **Run gates for every area you changed.** Touching `backend/` does not excuse skipping frontend checks if you also edited `frontend/`, and vice versa.
5. **Do not push or open PRs** unless the user explicitly asks.

## Required workflow before any commit

Run these steps **in order** for each area you modified. Re-run after fixes until everything passes.

### 1. Autoformat

| Area touched | Apply formatting |
|--------------|------------------|
| `backend/`, `cli/`, `shared/`, `frontend/crates/chordlib-wasm/` | `cargo fmt` in each crate directory you changed |
| `frontend/` (TypeScript/CSS/JS) | `pnpm --filter app exec eslint . --fix` |

Rust CI enforces `cargo fmt --check`. Frontend CI enforces ESLint (`pnpm -C frontend lint`); use `--fix` for auto-fixable issues.

### 2. Lint and typecheck

**Rust** (when you changed Rust code):

```bash
cd backend && cargo clippy -- -D warnings
```

Also run `cargo clippy` in `cli/` or `shared/` if you edited those crates.

**Frontend** (when you changed frontend code):

```bash
pnpm -C frontend install          # if dependencies changed
pnpm -C frontend build:wasm       # when chordlib-wasm or WASM consumers changed
pnpm -C frontend lint
pnpm -C frontend typecheck
pnpm --filter app lint:flows      # when routes or user flows changed
```

**OpenAPI** (when you changed backend API types or routes):

Regenerate and sync per [CONTRIBUTING.md](CONTRIBUTING.md#openapi), then confirm no drift:

```bash
pnpm --filter app openapi:sync
git diff --exit-code frontend/app/src/api/schema.d.ts
```

### 3. Unit tests

**Rust:**

```bash
cd backend && cargo test -- --test-threads=4
# Also: (cd cli && cargo test) / (cd shared && cargo test) when those crates changed
```

**Frontend:**

```bash
pnpm -C frontend test
```

Add or update tests when you change behavior. Do not delete or skip tests to make the suite pass.

### 4. Build (when you changed build inputs)

```bash
pnpm -C frontend build            # frontend or WASM changes
```

### 5. Full CI parity (before opening a PR or when unsure)

```bash
./scripts/verify-ci.sh
```

This is the authoritative local gate: fmt, audit, backend test/clippy, OpenAPI tri-copy + Spectral, frontend test/lint/typecheck/flow lint/build. It does **not** run Playwright e2e or Docker/Venom.

## Quick reference by path

| Paths changed | Minimum commands before commit |
|---------------|--------------------------------|
| `backend/`, `shared/`, `cli/` | `cargo fmt` → `cargo clippy -- -D warnings` → `cargo test` (in affected crates) |
| `frontend/app/`, `frontend/packages/` | `eslint . --fix` → `pnpm -C frontend lint` → `pnpm -C frontend typecheck` → `pnpm -C frontend test` |
| `frontend/crates/chordlib-wasm/` | `cargo fmt` → `pnpm -C frontend build:wasm` → frontend lint/typecheck/test |
| `docs/openapi.json`, backend OpenAPI | Regenerate OpenAPI (see CONTRIBUTING) → `./scripts/verify-ci.sh` OpenAPI steps |
| `backend/db-migrations/` | `cargo test database::migrations::tests` in `backend/` |

## What not to run by default

- **Playwright e2e** (`pnpm -C frontend test:e2e`) — local-only, not in CI. Run only when the user asks or when you changed e2e specs.
- **Docker/Venom** — post-merge integration gate; see [CONTRIBUTING.md](CONTRIBUTING.md#ci-overview).

## When checks fail

1. Read the full error output; fix the root cause in source, not in CI config.
2. Re-run the **same** failing command until it passes.
3. Re-run the full gate for the touched area (format → lint → test).
4. Only then stage and commit (if the user asked for a commit).

## Project context

- Monorepo: Rust backend/cli/shared + React/Vite frontend + chordlib WASM crate.
- No root `Cargo.toml`; each Rust crate is standalone.
- Canonical OpenAPI: `docs/openapi.json` (tri-copied to backend and frontend).
- Tool versions: Rust **1.96.0**, Node **20**, pnpm **10.33.0** — see [CONTRIBUTING.md](CONTRIBUTING.md#prerequisites).

For architecture, migrations, release notes, and CI job details, read [CONTRIBUTING.md](CONTRIBUTING.md) and [docs/README.md](docs/README.md).
