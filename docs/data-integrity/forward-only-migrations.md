# Forward-only migration residue

Worship Viewer migrations are **forward-only**. Once a script ships to production, its filename and checksum are immutable.

## Why residue exists

SurrealQL `DEFINE TABLE … OVERWRITE` and `REMOVE FIELD` patterns sometimes leave:

- Superseded event handlers removed in a later script
- Indexes replaced with `OVERWRITE` rather than explicit `REMOVE INDEX`
- Deprecated fields nulled but not dropped until a later cleanup migration

This is intentional: each migration stays small and deploy-order deterministic.

## Cleanup policy

1. **Never edit** a migration that production has applied.
2. To drop a field or event, add a **new** timestamped script that performs `REMOVE FIELD`, `REMOVE EVENT`, or equivalent.
3. Cosmetic renames of old scripts are forbidden (checksum lock).
4. Legacy folder `legacy_surrealdb_2.6.5/` is frozen; do not add new files there.

## Review checklist for new migrations

- [ ] Filename uses UTC timestamp prefix
- [ ] Uses `OVERWRITE` only when idempotent re-define is intended
- [ ] Heavy backfills isolated from `DEFINE INDEX CONCURRENTLY` when possible
- [ ] Documented in PR if data backfill is irreversible

## Related

- [`../backend/db-migrations/README.md`](../backend/db-migrations/README.md)
