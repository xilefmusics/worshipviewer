import type { components } from '@/api/schema'

import { songDataSnapshotsEqual } from '@/lib/song-editor-state'

export type PatchSongBody = components['schemas']['PatchSong']
export type PatchSongData = components['schemas']['PatchSongData']

/**
 * PATCH body with full `data` snapshot when dirty; `null` when unchanged.
 * Song editor always sends a complete `PatchSongData` snapshot per save flush.
 */
export function buildSongPatchBody(
  baseline: PatchSongData,
  draft: PatchSongData,
): PatchSongBody | null {
  if (songDataSnapshotsEqual(baseline, draft)) return null
  return { data: draft }
}
