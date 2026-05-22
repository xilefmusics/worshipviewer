import type { components } from '@/api/schema'

import {
  coerceMusicalKeyString,
  normalizeSongLinkId,
  songLinkForSetlistMutation,
  type EditorSongLink,
} from '@/lib/setlist-song-links'

export type Setlist = components['schemas']['Setlist']
export type SetlistPatchDirty = components['schemas']['PatchSetlist']

function songsEqual(a: EditorSongLink[], b: EditorSongLink[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (normalizeSongLinkId(a[i].id) !== normalizeSongLinkId(b[i].id)) return false
    const ka = coerceMusicalKeyString(a[i].key)
    const kb = coerceMusicalKeyString(b[i].key)
    if (ka !== kb) return false
  }
  return true
}

/**
 * PATCH body with only dirty top-level fields; `null` when nothing to send.
 */
export function buildSetlistPatchBody(
  baseline: Pick<Setlist, 'title' | 'songs' | 'owner'>,
  draft: { title: string; songs: EditorSongLink[]; owner: string },
): SetlistPatchDirty | null {
  const body: SetlistPatchDirty = {}
  if (draft.title !== baseline.title) {
    body.title = draft.title
  }
  if (draft.owner !== baseline.owner) {
    body.owner = draft.owner
  }
  const baseSongs: EditorSongLink[] = baseline.songs.map((l) => ({
    id: normalizeSongLinkId(l.id),
    key: coerceMusicalKeyString(l.key),
  }))
  if (!songsEqual(draft.songs, baseSongs)) {
    body.songs = draft.songs.map((l) => songLinkForSetlistMutation(l))
  }
  if (body.title === undefined && body.songs === undefined && body.owner === undefined) return null
  return body
}
