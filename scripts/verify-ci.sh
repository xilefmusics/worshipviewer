#!/usr/bin/env bash
# CI-equivalent checks (local). Excludes Playwright e2e and Docker builds — see CONTRIBUTING.md.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "== Rust fmt =="
(cd backend && cargo fmt --check)
(cd cli && cargo fmt --check)
(cd shared && cargo fmt --check)

echo "== cargo audit =="
# Temporary exceptions while the backend stays on SurrealDB 3.x:
# 0454 is fixed in SurrealDB 4.0; 0194/0195 come from quick-xml 0.39.4
# required by SurrealDB 3.x's object_store 0.13 dependency.
(cd backend && cargo audit \
  --ignore RUSTSEC-2026-0454 \
  --ignore RUSTSEC-2026-0194 \
  --ignore RUSTSEC-2026-0195)
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
pnpm test
pnpm typecheck
pnpm lint
pnpm --filter app lint:flows
pnpm --filter app openapi:sync
git diff --exit-code app/src/api/schema.d.ts
pnpm build

echo ""
echo "All CI-equivalent checks passed."
