#!/usr/bin/env bash
# CI-equivalent checks (local). Excludes Playwright e2e and Docker/Venom — see CONTRIBUTING.md.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "== Rust fmt =="
(cd backend && cargo fmt --check)
(cd cli && cargo fmt --check)
(cd shared && cargo fmt --check)

echo "== cargo audit =="
(cd backend && cargo audit)
(cd cli && cargo audit)
(cd shared && cargo audit)
(cd frontend/crates/chordlib-wasm && cargo audit)

echo "== backend test + clippy =="
(cd backend && cargo test -- --test-threads=4)
(cd backend && cargo clippy -- -D warnings)

echo "== OpenAPI tri-copy + Spectral =="
cmp docs/openapi.json backend/openapi.json
cmp docs/openapi.json frontend/app/src/api/openapi.json
npx --yes @stoplight/spectral-cli@6 lint backend/openapi.json -r .spectral.yaml

echo "== frontend =="
cd frontend
pnpm install --frozen-lockfile
pnpm audit --audit-level=high
pnpm build:wasm
pnpm test
pnpm typecheck
pnpm lint
pnpm --filter app lint:flows
pnpm --filter app openapi:sync
git diff --exit-code app/src/api/schema.d.ts
pnpm build

echo ""
echo "All CI-equivalent checks passed."
