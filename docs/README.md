# Documentation index

Central map of Worship Viewer engineering docs. User-facing product copy lives in `frontend/app/src/i18n/`.

## Architecture

| Document | Description |
|----------|-------------|
| [backend-request-flow.md](architecture/backend-request-flow.md) | HTTP request path, logging, audit events |
| [backend-resource.md](architecture/backend-resource.md) | Per-resource layered pattern (DTO → repo → service → REST) |
| [frontend-navigation-graph.md](architecture/frontend-navigation-graph.md) | SPA routes, overlays, and transitions |
| [frontend-user-flows.md](architecture/frontend-user-flows.md) | Product flow catalog |

## API & constraints

| Document | Description |
|----------|-------------|
| [openapi.json](openapi.json) | **Canonical** OpenAPI 3 schema (copies in `backend/` and `frontend/app/src/api/`) |
| [business-logic-constraints/](business-logic-constraints/) | BLC-* rules per resource |
| [api-breaking-2-0.md](api-breaking-2-0.md) | API 2.0 migration notes (referenced from OpenAPI) |

## Data & operations

| Document | Description |
|----------|-------------|
| [data-integrity/backup-restore.md](data-integrity/backup-restore.md) | Backup, restore, rollback policy |
| [data-integrity/legacy-upgrade.md](data-integrity/legacy-upgrade.md) | SurrealDB 2.6.5 → 3.x story |
| [data-integrity/forward-only-migrations.md](data-integrity/forward-only-migrations.md) | Migration residue cleanup |
| [data-integrity/regression-tests.md](data-integrity/regression-tests.md) | Planned data-integrity test suite |
| [ops/README.md](ops/README.md) | Deploy verify, triage, incident response (ops runbooks) |

## Observability & logging

| Document | Description |
|----------|-------------|
| [logging-review.md](logging-review.md) | Canonical log fields and audit event catalog |
| [business-logic-constraints/monitoring.md](business-logic-constraints/monitoring.md) | HTTP audit and admin metrics BLCs |

## Licensing & third party

| Document | Description |
|----------|-------------|
| [../NOTICE](../NOTICE) | Aggregated third-party attribution |
| [licensing/surrealdb-bsl.md](licensing/surrealdb-bsl.md) | SurrealDB BSL deployment notes |
| [licensing/docker-scratch-libs.md](licensing/docker-scratch-libs.md) | Redistributed glibc/OpenSSL in `scratch` images |
| [licensing/non-standard-crates.md](licensing/non-standard-crates.md) | `ring` and other non-MIT/Apache deps |
| [branding.md](branding.md) | Rubik font (OFL) and self-hosted assets |

## Future work

| Document | Description |
|----------|-------------|
| [future-epics/gaps.md](future-epics/gaps.md) | Known gaps vs future epics (audio blobs, realtime sessions, etc.) |

## Repository entry points

- [README.md](../README.md) — local dev, Docker, CLI
- [CONTRIBUTING.md](../CONTRIBUTING.md) — PR checklist, OpenAPI regen, migrations
- [CHANGELOG.md](../CHANGELOG.md) — release notes process
- [backend/db-migrations/README.md](../backend/db-migrations/README.md) — SurrealQL migrations
