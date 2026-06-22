import type { components } from '@/api/schema'
import { useEffect, useMemo, useState } from 'react'

import { getChordEngine } from '@/lib/chord-engine'
import { resolveSongDataWithFlow } from '@/lib/player/resolve-song-flow'
import type { ChordSongData } from '@/ports/chord-engine'

type PlayerItem = components['schemas']['PlayerItem']
type Section = components['schemas']['Section']

export type AvResolvedSections = ReadonlyMap<number, readonly Section[]>

function rawSectionsForItem(item: PlayerItem): Section[] {
  if (item.type !== 'chords') return []
  const sections = item.song.data.sections
  return Array.isArray(sections) ? sections : []
}

function buildInitialSectionsMap(items: PlayerItem[]): AvResolvedSections {
  const map = new Map<number, readonly Section[]>()
  items.forEach((item, index) => {
    if (item.type === 'chords') {
      map.set(index, rawSectionsForItem(item))
    }
  })
  return map
}

function flowResolutionKey(items: PlayerItem[]): string {
  return items
    .map((item, index) => {
      if (item.type !== 'chords') return `${index}:blob`
      const flow = item.flow == null ? '' : JSON.stringify(item.flow)
      return `${index}:${item.song.id}:${flow}`
    })
    .join('|')
}

/** Resolve custom setlist flows for AV lyric slide generation. */
export function useResolvedAvItemSections(items: PlayerItem[]): AvResolvedSections {
  const resolutionKey = useMemo(() => flowResolutionKey(items), [items])
  const [resolvedSections, setResolvedSections] = useState<AvResolvedSections>(() =>
    buildInitialSectionsMap(items),
  )

  useEffect(() => {
    let cancelled = false
    const initial = buildInitialSectionsMap(items)
    queueMicrotask(() => {
      if (!cancelled) setResolvedSections(initial)
    })

    const chordItems = items
      .map((item, index) => ({ item, index }))
      .filter((entry): entry is { item: Extract<PlayerItem, { type: 'chords' }>; index: number } =>
        entry.item.type === 'chords',
      )

    if (chordItems.every(({ item }) => item.flow == null || item.flow.length === 0)) {
      return () => {
        cancelled = true
      }
    }

    void (async () => {
      try {
        const engine = await getChordEngine()
        const next = new Map<number, readonly Section[]>()
        for (const { item, index } of chordItems) {
          const rawData = item.song.data as ChordSongData
          const resolved = resolveSongDataWithFlow(engine, rawData, item.flow)
          const sections = resolved.sections
          next.set(index, Array.isArray(sections) ? sections : rawSectionsForItem(item))
        }
        if (!cancelled) {
          setResolvedSections(next)
        }
      } catch {
        if (!cancelled) {
          setResolvedSections(initial)
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [resolutionKey, items])

  return resolvedSections
}
