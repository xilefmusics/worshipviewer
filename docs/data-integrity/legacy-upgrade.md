# Legacy SurrealDB 2.6.5 → 3.x upgrade

## Current policy

**Fresh installs** apply only the scripts in `backend/db-migrations/*.surql` (SurrealDB **3.x**).

The directory `backend/db-migrations/legacy_surrealdb_2.6.5/` preserves the migration history from the SurrealDB **2.6.5** era. Those scripts are **not** executed on new databases.

## Existing production on 2.6.5

There is **no automated in-place upgrade path** checked into this repository today. Operators with databases created under SurrealDB 2.6.5 should choose one of:

1. **Fresh cutover (recommended for small deployments)**  
   Export content via API/CLI, deploy a new 3.x SurrealDB instance, run the current backend (applies 3.x migrations), re-import songs/collections/setlists/teams.

2. **Manual migration project**  
   Work with SurrealDB vendor guidance to upgrade the storage engine, then replay or reconcile schema using the legacy script folder as a reference — **not** as a turnkey runner.

3. **Stay on legacy stack**  
   Not supported by current `main`; only an option if you maintain a long-lived fork.

Document the chosen path in your runbook before public launch if legacy data exists.

## Why legacy scripts remain

- Audit trail of schema evolution
- Reference when debugging data shaped by old events/indexes
- Potential input to a future dedicated upgrade tool

## Verification after any upgrade

- All rows in `migration_script` match shipped checksums
- Personal team exists per user; collections require explicit create (no server default collection)
- Blob files on disk match `blob` records (see orphan reconciliation roadmap)

## Related

- [`backup-restore.md`](backup-restore.md)
- [`../licensing/surrealdb-bsl.md`](../licensing/surrealdb-bsl.md)
