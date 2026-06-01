# Database migrations

SurrealQL scripts in this directory are applied automatically on backend startup via [`backend/src/database/migrations.rs`](../src/database/migrations.rs).

## Layout

| Path | Role |
|------|------|
| `*.surql` (this directory) | **Current** migrations for fresh installs and ongoing schema changes. Applied in lexicographic filename order. |
| `legacy_surrealdb_2.6.5/` | **Historical** scripts from the SurrealDB 2.x era. Not applied on new installs; kept for reference and the legacy upgrade story (see [`docs/data-integrity/legacy-upgrade.md`](../../docs/data-integrity/legacy-upgrade.md)). |

## Filename convention

Use a UTC timestamp prefix so ordering is unambiguous:

```text
YYYYMMDDHHMMSS_short_description.surql
```

Example: `20260420000000_define_analyzer.surql`.

## Checksum locking

Each applied script is recorded in the `migration_script` table with a SHA-256 checksum of the file contents. On startup:

1. If the script name is unknown → apply inside a transaction and record the checksum.
2. If the script name exists with the same checksum → skip (idempotent).
3. If the script name exists with a **different** checksum → **abort startup** (prevents silent drift).

Never edit a migration that has already shipped to production. Add a new forward migration instead.

## `DEFINE … OVERWRITE`

Scripts use SurrealDB `OVERWRITE` so re-running a script on a dev database replaces definitions idempotently. This is intentional for developer ergonomics; production relies on checksum locking so each filename runs once.

## `DEFINE INDEX … CONCURRENTLY`

Index definitions may use `CONCURRENTLY` inside explicit `BEGIN`/`COMMIT` transactions in migration bodies. SurrealDB applies these outside the enclosing migration transaction boundary in some versions — if index creation fails, check server logs and re-run after resolving the partial index. Prefer adding new indexes in dedicated migrations rather than bundling with heavy data backfills.

## Concurrent startup (multi-instance)

When several backend instances start against the same database (for example Cloud Run scale-out), each tries to acquire a **`migration_runner_lock:global`** row before applying pending scripts. A holder renews the lock while migrating; other instances poll for up to two minutes. Stale locks (older than ten minutes) are reaped automatically.

For zero-downtime deploys with many replicas, consider a **single-instance migration job** that runs migrations before rolling out new app revisions.

## Forward-only residue

Removed tables, fields, and events may leave harmless `DEFINE` residue in older scripts. See [`docs/data-integrity/forward-only-migrations.md`](../../docs/data-integrity/forward-only-migrations.md) for the cleanup policy.

## Local commands

From `backend/`:

```bash
# Migrations run automatically on `cargo run`. To test only migrations:
cargo test database::migrations::tests -- --nocapture
```

Regression tests also apply the full script set via [`test_helpers`](../src/test_helpers.rs) (`test_db()`).
