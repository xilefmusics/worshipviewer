# Non-standard-license Rust dependencies

Most Rust crates in Worship Viewer use MIT OR Apache-2.0. Track exceptions for compliance review:

| Crate | License | Used by | Notes |
|-------|---------|---------|-------|
| `ring` | Custom (ISC-ish OpenSSL + BSD combo) | `backend`, `rustls` crypto | [License text](https://github.com/briansmith/ring/blob/main/LICENSE) |
| `surrealdb` / `surrealdb-core` | BSL 1.1 | `backend` | See [surrealdb-bsl.md](surrealdb-bsl.md) |
| `chordlib` | Check crates.io for current license | `backend`, `shared`, WASM | External crate; not vendored |

Regenerate this table periodically:

```bash
cargo license --manifest-path backend/Cargo.toml
```

Frontend npm licenses:

```bash
pnpm -C frontend/licenses list  # or pnpm licenses ls
```

Add findings to [NOTICE](../../NOTICE) when shipping releases.
