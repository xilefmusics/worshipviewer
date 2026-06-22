import type { components } from '@/api/schema'

import { baseSectionTitle } from '@/lib/player/av-lyric-slides'
import type { ChordSongData } from '@/ports/chord-engine'

type Section = components['schemas']['Section']
type Line = components['schemas']['Line']
type Part = components['schemas']['Part']

function partHasLyrics(part: Part): boolean {
  if (part.comment) return false
  const languages = part.languages
  if (!Array.isArray(languages)) return false
  return languages.some((value) => typeof value === 'string' && value.trim().length > 0)
}

/** Whether a section includes any lyric text (chords alone do not count). */
export function sectionHasLyrics(section: Section): boolean {
  for (const line of section.lines) {
    for (const part of line.parts) {
      if (partHasLyrics(part)) return true
    }
  }
  return false
}

function cloneLines(lines: Line[]): Line[] {
  return structuredClone(lines)
}

function mergeLineLyricsFromDonor(line: Line, donorLine: Line | undefined): Line {
  if (!donorLine || sectionLineHasLyrics(line)) return line
  if (line.parts.length === 0) {
    return structuredClone(donorLine)
  }
  return {
    parts: line.parts.map((part, partIndex) => {
      if (partHasLyrics(part) || part.comment) return part
      const donorPart = donorLine.parts[partIndex] ?? donorLine.parts[donorLine.parts.length - 1]
      if (!donorPart || !partHasLyrics(donorPart)) return part
      return {
        ...part,
        languages: Array.isArray(donorPart.languages) ? [...donorPart.languages] : part.languages,
      }
    }),
  }
}

function sectionLineHasLyrics(line: Line): boolean {
  return line.parts.some((part) => partHasLyrics(part))
}

function expandSectionFromDonor(section: Section, donor: Section): Section {
  if (section.lines.length === 0) {
    return { ...section, lines: cloneLines(donor.lines) }
  }
  return {
    ...section,
    lines: section.lines.map((line, lineIndex) =>
      mergeLineLyricsFromDonor(line, donor.lines[lineIndex] ?? donor.lines[donor.lines.length - 1]),
    ),
  }
}

/**
 * Fill lyric-less repeat sections from the first earlier section with the same title
 * (matches legacy presenter / AV duplicate-section behavior).
 */
export function expandSongSections(sections: Section[]): Section[] {
  const donors = new Map<string, Section>()

  return sections.map((section) => {
    const key = baseSectionTitle(section.title)
    if (sectionHasLyrics(section)) {
      if (!donors.has(key)) donors.set(key, section)
      return section
    }

    const donor = donors.get(key)
    if (!donor || !sectionHasLyrics(donor)) return section
    return expandSectionFromDonor(section, donor)
  })
}

export function expandSongSectionsForPlayer(songData: ChordSongData): ChordSongData {
  const sections = songData.sections
  if (!Array.isArray(sections) || sections.length === 0) return songData
  return {
    ...songData,
    sections: expandSongSections(sections as Section[]),
  }
}
