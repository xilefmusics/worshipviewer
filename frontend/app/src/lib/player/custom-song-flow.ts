import type { components } from '@/api/schema'

import { baseSectionTitle } from '@/lib/player/av-lyric-slides'
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
  return occurrenceIndex === 0 ? title : `${title} [${occurrenceIndex + 1}]`
}

export function buildFlowSourcePool(songData: SongData | undefined | null): FlowSourceSection[] {
  const sections = Array.isArray(songData?.sections) ? (songData.sections as Section[]) : []
  const counts = new Map<string, number>()
  const pool: FlowSourceSection[] = []

  for (const section of sections) {
    const title = normalizeSectionTitle(section.title)
    if (!title) continue
    if (!sectionHasContent(section)) continue
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

export function buildDefaultFlowSlots(songData: SongData | undefined | null): FlowSlot[] {
  const sections = Array.isArray(songData?.sections) ? (songData.sections as Section[]) : []
  const counts = new Map<string, number>()
  const flow: FlowSlot[] = []

  for (const section of sections) {
    const title = normalizeSectionTitle(section.title)
    if (!title) continue
    const occurrenceIndex = counts.get(title) ?? 0
    counts.set(title, occurrenceIndex + 1)
    flow.push({
      section_title: title,
      occurrence_index: occurrenceIndex,
      repeat_count: section.repeat_count && section.repeat_count > 0 ? section.repeat_count : 1,
    })
  }

  return flow
}

function resolveSectionsByTitle(songData: SongData | undefined | null): Map<string, Section[]> {
  const sections = Array.isArray(songData?.sections) ? (songData.sections as Section[]) : []
  const byTitle = new Map<string, Section[]>()
  for (const section of sections) {
    const title = normalizeSectionTitle(section.title)
    if (!title) continue
    const list = byTitle.get(title) ?? []
    list.push(section)
    byTitle.set(title, list)
  }
  return byTitle
}

function resolveSectionByExactOccurrence(
  title: string,
  occurrenceIndex: number,
  sectionsByTitle: Map<string, Section[]>,
): Section | null {
  const candidates = sectionsByTitle.get(title)
  if (!candidates) return null
  return candidates[occurrenceIndex] ?? null
}

function slotTitle(slot: FlowSlot): string {
  return normalizeSectionTitle(slot.section_title)
}

function slotRepeatCount(slot: FlowSlot): number {
  return slot.repeat_count < 1 ? 1 : slot.repeat_count
}

function slotOccurrenceIndex(slot: FlowSlot): number {
  return slot.occurrence_index
}

function blankRepeatedSongSections(songData: SongData): SongData {
  const sections = Array.isArray(songData.sections) ? (songData.sections as Section[]) : []
  if (sections.length === 0) return songData

  const seen = new Set<string>()
  const collapsedSections = sections.map((section) => {
    const title = normalizeSectionTitle(section.title)
    const key = baseSectionTitle(title)
    if (!key) return section
    if (seen.has(key)) {
      const cloned = structuredClone(section)
      cloned.lines = []
      return cloned
    }
    seen.add(key)
    return section
  })

  return {
    ...songData,
    sections: collapsedSections,
  }
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
    const title = slotTitle(slot)
    if (!title) return songData
    const source = resolveSectionByExactOccurrence(title, slotOccurrenceIndex(slot), sectionsByTitle)
    if (!source) return songData
    const cloned = structuredClone(source)
    cloned.repeat_count = slotRepeatCount(slot)
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
    expandSections
      ? expandSongSectionsForPlayer(data as ChordSongData)
      : flow
        ? blankRepeatedSongSections(data)
        : data
  ) as Song['data']
  if (renderedData === song.data) return song
  return {
    ...song,
    data: renderedData,
  }
}
