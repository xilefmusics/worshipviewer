import type { components } from '@/api/schema'

import {
  coerceMusicalKeyString,
  normalizeSongLinkId,
  normalizeSongLinkLanguage,
  normalizeSongFlow,
  songLinkForSetlistMutation,
  songLinkTempoEditorToWire,
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
    const ta = songLinkTempoEditorToWire(a[i].tempo)
    const tb = songLinkTempoEditorToWire(b[i].tempo)
    if (ta !== tb) return false
    const la = normalizeSongLinkLanguage(a[i].language)
    const lb = normalizeSongLinkLanguage(b[i].language)
    if (la !== lb) return false
    const fa = normalizeSongFlow(a[i].flow)
    const fb = normalizeSongFlow(b[i].flow)
    if (!songFlowEqual(fa, fb)) return false
  }
  return true
}

function songFlowEqual(a: ReturnType<typeof normalizeSongFlow>, b: ReturnType<typeof normalizeSongFlow>): boolean {
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
export function buildSetlistPatchBody(
  baseline: { title: string; songs: EditorSongLink[]; owner: string },
  draft: { title: string; songs: EditorSongLink[]; owner: string },
): SetlistPatchDirty | null {
  const body: SetlistPatchDirty = {}
  if (draft.title !== baseline.title) {
    body.title = draft.title
  }
  const draftOwner = draft.owner.trim()
  if (draftOwner && draftOwner !== baseline.owner) {
    body.owner = draftOwner
  }
  if (!songsEqual(draft.songs, baseline.songs)) {
    body.songs = draft.songs.map((l) => songLinkForSetlistMutation(l))
  }
  if (body.title === undefined && body.songs === undefined && body.owner === undefined) return null
  return body
}
