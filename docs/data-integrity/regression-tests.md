# Data-integrity regression tests (roadmap)

Automated coverage for cascade deletes, orphan blobs, and unique-index ownership. Implemented pieces and planned work:

## Implemented

| Area | Location |
|------|----------|
| Migration forward apply + checksum mismatch | `backend/src/database/migrations.rs` (`#[cfg(test)]`) |
| HTTP audit / monitoring BLCs | `backend/src/http_tests.rs`, Venom YAML under `backend/tests/` |
| Collection/song BLC integration | `backend/src/resources/*/service.rs` module tests |

## Planned (not yet exhaustive)

| Scenario | Target |
|----------|--------|
| Cover blob delete unsets `collection.cover` instead of deleting collection | Service + Surreal integration test |
| Blob FS cleanup when DB row cascade-deletes | Reaper unit test with temp `BLOB_DIR` |
| Orphan blob reconciliation | Job test fixture: FS file without DB row and vice versa |
| Unique index ownership (one personal team per user) | Migration + insert conflict test |

Run the existing suite:

```bash
cd backend && cargo test -- --test-threads=4
docker build --target tester .   # Venom HTTP integration
```

Track new tests in PR descriptions when closing data-integrity action items.
