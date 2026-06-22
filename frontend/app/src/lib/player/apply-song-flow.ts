import { useEffect, useState } from 'react'

import type { components } from '@/api/schema'
import { getChordEngine } from '@/lib/chord-engine'
import type { ChordEngine, ChordSongData, SongFlowItem } from '@/ports/chord-engine'

type Song = components['schemas']['Song']
type PlayerItem = components['schemas']['PlayerItem']

export function hasCustomSongFlow(flow: SongFlowItem[] | null | undefined): boolean {
  return flow != null && flow.length > 0
}

export function cloneFlowItems(flow: SongFlowItem[]): SongFlowItem[] {
  return flow.map((item) => ({ ...item }))
}

export function applyFlowToSongData(
  engine: ChordEngine,
  data: ChordSongData,
  flow: SongFlowItem[] | null | undefined,
): ChordSongData {
  if (!hasCustomSongFlow(flow)) return data
  try {
    const cloned = structuredClone(data) as ChordSongData
    return engine.applyFlow(cloned, cloneFlowItems(flow!))
  } catch {
    return data
  }
}

export async function applyFlowToSongDataAsync(
  data: ChordSongData,
  flow: SongFlowItem[] | null | undefined,
): Promise<ChordSongData> {
  if (!hasCustomSongFlow(flow)) return data
  const engine = await getChordEngine()
  return applyFlowToSongData(engine, data, flow)
}

export function useResolvedSongWithFlow(
  song: Song,
  flow: SongFlowItem[] | null | undefined,
): Song {
  const [resolvedSong, setResolvedSong] = useState(song)

  useEffect(() => {
    let cancelled = false
    queueMicrotask(() => {
      if (!cancelled) setResolvedSong(song)
    })

    if (!hasCustomSongFlow(flow)) {
      return () => {
        cancelled = true
      }
    }

    void (async () => {
      try {
        const clonedSong = structuredClone(song) as Song
        const applied = await applyFlowToSongDataAsync(
          clonedSong.data as ChordSongData,
          flow,
        )
        clonedSong.data = applied as Song['data']
        if (!cancelled) {
          setResolvedSong(clonedSong)
        }
      } catch {
        if (!cancelled) {
          setResolvedSong(song)
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [flow, song])

  return resolvedSong
}

export function useResolvedPlayerItemChordData(
  item: PlayerItem | undefined,
): ChordSongData | undefined {
  const rawData =
    item?.type === 'chords' ? (item.song.data as ChordSongData) : undefined
  const flow = item?.type === 'chords' ? item.flow : undefined
  const [resolvedData, setResolvedData] = useState<ChordSongData | undefined>(rawData)

  useEffect(() => {
    let cancelled = false
    queueMicrotask(() => {
      if (!cancelled) setResolvedData(rawData)
    })

    if (!rawData || !hasCustomSongFlow(flow)) {
      return () => {
        cancelled = true
      }
    }

    void applyFlowToSongDataAsync(rawData, flow).then((data) => {
      if (!cancelled) setResolvedData(data)
    })

    return () => {
      cancelled = true
    }
  }, [flow, rawData])

  return resolvedData
}
