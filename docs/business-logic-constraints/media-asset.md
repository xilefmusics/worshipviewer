# Media assets

Applies to authenticated staging uploads and final asset delivery under `/api/v1/media/{media_id}/…`.

See also [media.md](./media.md) for the parent Media resource.

## Ownership and storage

- **BLC-MAST-001:** Media-owned assets belong to the same team `owner` as their parent Media row. Staging and final bytes are stored under opaque generated identities; filesystem paths never appear in API responses, Problem details, or client-visible errors.
- **BLC-MAST-002:** Staging identities are internal. Upload endpoints return the completed Media, and staged bytes are never readable through delivery endpoints.
- **BLC-MAST-003:** Final asset delivery requires read access to the owning team. Cross-team, guest-write, and nonexistent ids use the same concealed `404` semantics as other library resources.

## Upload transport

- **BLC-MAST-004:** `PUT /api/v1/media/{media_id}/uploads?kind=` streams a single request body to private staging storage without buffering the entire payload in memory. The `kind` query selects the configured byte limit (`video`, `audio`, `image`, `pdf`, `svg`).
- **BLC-MAST-005:** Oversize uploads are rejected with **413** when `Content-Length` exceeds the limit and while streaming when the body exceeds the limit regardless of headers. Partial staging files are removed on disconnect, limit failure, or handler error.
- **BLC-MAST-006:** Replacement upload requires write access to the parent owner. Atomic creation uses multipart metadata plus repeated file parts; neither endpoint is resumable.
- **BLC-MAST-012:** All accepted uploads finish validation, any required deck expansion, asset ingestion, and Media mutation before returning. Audio and video sources are stored synchronously without conversion. Image sources are PNG, JPEG, or sanitized SVG. Uploads whose kind does not match existing content are rejected and their staging data is removed.

## Delivery

- **BLC-MAST-007:** `GET` and `HEAD /api/v1/media/{media_id}/assets/{asset_id}/data` serve only `final` assets with private caching (`Cache-Control: private, max-age=3600, immutable`), weak `ETag`, normalized `Content-Type`, `X-Content-Type-Options: nosniff`, `Content-Length`, `Accept-Ranges: bytes`, conditional requests (`If-None-Match`, `If-Range`), single-range **206** responses, and **416** for unsatisfiable ranges.
- **BLC-MAST-008:** Staging assets and mismatched `media_id`/`asset_id` pairs return concealed **404**.

## Processing and finals (E5.4+)

- **BLC-MAST-013:** Audio and video uploads preserve the submitted bytes without probing or transcoding. Their normalized `Content-Type` must match the declared `video/*` or `audio/*` kind, or use the safe `application/octet-stream` fallback when unspecified. Atomic creation copies the source into a new final asset; replacement promotes the staged source directly. Metadata that would require probing (`duration_ms`, video `width`, and video `height`) is stored as `0`.
- **BLC-MAST-014:** On successful completion, staging bytes and superseded replacement assets are deleted. Failure or cancellation removes new temporary/final data without changing existing Media.
- **BLC-MAST-015:** Duplicate of uploaded media, including images, copies final bytes to new opaque asset ids; image asset kinds and the parent `is_background` flag are preserved. Staging and deck revisions are not duplicated.
- **BLC-MAST-017:** Deck expansion ingests each resulting page as a new **final** asset (`image/png`, `image/jpeg`, `image/svg+xml`, or `application/pdf`). Draft page finals are readable through delivery for authenticated preview; they are not listed in Media `content` until commit. Staging sources are deleted after successful expansion.
- **BLC-MAST-018:** PDF page counting and splitting use the in-process `lopdf` library. PDF, image, and SVG deck sources finish expansion before the upload response is returned. A deck may contain at most 500 pages. Exceeding the cap fails the request without creating a partial stored deck.

## Operations and readiness

- **BLC-MAST-009:** Configurable staging/final directories, per-kind limits, and deck-processing timeouts are applied without external media tools. PDF deck uploads are parsed and split synchronously in-process.
- **BLC-MAST-010:** Startup and periodic reconciliation remove abandoned staging files and stale staging metadata older than the configured age when they are not associated with an active upload or in-flight processing operation.
- **BLC-MAST-011:** Startup and periodic reconciliation also delete asset records and filesystem objects whose owning Media no longer exists.

## Blob boundary

- **BLC-MAST-016:** Media assets are separate from image-only Blob resources. Existing Blob upload, validation, and caching behavior for avatars, covers, and song attachments is unchanged.
