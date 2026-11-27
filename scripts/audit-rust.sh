#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# Actix Web currently requires cookie 0.16. The affected PrivateJar API is
# compiled only with its private feature. Fail if that changes, and remove
# this exception when Actix can use a patched cookie release.
cookie_features="$(cd backend && cargo tree --locked --target all -e features -i cookie)"
if grep -q 'cookie feature "private"' <<< "$cookie_features"; then
  echo "error: cookie's private feature is enabled; RUSTSEC-2026-0594 requires remediation" >&2
  exit 1
fi

# Temporary exceptions for SurrealDB 3.x: 0454 is fixed in 4.0, while
# 0194/0195 come from its object_store 0.13 dependency on quick-xml 0.39.
(cd backend && cargo audit \
  --ignore RUSTSEC-2026-0594 \
  --ignore RUSTSEC-2026-0454 \
  --ignore RUSTSEC-2026-0194 \
  --ignore RUSTSEC-2026-0195)
(cd cli && cargo audit)
(cd shared && cargo audit)
(cd frontend/crates/chordlib-wasm && cargo audit)
