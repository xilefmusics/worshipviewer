import type { components } from '@/api/schema'

import {
  coerceMusicalKeyString,
  normalizeSongLinkId,
  normalizeSongLinkNr,
  songLinkForCollectionMutation,
  type EditorSongLink,
} from '@/lib/setlist-song-links'

export type Collection = components['schemas']['Collection']
export type CollectionPatchDirty = components['schemas']['PatchCollection']

function collectionSongsEqual(a: EditorSongLink[], b: EditorSongLink[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (normalizeSongLinkId(a[i].id) !== normalizeSongLinkId(b[i].id)) return false
    const ka = coerceMusicalKeyString(a[i].key)
    const kb = coerceMusicalKeyString(b[i].key)
    if (ka !== kb) return false
    if (normalizeSongLinkNr(a[i].nr) !== normalizeSongLinkNr(b[i].nr)) return false
  }
  return true
}

/**
 * PATCH body with only dirty top-level fields; `null` when nothing to send.
 */
export function buildCollectionPatchBody(
  baseline: { title: string; songs: EditorSongLink[]; cover: string; owner: string },
  draft: { title: string; songs: EditorSongLink[]; cover: string; owner: string },
): CollectionPatchDirty | null {
  const body: CollectionPatchDirty = {}
  if (draft.title !== baseline.title) {
    body.title = draft.title
  }
  if (draft.cover !== baseline.cover) {
    body.cover = draft.cover
  }
  if (draft.owner !== baseline.owner) {
    body.owner = draft.owner
  }
  if (!collectionSongsEqual(draft.songs, baseline.songs)) {
    body.songs = draft.songs.map((l) => songLinkForCollectionMutation(l))
  }
  if (
    body.title === undefined &&
    body.songs === undefined &&
    body.cover === undefined &&
    body.owner === undefined
  ) {
    return null
  }
  return body
}
