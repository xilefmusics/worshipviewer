import type { components } from '@/api/schema'

import {
  coerceMusicalKeyString,
  normalizeSongLinkId,
  normalizeSongLinkNr,
  normalizeSongFlow,
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
    if (!songFlowEqual(normalizeSongFlow(a[i].flow), normalizeSongFlow(b[i].flow))) return false
  }
  return true
}

function songFlowEqual(
  a: ReturnType<typeof normalizeSongFlow>,
  b: ReturnType<typeof normalizeSongFlow>,
): boolean {
  if (a === b) return true
  if (!a || !b) return false
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i += 1) {
    const sa = a[i]
    const sb = b[i]
    if (!sa || !sb) return false
    if (sa.section_title !== sb.section_title) return false
    if (sa.occurrence_index !== sb.occurrence_index) return false
    if (sa.repeat_count !== sb.repeat_count) return false
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
