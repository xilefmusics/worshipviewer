import type { components } from '@/api/schema'

import { expandSongSectionsForPlayer } from '@/lib/player/expand-song-sections'
import { normalizeSongFlow, type FlowSlot, type SongFlow } from '@/lib/setlist-song-links'
import type { ChordSongData } from '@/ports/chord-engine'

type Song = components['schemas']['Song']
type SongData = components['schemas']['SongDataSchema']
type Section = components['schemas']['Section']
type Line = components['schemas']['Line']
type Part = components['schemas']['Part']

export type FlowSourceSection = FlowSlot & {
  label: string
  section: Section
}

function normalizeSectionTitle(title: unknown): string {
  return typeof title === 'string' ? title.trim() : ''
}

function partHasContent(part: Part): boolean {
  if (part.comment) return false
  if (Array.isArray(part.languages) && part.languages.some((value) => typeof value === 'string' && value.trim().length > 0)) {
    return true
  }
  return part.chord != null
}

function lineHasContent(line: Line): boolean {
  return line.parts.some((part) => partHasContent(part))
}

function sectionHasContent(section: Section): boolean {
  return section.lines.some((line) => lineHasContent(line))
}

function labelForOccurrence(title: string, occurrenceIndex: number): string {
  return occurrenceIndex === 0 ? title : `${title} (${occurrenceIndex + 1})`
}

export function buildFlowSourcePool(songData: SongData | undefined | null): FlowSourceSection[] {
  const sections = Array.isArray(songData?.sections) ? (songData.sections as Section[]) : []
  const counts = new Map<string, number>()
  const pool: FlowSourceSection[] = []

  for (const section of sections) {
    const title = normalizeSectionTitle(section.title)
    if (!title || !sectionHasContent(section)) continue
    const occurrenceIndex = counts.get(title) ?? 0
    counts.set(title, occurrenceIndex + 1)
    pool.push({
      section_title: title,
      occurrence_index: occurrenceIndex,
      repeat_count: 1,
      label: labelForOccurrence(title, occurrenceIndex),
      section,
    })
  }

  return pool
}

function resolveSectionsByTitle(songData: SongData | undefined | null): Map<string, Section[]> {
  const pool = buildFlowSourcePool(songData)
  const byTitle = new Map<string, Section[]>()
  for (const entry of pool) {
    const list = byTitle.get(entry.section_title) ?? []
    list.push(entry.section)
    byTitle.set(entry.section_title, list)
  }
  return byTitle
}

export function resolveSongDataForCustomFlow(
  songData: SongData,
  flow: SongFlow | undefined | null,
): SongData {
  const slots = normalizeSongFlow(flow)
  if (!slots || slots.length === 0) return songData

  const sectionsByTitle = resolveSectionsByTitle(songData)
  if (sectionsByTitle.size === 0) return songData

  const resolvedSections: Section[] = []
  for (const slot of slots) {
    const title = normalizeSectionTitle(slot.section_title)
    if (!title) return songData
    const candidates = sectionsByTitle.get(title)
    if (!candidates) return songData
    const source = candidates[slot.occurrence_index]
    if (!source) return songData
    const cloned = structuredClone(source)
    cloned.repeat_count = slot.repeat_count
    resolvedSections.push(cloned)
  }

  return {
    ...songData,
    sections: resolvedSections,
  }
}

export function resolveSongForBookRendering(
  song: Song,
  flow: SongFlow | undefined | null,
  expandSections: boolean,
): Song {
  const data = resolveSongDataForCustomFlow(song.data as SongData, flow)
  const renderedData = (
    expandSections ? expandSongSectionsForPlayer(data as ChordSongData) : data
  ) as Song['data']
  if (renderedData === song.data) return song
  return {
    ...song,
    data: renderedData,
  }
}
