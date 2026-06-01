# Changelog

All notable changes to Worship Viewer are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- `./scripts/verify-ci.sh` — one-shot local run of CI-equivalent checks (fmt, audit, tests, OpenAPI, frontend build).
- `backend/.cargo/audit.toml` — documents ignored transitive `rsa` advisory (no upstream fix).
- `pnpm audit` gate in frontend CI; `serialize-javascript` ≥7.0.5 via pnpm overrides.
- Cross-stack engineering docs: search contract, error UX taxonomy, offline/export security model, i18n locale policy, e2e coverage inventory, ops alerting guide.
- PDF export iframe DOM tests for `@page` / `@media print` CSS injection.
- Review prompt key-path fixes (`chordlib-wasm`, `setlist-broken-rows`, canonical OpenAPI path).
- Migration checksum-mismatch regression tests and multi-instance migration runner lock.
- Engineering docs hub (`docs/README.md`), ops runbooks, data-integrity guides, and `CONTRIBUTING.md`.

### Changed

- `openapi-sync.mjs` resolves canonical OpenAPI from repo root (`docs/openapi.json`).
- Backend CI `cargo audit` runs per-crate (`cd … && cargo audit`) — compatible with cargo-audit 0.22+.
- OpenAPI Problem type documentation references [RFC 9457](https://www.rfc-editor.org/rfc/rfc9457) (successor to RFC 7807).

## Release process

1. Move `[Unreleased]` items into a dated version section (`## [x.y.z] - YYYY-MM-DD`).
2. Tag the release in Git (`git tag vX.Y.Z`).
3. Docker images for `main` and tags are published by [Backend CI](../.github/workflows/backend-ci.yml).

Until automated releases exist, version numbers track the backend crate (`backend/Cargo.toml`) and OpenAPI `info.version`.
