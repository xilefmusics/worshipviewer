# SurrealDB Business Source License (BSL)

Worship Viewer embeds **SurrealDB** as a database client (`surrealdb` Rust crate) and expects operators to run SurrealDB **3.x** for persistent deployments.

## What this means for operators

- SurrealDB is **not** AGPL like Worship Viewer. It is licensed under the [Business Source License 1.1](https://surrealdb.com/BSL).
- **Internal / development use** is generally permitted under BSL terms.
- **Production network deployment** may trigger BSL restrictions (commercial use, hosting, etc.). Review the current SurrealDB license and [FAQ](https://surrealdb.com/docs/surrealdb/reference/faq) with legal counsel before multi-tenant or SaaS deployment.
- **Change date:** After the license change date, SurrealDB converts to Apache 2.0 for the licensed version — confirm the change date for your pinned version (`backend/Cargo.toml`).

## Source availability

BSL requires making source available under the license terms when you distribute or deploy in ways covered by the license. Self-hosted Worship Viewer deployments that include or depend on SurrealDB should comply with SurrealDB BSL obligations separately from Worship Viewer’s AGPL.

## Alternatives

- **Development:** in-memory `mem://` (embedded, no separate server).
- **Production:** managed SurrealDB Cloud or self-hosted with compliance review.

This document is engineering guidance, not legal advice.
