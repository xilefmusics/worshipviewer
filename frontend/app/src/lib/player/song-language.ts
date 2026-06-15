import type { ChordSongData } from '@/ports/chord-engine'

export type SongLanguageOption = {
  index: number
  label: string
}

function lyricTrackCount(songData: ChordSongData): number {
  const sections = songData.sections
  if (!Array.isArray(sections)) return 0

  let count = 0
  for (const section of sections) {
    if (!section || typeof section !== 'object') continue
    const lines = (section as { lines?: unknown }).lines
    if (!Array.isArray(lines)) continue
    for (const line of lines) {
      if (!line || typeof line !== 'object') continue
      const parts = (line as { parts?: unknown }).parts
      if (!Array.isArray(parts)) continue
      for (const part of parts) {
        if (!part || typeof part !== 'object') continue
        const languages = (part as { languages?: unknown }).languages
        if (Array.isArray(languages)) count = Math.max(count, languages.length)
      }
    }
  }

  return count
}

function metadataLanguages(songData: ChordSongData): string[] {
  const languages = songData.languages
  if (!Array.isArray(languages)) return []
  return languages.map((value) => (typeof value === 'string' ? value.trim() : ''))
}

export function fallbackSongLanguageLabel(index: number): string {
  return `L${index + 1}`
}

export function songLanguageOptions(songData: ChordSongData): SongLanguageOption[] {
  const metadata = metadataLanguages(songData)
  const count = Math.max(metadata.length, lyricTrackCount(songData))
  return Array.from({ length: count }, (_, index) => ({
    index,
    label: metadata[index] || fallbackSongLanguageLabel(index),
  }))
}

export function resolveSongLanguageIndex(
  options: SongLanguageOption[],
  savedIndex: number | null | undefined,
): number {
  if (
    typeof savedIndex === 'number' &&
    Number.isInteger(savedIndex) &&
    savedIndex >= 0 &&
    savedIndex < options.length
  ) {
    return savedIndex
  }
  return 0
}
