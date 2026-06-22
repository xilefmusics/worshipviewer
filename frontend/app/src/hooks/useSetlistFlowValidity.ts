import type { components } from '@/api/schema'
import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react'

import { getChordEngine } from '@/lib/chord-engine'
import { isSongFlowValid } from '@/lib/player/resolve-song-flow'
import type { ChordSongData } from '@/ports/chord-engine'

type Song = components['schemas']['Song']

export type SlotRowForFlowValidity = {
  slotId: string
  link: { flow?: components['schemas']['SongFlowItem'][] | null }
}

function flowValidityKey(
  slotRows: SlotRowForFlowValidity[],
  songs: (Song | null | undefined)[],
): string {
  return slotRows
    .map((row, index) => {
      const song = songs[index]
      const flow = row.link.flow == null ? '' : JSON.stringify(row.link.flow)
      const songId = song?.id ?? ''
      const notASong = song?.not_a_song ? 'blob' : 'chord'
      return `${row.slotId}:${songId}:${notASong}:${flow}`
    })
    .join('|')
}

function staleFlowMapsEqual(
  left: ReadonlyMap<string, boolean>,
  right: ReadonlyMap<string, boolean>,
): boolean {
  if (left.size !== right.size) return false
  for (const [key, value] of left) {
    if (right.get(key) !== value) return false
  }
  return true
}

function commitStaleFlowMap(
  setStaleBySlotId: Dispatch<SetStateAction<ReadonlyMap<string, boolean>>>,
  next: ReadonlyMap<string, boolean>,
) {
  setStaleBySlotId((prev) => (staleFlowMapsEqual(prev, next) ? prev : next))
}

/** Map of setlist slot ids whose saved custom flow no longer applies to the current song. */
export function useSetlistFlowValidity(
  slotRows: SlotRowForFlowValidity[],
  songs: (Song | null | undefined)[],
): ReadonlyMap<string, boolean> {
  const validityKey = useMemo(() => flowValidityKey(slotRows, songs), [slotRows, songs])
  const [staleBySlotId, setStaleBySlotId] = useState<ReadonlyMap<string, boolean>>(() => new Map())

  useEffect(() => {
    let cancelled = false

    const slotsToValidate = slotRows
      .map((row, index) => ({ row, index, song: songs[index] }))
      .filter(
        (entry): entry is { row: SlotRowForFlowValidity; index: number; song: Song } =>
          entry.row.link.flow != null &&
          entry.row.link.flow.length > 0 &&
          entry.song != null &&
          !entry.song.not_a_song,
      )

    if (slotsToValidate.length === 0) {
      commitStaleFlowMap(setStaleBySlotId, new Map())
      return () => {
        cancelled = true
      }
    }

    void (async () => {
      try {
        const engine = await getChordEngine()
        const next = new Map<string, boolean>()
        for (const { row, song } of slotsToValidate) {
          const flow = row.link.flow
          if (flow == null || flow.length === 0) continue
          const valid = isSongFlowValid(engine, song.data as ChordSongData, flow)
          if (!valid) next.set(row.slotId, true)
        }
        if (!cancelled) commitStaleFlowMap(setStaleBySlotId, next)
      } catch {
        if (!cancelled) commitStaleFlowMap(setStaleBySlotId, new Map())
      }
    })()

    return () => {
      cancelled = true
    }
    // validityKey encodes slotRows + songs; avoid unstable array refs from useQueries in deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- slotRows/songs are captured when validityKey changes
  }, [validityKey])

  return staleBySlotId
}
