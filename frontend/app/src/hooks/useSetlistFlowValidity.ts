import type { components } from '@/api/schema'
import { useEffect, useMemo, useState } from 'react'

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
      queueMicrotask(() => {
        if (!cancelled) setStaleBySlotId(new Map())
      })
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
        if (!cancelled) setStaleBySlotId(next)
      } catch {
        if (!cancelled) setStaleBySlotId(new Map())
      }
    })()

    return () => {
      cancelled = true
    }
  }, [validityKey, slotRows, songs])

  return staleBySlotId
}
