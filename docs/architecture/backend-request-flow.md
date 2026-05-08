# Backend Request Flow

End-to-end path of an HTTP request through the system — from Actix
entry point to SurrealDB and back.

---

## Logging and observability

Subscriber setup lives in [`backend/src/observability.rs`](../../backend/src/observability.rs): `observability::init()` runs once from `main`, installs `tracing-subscriber` with an [`EnvFilter`](https://docs.rs/tracing-subscriber/latest/tracing_subscriber/filter/struct.EnvFilter.html) (default `info`, overridable with **`RUST_LOG`**), and enables the **`tracing-log`** bridge so crates that use the `log` facade (Actix, SurrealDB, lettre, etc.) emit into the same sink.

**Output format:** With **`LOG_FORMAT=json`**, **`LOG_FORMAT=compact`**, or **`LOG_FORMAT=pretty`**, operators force a formatter regardless of environment. If `LOG_FORMAT` is unset, JSON is used when **`WORSHIP_PRODUCTION`** is truthy or **`RUST_ENV=production`**, otherwise compact (human-friendly) lines.

**`RUST_LOG` examples:**

- `RUST_LOG=info` — default.
- `RUST_LOG=backend=debug,info` — debug for this crate only.
- `RUST_LOG=backend::auth=trace,surrealdb=info` — verbose auth, quieter database logs.

**Request correlation:** [`tracing-actix-web`](https://docs.rs/tracing-actix-web) builds a root span per HTTP request via [`WorshipRootSpan`](../../backend/src/request_id.rs). The request-id middleware stores the same id in request extensions (for Problem Details `instance`) and echoes it as **`X-Request-Id`**. If the client sends a W3C **`traceparent`** header, its span id is preferred as the request id; otherwise a UUID is generated. Authenticated requests record **`user_id`** on the current span from [`RequireUser`](../../backend/src/auth/middleware.rs). Log lines emitted while handling a request inherit those fields.

**Regression tests:** Canary tests in [`backend/src/audit_events_tests.rs`](../../backend/src/audit_events_tests.rs) (using [`tracing-test`](https://docs.rs/tracing-test)) assert that each catalogued `audit.*` event still appears when the corresponding code path runs.

### Canonical log fields

Use these names on new spans and structured log lines so aggregators and grep stay consistent (see also [logging-review.md §5](../logging-review.md)):

| Field | Type | Meaning |
|-------|------|---------|
| `request_id` | string | UUID or W3C `traceparent` span id; set on the root HTTP span. |
| `user_id` | string | Authenticated user id; recorded after session validation. |
| `session_id` | string | Session id being created, validated, or revoked. |
| `team_id` | string | Resolved team context for the request or mutation. |
| `route` | string | Matched Actix route pattern (e.g. `/api/v1/songs/{id}`). |
| `method` | string | HTTP method. |
| `status` | u16 | HTTP response status code. |
| `latency_ms` | u64 | Total request latency in milliseconds. |
| `event` | string | Stable event name (`startup`, `oidc.provider.registered`, or `audit.*`). |
| `audit` | bool | `true` on audit lines emitted via `audit!`. |
| `error` | Display | Primary error message (`%err`). |
| `error_debug` | Debug | Developer-oriented detail (`?err`). |
| `error_source_chain` | string | `Error::source` chain joined with ` <- `. |
| `target` | string | Logical I/O boundary tag for `log_error_chain` (e.g. `mail.transport_send`). |
| `context` / `migration` | string | Surreal per-statement failures: app repo context vs migration script name. |

---

## Overview

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│  HTTP Request                                                                   │
└──────────┬──────────────────────────────────────────────────────────────────────┘
           │
           ▼
┌────────────────────────────┐
│  RequireUser middleware    │  loads session + user + teams in one DB round-trip,
│                            │  injects ReqData<AuthorizationContext>
└──────────┬─────────────────┘
           │
           ▼
┌──────────────────────────────────────────────────────────────────────────────────┐
│  resources/rest.rs  →  /api/v1                                                   │
│                                                                                  │
│  Mounts per-resource scopes:                                                     │
│  ┌──────────┐ ┌──────────────┐ ┌───────────┐ ┌──────┐ ┌──────┐ ┌──────┐        │
│  │ /blobs   │ │ /collections │ │ /setlists │ │/songs│ │/teams│ │/users│        │
│  │ blob::   │ │ collection:: │ │ setlist:: │ │song::│ │team::│ │user::│        │
│  │ rest     │ │ rest         │ │ rest      │ │rest  │ │rest  │ │rest  │        │
│  └────┬─────┘ └──────┬───────┘ └─────┬─────┘ └──┬───┘ └──┬───┘ └──┬───┘        │
└───────┼──────────────┼───────────────┼──────────┼────────┼────────┼─────────────┘
        │              │               │          │        │        │
        ▼              ▼               ▼          ▼        ▼        ▼
┌──────────────────────────────────────────────────────────────────────────────────┐
│  Service Layer  (e.g. SongService<R, L, C, U>, BlobService<R, S>, …)             │
│                                                                                  │
│  ┌───────────┐ ┌─────────────────┐ ┌────────────────┐ ┌───────────┐             │
│  │BlobService│ │CollectionService│ │SetlistService  │ │SongService│  ...         │
│  │ <R, S>    │ │ <R, L>          │ │ <R, L>         │ │<R,L,C,U>  │             │
│  └──┬──┬─────┘ └──┬──┬────────────┘ └──┬──┬──────────┘ └┬──┬──┬─┬─┘             │
│     │  │          │  │               │  │           │  │  │ │               │
└─────┼──┼──────────┼──┼───────────────┼──┼───────────┼──┼──┼─┼───────────────┘
      │  │          │  │               │  │           │  │  │ │
      │  │          │  │               │  │           │  │  │ └─► UserRepository / UserCollectionUpdater
      │  │          │  │               │  │           │  │  └──► CollectionRepository
      │  │          │  │               │  │           │  └──────► LikedSongIds
      │  │          │  │               │  └───────────┼────────► SetlistRepository / …
      │  │          │  └───────────────┼───────────────┘        └──► *Repository trait
      │  └──────────┼──────────────────┼────────────────────────────► BlobStorage trait
      └─────────────┴──────────────────┴────────────────────────────► *Repository trait
                                                                    │
                                          AuthorizationContext      │
                                          (read_teams / write_teams│
                                           from handler — no extra │
                                           team service in stack)   │
                                                                    ▼
┌──────────────────────────────────────────────────────────────────────────────────┐
│  Repository Layer  (trait objects + SurrealDB implementations)                    │
│                                                                                  │
│  SurrealBlobRepo   SurrealCollectionRepo   SurrealSetlistRepo   SurrealSongRepo  │
│  SurrealTeamRepo   SurrealTeamInvitationRepo   SurrealUserRepo  SurrealSessionRepo│
│  FsBlobStorage                                                                   │
└──────────┬───────────────────────────────────────────────────────────────────────┘
           │
           ▼
┌──────────────────────┐     ┌──────────────────────┐
│  SurrealDB (Database)│     │  Filesystem (blobs)   │
└──────────────────────┘     └──────────────────────┘
```

---

## Step-by-Step Request Lifecycle

### 1. Actix receives the HTTP request

`main.rs` builds the `App`, registers all `ServiceHandle`s as `app_data`,
and mounts `resources::rest::scope()` under `/api/v1`.

### 2. `RequireUser` middleware

Extracts the session id from the **`Authorization: Bearer …`** header or session cookie, calls [`load_authorization_context`](../../backend/src/auth/surreal_repo.rs) (single SurrealQL round-trip: session row, user profile slice, and membership-derived team rows). If there is no session row, or `session.expired` is true, the middleware returns **401** — expired sessions are **not** deleted automatically.

On success it inserts **`ReqData<AuthorizationContext>`** into request extensions (plus audit/session extensions). **`RequireAdmin`** reads the same type and checks `AuthorizationContext::is_app_admin()`.

### 3. `resources/rest.rs` routes to a resource scope

All resource scopes are mounted here:

```rust
web::scope("/api/v1")
    .wrap(RequireUser)
    .service(blob::rest::scope())       // /api/v1/blobs
    .service(collection::rest::scope()) // /api/v1/collections
    .service(setlist::rest::scope())    // /api/v1/setlists
    .service(song::rest::scope())       // /api/v1/songs
    .service(team::rest::scope())       // /api/v1/teams
    .service(team::invitations_accept_scope()) // /api/v1/invitations
    .service(user::rest::scope())       // /api/v1/users (nests session routes)
```

### 4. Resource `rest.rs` handler

The handler extracts **`ReqData<AuthorizationContext>`** (and service `Data`, paths, JSON, etc.) and passes **`&ctx`** into the service. There is no separate per-request team resolver: team ids come from the context loaded in middleware.

```rust
#[get("/{id}")]
async fn get_one(
    svc: Data<XxxServiceHandle>,
    ctx: ReqData<AuthorizationContext>,
    path: Path<String>,
) -> Result<HttpResponse, AppError> {
    let result = svc.get_one_for_user(&ctx, &path).await?;
    Ok(HttpResponse::Ok().json(result))
}
```

**`GET /users/me`** is special: the context carries only the authorization slice; the handler loads the full **`User`** via **`UserService::get_user`** for timestamps and counters.

### 5. `AuthorizationContext` team helpers (in-memory)

[`AuthorizationContext`](../../backend/src/auth/context.rs) holds **`AuthorizedSession`**, **`AuthorizedUser`**, and an **`Arc<[AuthorizedTeam]>`**. Library services call synchronous helpers (no extra DB hit):

| Operation | Method | Notes |
|---|---|---|
| List / Get | `ctx.read_teams()` | `team:public` plus every team the user owns or is a member of (no platform-admin shortcut). |
| Update / Delete / moves | `ctx.write_teams()` | Subset where team role is admin or content_maintainer; excludes `team:public`. |
| Personal team id | `ctx.personal_team()` | Finds the row whose owner is the current user. |
| Owner write check | `ctx.require_write_access_to_owner(&owner_team_record)` | Aligns with historical **404** behavior when the caller cannot write that owner team. |

OIDC bootstrap before a session exists uses **`load_authorization_context_for_user`** ([`auth/surreal_repo.rs`](../../backend/src/auth/surreal_repo.rs)) to build the same shape with a synthetic session id (`bootstrap:<user_id>`).

### 6. Repository executes the query

The service delegates to the repository trait method with **`&[RecordId]`**
read-team or write-team slices derived from the context. The SurrealDB implementation runs a query like:

```sql
SELECT * FROM xxx WHERE owner IN $teams
```

For single-record lookups without a `WHERE` clause, the Rust-side
`belongs_to` helper performs the ownership check after the `SELECT`.

### 7. Record → DTO conversion

The `SurrealXxxRepo` receives a `XxxRecord` from SurrealDB and converts
it into the shared `Xxx` DTO via `into_xxx()`.

### 8. Response

The handler wraps the DTO in an `HttpResponse` with the appropriate
status code:

| Action | Status |
|---|---|
| List / Get | `200 OK` |
| Create | `201 Created` |
| Update | `200 OK` |
| Delete | `200 OK` (returns the deleted entity) |

---

## Authorization Flow (detailed)

```
HTTP request
  │
  ▼
RequireUser middleware
  │  load_authorization_context(db, session_id)
  │  → 401 if missing session row OR session.expired == true (row kept)
  │
  ▼
ReqData<AuthorizationContext> in extensions
  │
  ├── ctx.read_teams() / ctx.write_teams() / ctx.personal_team()
  │      (in-memory from middleware payload — no per-handler team queries)
  │
  ▼
rest.rs handler ─── passes &ctx into service
  │
  ▼
Service method(&ctx, ...)
  │
  └── Repository method(&[RecordId], ...)
      └─ SurrealQL: WHERE owner IN $teams
```

ACL regression coverage: **`team::model` tests** **`auth_ctx_*_matches_naive_rust_filter`** compare **`AuthorizationContext::read_teams` / `write_teams`** (from **`load_authorization_context_for_user`**) against a naive **`TeamFetched`** walk using **`can_read_team(..., false)`** / **`team_content_writable`**.

---

## Top-Level Wiring Files

### `resources/mod.rs`

Declares every resource as a public sub-module and re-exports their shared
DTOs for ergonomic access from the rest of the crate.

| Declaration | Purpose |
|---|---|
| `pub mod rest` | Top-level API scope aggregator |
| `pub(crate) mod common` | Shared helpers used across resources |
| `pub mod blob`, `collection`, `setlist`, `song`, `team`, `user` | Resource sub-modules |
| `pub use blob::{Blob, CreateBlob}`, ... | Re-exports shared DTOs |

### `resources/rest.rs`

Creates the `/api/v1` scope, wraps it with `RequireUser`, and mounts
every resource's `rest::scope()`. Team invitation accept is mounted
separately at `/api/v1/invitations/...`.

### `resources/common.rs`

Shared helper functions and DB record types used by multiple resources.

| Helper | Purpose |
|---|---|
| `resource_id(table, id)` | Parse/validate a SurrealDB record ID string |
| `belongs_to(owner, teams)` | Rust-side ownership check for single-record SELECTs |
| `song_thing(id)` / `blob_thing(id)` | Coerce a string into a typed `RecordId` |
| `player_from_song_links(liked, links)` | Build a `Player` from fetched song links |
| `SongLinkRecord` | DB record shape for embedded song references |
| `FetchedSongRecord` | Fully-fetched song record (via SurrealDB `FETCH`) |

---

## Per-Resource Specifics

### `blob/` — Binary file storage

| File | Key Types |
|---|---|
| `model.rs` | `BlobRecord` |
| `repository.rs` | `trait BlobRepository` |
| `surreal_repo.rs` | `SurrealBlobRepo` |
| `storage.rs` | `trait BlobStorage`, `FsBlobStorage` |
| `service.rs` | `BlobService<R, S>` where `S: BlobStorage` |
| `rest.rs` | `/blobs` scope; file download returns `NamedFile` |

Unique: takes a `BlobStorage` backend in addition to the repository.
The download handler returns `actix_files::NamedFile`
rather than JSON.

### `song/` — Song sheets with chords/lyrics

| File | Key Types |
|---|---|
| `model.rs` | `SongRecord`, `LikeRecord` |
| `repository.rs` | `trait SongRepository` |
| `surreal_repo.rs` | `SurrealSongRepo` |
| `liked.rs` | `trait LikedSongIds` |
| `service.rs` | `SongService<R, L, C, U>` |
| `rest.rs` | `/songs` scope |

Most interconnected service: creating a song auto-adds it to the user's
default collection via `CollectionRepository` and `UserCollectionUpdater`.

### `collection/` — Groupings of songs

| File | Key Types |
|---|---|
| `model.rs` | `CollectionRecord`, `CollectionSongsRecord` |
| `repository.rs` | `trait CollectionRepository` (includes `add_song_to_collection`) |
| `surreal_repo.rs` | `SurrealCollectionRepo` |
| `service.rs` | `CollectionService<R, L>` |
| `rest.rs` | `/collections` scope |

`CollectionRepository` is also a dependency of `SongService` for the
default-collection auto-add. Uses `LikedSongIds`.

### `setlist/` — Ordered song lists for worship sessions

| File | Key Types |
|---|---|
| `model.rs` | `SetlistRecord`, `SetlistSongsRecord` |
| `repository.rs` | `trait SetlistRepository` |
| `surreal_repo.rs` | `SurrealSetlistRepo` |
| `service.rs` | `SetlistService<R, L>` |
| `rest.rs` | `/setlists` scope |

Structurally similar to collection. Depends on `SetlistRepository`
and `LikedSongIds`.

### `team/` — Teams, membership, and ACL

| File | Key Types |
|---|---|
| `model.rs` | `TeamCreatePayload`, `DbTeamMember`, `TeamFetched`, ACL helpers |
| `repository.rs` | `trait TeamRepository` |
| `surreal_repo.rs` | `SurrealTeamRepo` |
| `invitation_model.rs` | `InvitationRow`, `InvitationAcceptRow`, helpers |
| `invitation_repository.rs` | `trait TeamInvitationRepository` |
| `invitation_surreal_repo.rs` | `SurrealTeamInvitationRepo` |
| `service.rs` | `TeamService<R>` |
| `rest.rs` | `/teams` scope + `/invitations/{id}/accept` |

Team listing uses **`fetch_teams_for_user(..., platform_admin_shortcut: false)`** — platform **`User.role == Admin`** does not expand visibility beyond membership (same rule as library reads).

### `user/` — User accounts (admin-only CRUD)

| File | Key Types |
|---|---|
| `model.rs` | `UserRecord` |
| `repository.rs` | `trait UserRepository` |
| `surreal_repo.rs` | `SurrealUserRepo` |
| `service.rs` | `UserService<R, T>` where `T: TeamRepository` |
| `rest.rs` | `/users` scope, `/users/me`; nests session routes; admin routes use `RequireAdmin` |

### `user/session/` — Login sessions

| File | Key Types |
|---|---|
| `model.rs` | `SessionRecord`, `SessionCreateRecord` |
| `repository.rs` | `trait SessionRepository` |
| `surreal_repo.rs` | `SurrealSessionRepo` |
| `service.rs` | `SessionService<S, U>` where `U: UserRepository` |
| `rest.rs` | Session routes (mounted inside `user/rest.rs`) |

`SessionServiceHandle` is also used by `auth/rest.rs` for the logout flow.

---

## Cross-Resource Dependency Graph

```
RequireUser / `load_authorization_context`
          │
          ▼
   AuthorizationContext  (auth/context.rs — session + user slice + teams[])
          │
          ├──────────────────────────────────────────────┐
          ▼                ▼                ▼            ▼
   ┌─────────────┐  ┌───────────┐  ┌──────────────┐  ┌───────────┐
   │ BlobService │  │SongService│  │CollectionSvc │  │SetlistSvc │
   └──────┬──────┘  └─────┬─────┘  └──────┬───────┘  └─────┬─────┘
          │               │               │                │
          ▼               │               ▼                ▼
   ┌─────────────┐        │        ┌──────────────┐  ┌───────────┐
   │ BlobStorage │        │        │CollectionRepo│  │SetlistRepo│
   └─────────────┘        │        └──────────────┘  └───────────┘
                          │               ▲
                          │               │ (auto-add song to default collection)
                          ├───────────────┘
                          │
                          ▼
                   ┌─────────────┐
                   │LikedSongIds │
                   └──────┬──────┘
                          │
          ┌───────────────┤
          ▼               ▼
   CollectionService  SetlistService


   ┌─────────────┐          ┌─────────────────┐
   │ UserService │───────►  │ TeamRepository  │  (creates personal team)
   └──────┬──────┘          └─────────────────┘
          │
          ▼
   ┌──────────────┐         ┌─────────────────┐
   │SessionService│────────►│ UserRepository  │  (lookup user by ID)
   └──────────────┘         └─────────────────┘
```

---

## Resource Comparison Matrix

| | blob | song | collection | setlist | team | user | session |
|---|---|---|---|---|---|---|---|
| **Shared DTO** | yes | yes | yes | yes | yes | yes | yes |
| **Repository trait** | `BlobRepository` | `SongRepository` | `CollectionRepository` | `SetlistRepository` | `TeamRepository` + `TeamInvitationRepository` | `UserRepository` | `SessionRepository` |
| **Surreal impl** | `SurrealBlobRepo` | `SurrealSongRepo` | `SurrealCollectionRepo` | `SurrealSetlistRepo` | `SurrealTeamRepo` + `SurrealTeamInvitationRepo` | `SurrealUserRepo` | `SurrealSessionRepo` |
| **Service** | `BlobService<R,S>` | `SongService<R,L,C,U>` | `CollectionService<R,L>` | `SetlistService<R,L>` | `TeamService<R>` | `UserService<R,T>` | `SessionService<S,U>` |
| **Team-scoped** | yes | yes | yes | yes | own ACL | no | no |
| **Extra files** | `storage.rs` | `liked.rs` | — | — | `invitation_model.rs`, `invitation_repository.rs`, `invitation_surreal_repo.rs` | — | — |
| **Extra dependencies** | `BlobStorage` | `LikedSongIds`, `CollectionRepo`, `UserCollectionUpdater` | `LikedSongIds` | `LikedSongIds` | — | `TeamRepository` | `UserRepository` |

---

## Audit event catalog

Structured audit lines use `tracing` with **`audit = true`** and a stable **`event`** name (macro `audit!` in [backend/src/observability.rs](../../backend/src/observability.rs)). Field names follow the [canonical log fields](#canonical-log-fields) table above.

| `event` | Where emitted | Typical fields |
|---------|---------------|----------------|
| `audit.auth.login.success` | OIDC callback success, OTP verify success | `provider`, `user_id`, `session_id` |
| `audit.auth.login.failure` | OIDC / OTP error paths | `provider`, `reason`, `email_hash` (no raw email) |
| `audit.auth.otp.requested` | After OTP mail send succeeds | `email_domain`, `delivered` |
| `audit.auth.logout` | `/auth/logout` | `session_id`, `had_cookie` |
| `audit.session.created` | `SessionService::create_session` | `session_id`, `user_id`, `ttl_seconds` |
| `audit.session.revoked` | Logout, session DELETE handlers | `session_id`, `user_id`, `actor_user_id` |
| `audit.user.created` | `UserService::create_user` | `user_id`, `email`, `role` |
| `audit.user.deleted` | Admin delete user | `user_id`, `actor_user_id` |
| `audit.team.role.changed` | Team member list update with role diff | `team_id`, `target_user_id`, `old_role`, `new_role`, `actor_user_id` |
| `audit.team.invitation.accepted` | Invitation accept success | `team_id`, `invitation_id`, `user_id` |
| `audit.rate_limit.rejected` | `AuditRateLimit429` middleware on HTTP 429 | `route`, `client_ip`, optional `user_id` |

**Startup / OIDC registration (not audit-flagged):** `event = "startup"` in `main.rs`; `event = "oidc.provider.registered"` per provider in `auth/oidc/client.rs`.

**Request correlation:** HTTP handling uses `tracing-actix-web` + request ID middleware; logs inherit `request_id` and (when authenticated) `user_id` on the root span.
