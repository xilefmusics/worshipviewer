# Business logic constraints for the blob resource

## Static

- **BLC-BLOB-001:** Every blob belongs to exactly one **owning team** (the **`owner`** in responses).
- **BLC-BLOB-002:** Listing, fetching metadata, and downloading bytes require the caller to be allowed to **read that team’s library**; mutating or deleting a blob requires **library edit** rights on that team. Platform **admin** does **not** gain blob edit solely by role.
- **BLC-BLOB-003:** **`PUT`** MUST NOT change **`owner`**.
- **BLC-BLOB-004:** New blobs are created as metadata records (**POST**). Binary bytes are supplied via **`PUT /api/v1/blobs/{id}/data`** with an appropriate **`Content-Type`** (same API surface as metadata **GET …/data**). Until bytes are written, **GET …/data** MAY serve empty or placeholder content.
- **BLC-BLOB-005:** **`file_type`** on create/update MUST be among the image types the API accepts: **`image/png`**, **`image/jpeg`**, **`image/svg+xml`**, and the deprecated alias **`image/svg`**; unsupported values THEN **400**.

## List pagination

- **`GET /blobs`** supports **`page`** and **`page_size`** per [list-pagination.md](./list-pagination.md).

## When / then

- **BLC-BLOB-006:** WHEN the caller may not read the owning team’s library THEN blob **GET** / list / **…/data** respond **404** (not **403**).
- **BLC-BLOB-007:** WHEN the caller has **guest**-level membership on the owning team and attempts **PUT** or **DELETE** THEN the API responds **404**.
- **BLC-BLOB-008:** WHEN the caller is the personal-team **owner**, or **admin** / **content_maintainer** on the owning team, THEN **PUT** and **DELETE** are allowed (subject to validation).
- **BLC-BLOB-009:** WHEN **POST** omits **`owner`** THEN the new blob’s **`owner`** IS the caller’s **personal** team. WHEN **POST** includes **`owner`**, the same team ACL rules apply as for collections ([collection.md](./collection.md) **BLC-COLL-009**).
- **BLC-BLOB-010:** WHEN **GET /blobs** or **GET /blobs/{id}** runs THEN only blobs whose **`owner`** team the caller may read are included or returned; catalog-wide readable material MAY appear without team membership where the product exposes it.
- **BLC-BLOB-011:** WHEN **GET …/data** runs THEN the same visibility rules as metadata **GET** apply; IF bytes are available THEN they are served.
- **BLC-BLOB-016:** **`GET /blobs/{id}/data`** responses include a weak **`ETag`** over stored bytes, **`Content-Length`**, and **`Cache-Control: private, max-age=3600, immutable`**. **`If-None-Match`** matching the current **`ETag`** yields **304** with an empty body.
- **BLC-BLOB-012:** WHEN **PUT** runs THEN only **`file_type`**, **`width`**, **`height`**, and **`ocr`** may change.
- **BLC-BLOB-020:** WHEN **PATCH /blobs/{id}** runs THEN only fields present in the body are updated; omitted fields are unchanged; unknown fields are rejected (**`deny_unknown_fields`**), matching the pattern in **BLC-SONG-019**. Optimistic concurrency uses **`If-Match`** with the resource **ETag**, consistent with other library resources.
- **BLC-BLOB-013:** WHEN **DELETE** succeeds THEN the blob no longer appears in the API and associated stored bytes MAY be removed.

## Cascading deletes and dependents

- **BLC-BLOB-014:** WHEN a blob used as a collection **`cover`** IS **DELETE**d THEN the collection is **not** removed; **`GET /collections/{id}`** still returns the collection, but **`cover`** MAY reference a deleted blob id until the collection is updated (e.g. **`PUT /collections/{id}/cover`** or **`PATCH`** with a new **`cover`**). **`GET /blobs/{id}/data`** for the deleted blob id responds **404**; clients SHOULD refresh cover references after blob deletes.
- **BLC-BLOB-015:** WHEN a **user** account IS deleted THEN blobs owned by their **personal** team disappear with that team (see [user.md](./user.md)).

## Move (`POST /blobs/{id}/move`)

- **BLC-BLOB-017:** **`POST /blobs/{id}/move`** with **`{ "owner": "<team id>" }`** requires **library edit** on **both** the blob’s current owning team and the target team; otherwise **404** (or **400** for malformed **`owner`**). Platform **admin** MUST NOT bypass library write for move.
- **BLC-BLOB-018:** WHEN the target **`owner`** equals the current owning team THEN **200** with unchanged metadata (idempotent).
- **BLC-BLOB-019:** Move changes **metadata** **`owner`** only; stored bytes stay associated with the blob id (no cross-resource rewriting).
