# Changelog

All notable changes to Worship Viewer are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- Backend CI runs on pull requests to `main` (tests, clippy, OpenAPI drift, `cargo audit`).
- `pnpm audit` gate in frontend CI.
- Migration checksum-mismatch regression tests and multi-instance migration runner lock.
- Engineering docs hub (`docs/README.md`), ops runbooks, data-integrity guides, and `CONTRIBUTING.md`.

### Changed

- OpenAPI Problem type documentation references [RFC 9457](https://www.rfc-editor.org/rfc/rfc9457) (successor to RFC 7807).

## Release process

1. Move `[Unreleased]` items into a dated version section (`## [x.y.z] - YYYY-MM-DD`).
2. Tag the release in Git (`git tag vX.Y.Z`).
3. Docker images for `main` and tags are published by [Backend CI](../.github/workflows/backend-ci.yml).

Until automated releases exist, version numbers track the backend crate (`backend/Cargo.toml`) and OpenAPI `info.version`.
