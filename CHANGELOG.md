# Changelog

All notable changes to Worship Viewer are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- Import songs from searchable CCLI PDFs directly in song creation.
- Empty, team-owned Rooms can be created directly from the Rooms hub and entered in Sheet view.
- Spotify track and playlist Media items with external playback controls in the AV player.
- Independent grayscale text controls for primary and translated AV lyrics.
- Two Zeltlager background presets for AV-mode lyric projection.
- Rooms for synchronized Sheet, AV, and Slide participants across devices, including anonymous invite links and reconnecting presence.
- Three-panel Rooms with a shared next-song queue, authenticated participant song sharing, and host queue management.
- Played-state sections in Room queues, with re-upvoted songs returning to the upcoming ranking.
- Collection-based Rooms now preload their source songs in the queue, and ended Rooms link back to the Rooms list.
- `./scripts/verify-ci.sh` — one-shot local run of CI-equivalent checks (fmt, audit, tests, OpenAPI, frontend build).
- `backend/.cargo/audit.toml` — documents ignored transitive `rsa` advisory (no upstream fix).
- `pnpm audit` gate in frontend CI; `serialize-javascript` ≥7.0.5 via pnpm overrides.
- Cross-stack engineering docs: search contract, error UX taxonomy, offline/export security model, i18n locale policy, e2e coverage inventory, ops alerting guide.
- PDF export iframe DOM tests for `@page` / `@media print` CSS injection.
- Review prompt key-path fixes (`chordlib-wasm`, `setlist-broken-rows`, canonical OpenAPI path).
- Migration checksum-mismatch regression tests and multi-instance migration runner lock.
- Engineering docs hub (`docs/README.md`), ops runbooks, data-integrity guides, and `CONTRIBUTING.md`.

### Changed

- Rendered sheets and PDF exports now honor capo shape settings.
- Song navigation in the player now commits after a 10 px horizontal swipe.
- Player chord sections now render in a background worker with cached results, and the table of contents dismisses with a smoother animation.
- Demodata fixtures are reapplied on every backend startup when `DEMODATA=generic` is enabled; the seed marker table has been removed.
- Room queue browsing now uses the current queue for order, A–Z, and personal Liked views; hosts control whether members may add new library songs.
- Admin Users and Metrics now use the same hub chrome as collections and songs: a bottom tab bar with Leave, hub-style user rows, and the shared right-hand actions drawer. Impersonation starts immediately from that drawer.
- `openapi-sync.mjs` resolves canonical OpenAPI from repo root (`docs/openapi.json`).
- Backend CI `cargo audit` runs per-crate (`cd … && cargo audit`) — compatible with cargo-audit 0.22+.
- OpenAPI Problem type documentation references [RFC 9457](https://www.rfc-editor.org/rfc/rfc9457) (successor to RFC 7807).

### Fixed

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
