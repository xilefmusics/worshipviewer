# Changelog

All notable changes to Worship Viewer are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- Import songs from searchable CCLI PDFs directly in song creation.
- Upload image backgrounds to the media library and use them in AV projection.
- Fixed-pool team Rooms with immutable captured song content, authenticated direct-link access, ordered shared messages, virtual vote ranking, and reconnecting presence.
- Spotify track and playlist Media items with external playback controls in the AV player.
- Independent grayscale text controls for primary and translated AV lyrics.
- `./scripts/verify-ci.sh` — one-shot local run of CI-equivalent checks (fmt, audit, tests, OpenAPI, frontend build).
- `backend/.cargo/audit.toml` — documents ignored transitive `rsa` advisory (no upstream fix).
- `pnpm audit` gate in frontend CI; `serialize-javascript` ≥7.0.5 via pnpm overrides.
- Cross-stack engineering docs: search contract, error UX taxonomy, offline/export security model, i18n locale policy, e2e coverage inventory, ops alerting guide.
- PDF export iframe DOM tests for `@page` / `@media print` CSS injection.
- Review prompt key-path fixes (`chordlib-wasm`, `setlist-broken-rows`, canonical OpenAPI path).
- Migration checksum-mismatch regression tests and multi-instance migration runner lock.
- Engineering docs hub (`docs/README.md`), ops runbooks, data-integrity guides, and `CONTRIBUTING.md`.

### Changed

- Media library rows now show image previews, the first slide of decks, or a generic placeholder, and their actions use the shared hub drawer.
- Right-clicking a song, setlist, collection, room, or Admin Users row/card now opens its actions drawer.
- Ray is now the only built-in AV background and is labeled Default.
- Rendered sheets and PDF exports now honor capo shape settings.
- Sheet players now use native browser snapping through songs. Mobile standalone players open their TOC and header with a middle tap and close them with a left swipe.
- Player chord sections now render in a background worker with cached results, and the table of contents dismisses with a smoother animation.
- Demodata fixtures are reapplied on every backend startup when `DEMODATA=generic` is enabled; the seed marker table has been removed.
- Room playback and votes now replay from ordered messages over an immutable song pool. A local opt-in diagnostic viewer exports the bounded replay/live message log without credentials.
- Admin Users and Metrics now use the same hub chrome as collections and songs: a bottom tab bar with Leave, hub-style user rows, and the shared right-hand actions drawer. Impersonation starts immediately from that drawer.
- `openapi-sync.mjs` resolves canonical OpenAPI from repo root (`docs/openapi.json`).
- Backend CI `cargo audit` runs per-crate (`cd … && cargo audit`) — compatible with cargo-audit 0.22+.
- OpenAPI Problem type documentation references [RFC 9457](https://www.rfc-editor.org/rfc/rfc9457) (successor to RFC 7807).

### Fixed

- Translated player chord sheets no longer show unmatched primary-language text or a generated hyphen before the first translated chord (chordlib 0.18.2).
- Room settings back navigation now returns to the same room and display mode.
- Mobile player TOCs now scroll through their final entries below the fullscreen header.
- Markdown rendering now uses the corrected `chordlib` 0.17.0 implementation.
- Songs can no longer be linked to multiple collections, including during concurrent writes. Duplicating a collection now creates an empty copy with its title, owner, and cover.
- Song editor key changes now preserve the selected transpose-or-keep chord behavior when autosaving.
- Dark and light AV lyrics remain visible over checkerboard slide-selector previews.
- Unliked songs disappear immediately from the sheet player's Liked table of contents and show inverse heart feedback.

## Release process

1. Move `[Unreleased]` items into a dated version section (`## [x.y.z] - YYYY-MM-DD`).
2. Tag the release in Git (`git tag vX.Y.Z`).
3. Docker images for `main` and tags are published by [Backend CI](.github/workflows/backend-ci.yml).

Until automated releases exist, version numbers track the backend crate (`backend/Cargo.toml`) and OpenAPI `info.version`.
