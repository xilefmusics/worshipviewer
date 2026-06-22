import type { ChordEngine, ChordSongData, SongFlowItem } from '@/ports/chord-engine'

function cloneFlowItems(flow: SongFlowItem[]): SongFlowItem[] {
  return flow.map((item) => ({ ...item }))
}

/** Whether a saved custom flow still applies to the current song data. */
export function isSongFlowValid(
  engine: ChordEngine,
  data: ChordSongData,
  flow: SongFlowItem[] | null | undefined,
): boolean {
  if (flow == null || flow.length === 0) {
    return true
  }

  try {
    const cloned = structuredClone(data) as ChordSongData
    engine.applyFlow(cloned, cloneFlowItems(flow))
    return true
  } catch {
    return false
  }
}

/** Apply a setlist-slot custom flow to song data; falls back to the original on error. */
export function resolveSongDataWithFlow(
  engine: ChordEngine,
  data: ChordSongData,
  flow: SongFlowItem[] | null | undefined,
): ChordSongData {
  if (flow == null || flow.length === 0) {
    return data
  }

  try {
    const cloned = structuredClone(data) as ChordSongData
    return engine.applyFlow(cloned, cloneFlowItems(flow))
  } catch {
    return data
  }
}
