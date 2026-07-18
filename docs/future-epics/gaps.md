# Future epics — known gaps

Engineering notes for features not yet modeled in the current API/UI. Not commitments.

## Audio blobs (future epic H-1)

Today **`blob`** supports image MIME types for covers, avatars, and sheet attachments. Click tracks, pads, and other **audio** media need MIME validation, player delivery, and storage quota rules before UI entry points.

## Realtime multi-instance fan-out (future epic H-2)

Player Rooms provide the server-authoritative WebSocket player/projection protocol. Active sockets currently share updates only within one backend process; horizontal deployments still need shared pub/sub or a database change feed.

## Song links / `song::Link` naming (future epic H-3)

Setlist/collection embed **`shared::song::Link`** (id, key, tempo). A dedicated song-to-song link model collides with that name — use `data.tags` or metadata stopgap until an epic resolves schema (action plan §5.16).

## AV custom media (future epics M-1, M-2)

AV mode uses preset backgrounds and lyric-derived slides only. Custom slide blobs and uploaded backgrounds need blob/media model + projection sync payload extensions (action plan §5.17).

## External formats (future epic M-4)

SongBeamer / ProPresenter import-export requires new parsers and hub entry points; no server model yet.

## Admin panel (future epic M-3)

Platform admin today: CLI + monitoring HTTP routes. In-app admin UI is future work.

## RTL / logical layout (i18n)

Right-to-left locales are **not supported**. Layout uses physical CSS and LTR-only Tailwind. See [`../architecture/i18n-locale-policy.md`](../architecture/i18n-locale-policy.md).
