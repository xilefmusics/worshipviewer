# Platform admin and team library content

Cross-cutting rule for **library** resources (songs, collections, setlists, blobs) and team visibility.

## Rule

- **BLC-ADMIN-001:** A platform **`admin`** user (**`User.role == Admin`**) does **not** receive broader **read** access to non-public teams or their library content than a normal user. Listing and **GET** paths use the same membership-derived scope as everyone else (`AuthorizationContext::read_teams` / equivalent SQL): **`team:public`** plus teams the user **owns** or is a **member** of.
- **BLC-ADMIN-002:** Platform **`admin`** does **not** receive **library edit** (mutate) rights on a team’s library **solely** because **`role = admin`** on the user. **PUT**, **PATCH**, **DELETE**, and moves require the same team **library edit** membership as non-admins (`AuthorizationContext::write_teams` / team **`admin`** or **`content_maintainer`** on that team).

Resource-specific wording appears in **BLC-SONG-002**, **BLC-COLL-002**, **BLC-SETL-002**, **BLC-BLOB-002**, and related **move** rules; this document is the single cross-reference for the invariant.
