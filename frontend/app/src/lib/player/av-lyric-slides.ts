import type { components } from '@/api/schema'
import { normalizeLyricWhitespace } from '@/lib/lyric-whitespace-preference'

type Section = components['schemas']['Section']
type Line = components['schemas']['Line']
type Part = components['schemas']['Part']

export type AvSectionOutline = {
  title: string
  textIdx: number
  outlineIdx: number
  len: number
  duplicate: boolean
  hasText: boolean
}

export type AvLyricSlidesResult = {
  slides: string[]
  outline: AvSectionOutline[]
}

export type AvLyricLine = {
  primary: string
  secondary?: string
}

export type AvBilingualLyricSlidesResult = AvLyricSlidesResult & {
  structuredSlides?: AvLyricLine[][]
}

function maxLanguageCount(sections: Section[]): number {
  let max = 0
  for (const section of sections) {
    for (const line of section.lines) {
      for (const part of line.parts) {
        if (part.comment) continue
        if (Array.isArray(part.languages)) {
          max = Math.max(max, part.languages.length)
        }
      }
    }
  }
  return max
}

export function songHasUsableLyricsAtIndex(
  sections: Section[] | undefined | null,
  languageIndex: number,
  collapseLyricWhitespace = true,
): boolean {
  if (!sections?.length) return false
  if (languageIndex < 0 || languageIndex >= maxLanguageCount(sections)) return false
  for (const section of sections) {
    for (const line of section.lines) {
      const text = lyricFromLine(line, languageIndex, collapseLyricWhitespace)
      if (text.trim()) return true
    }
  }
  return false
}

export function resolveAvEffectivePrimaryLanguageIndex(
  sections: Section[] | undefined | null,
  requestedIndex: number,
  collapseLyricWhitespace = true,
): number {
  if (songHasUsableLyricsAtIndex(sections, requestedIndex, collapseLyricWhitespace)) {
    return requestedIndex
  }
  return 0
}

export function resolveAvSecondaryLanguageIndex(
  sections: Section[] | undefined | null,
  primaryIndex: number,
  collapseLyricWhitespace = true,
): number | null {
  if (!sections?.length) return null
  const languageCount = maxLanguageCount(sections)
  for (let index = 0; index < languageCount; index += 1) {
    if (index === primaryIndex) continue
    if (songHasUsableLyricsAtIndex(sections, index, collapseLyricWhitespace)) {
      return index
    }
  }
  return null
}

export function avLyricLinesToSlideText(lines: AvLyricLine[]): string {
  return lines.map((line) => line.primary).join('\n')
}

function lyricFromPart(part: Part, languageIndex: number): string {
  if (part.comment) return ''
  const languages = part.languages
  if (!Array.isArray(languages) || languages.length === 0) return ''
  const idx = Math.min(languageIndex, languages.length - 1)
  const value = languages[idx]
  return typeof value === 'string' ? value : ''
}

function lyricFromLine(
  line: Line,
  languageIndex: number,
  collapseLyricWhitespace: boolean,
): string {
  const text = line.parts.map((part) => lyricFromPart(part, languageIndex)).join('')
  return collapseLyricWhitespace ? normalizeLyricWhitespace(text) : text
}

/** Split a section's line count into per-slide sizes. */
export function distributeSlideLineCounts(
  lineCount: number,
  maxPerSlide: number,
  balanceSlideLines: boolean,
): number[] {
  if (lineCount <= 0) return []
  if (lineCount <= maxPerSlide) return [lineCount]

  if (!balanceSlideLines) {
    const counts: number[] = []
    let remaining = lineCount
    while (remaining > 0) {
      counts.push(Math.min(maxPerSlide, remaining))
      remaining -= counts[counts.length - 1]!
    }
    return counts
  }

  const slideCount = Math.ceil(lineCount / maxPerSlide)
  const remainder = lineCount % maxPerSlide

  if (remainder === 0) {
    return Array.from({ length: slideCount }, () => maxPerSlide)
  }
  if (remainder === 1 && slideCount > 1) {
    const balancedSlideCount = slideCount - 1
    return [
      ...Array.from({ length: balancedSlideCount - 1 }, () => maxPerSlide),
      maxPerSlide + 1,
    ]
  }
  return [...Array.from({ length: slideCount - 1 }, () => maxPerSlide), remainder]
}

function chunkStructuredLines(
  lines: AvLyricLine[],
  maxLinesPerSlide: number,
  balanceSlideLines: boolean,
): AvLyricLine[][] {
  const counts = distributeSlideLineCounts(lines.length, maxLinesPerSlide, balanceSlideLines)
  const slides: AvLyricLine[][] = []
  let offset = 0
  for (const count of counts) {
    slides.push(lines.slice(offset, offset + count))
    offset += count
  }
  return slides
}

function buildBilingualSlidesFromSections(
  sections: Section[],
  maxLinesPerSlide: number,
  primaryLanguageIndex: number,
  secondaryLanguageIndex: number,
  balanceSlideLines: boolean,
  collapseLyricWhitespace: boolean,
): {
  slides: string[]
  structuredSlides: AvLyricLine[][]
  sectionMap: Map<string, { textIdx: number; len: number }>
} {
  const slides: string[] = []
  const structuredSlides: AvLyricLine[][] = []
  const sectionMap = new Map<string, { textIdx: number; len: number }>()
  let slideIdxCounter = 0

  for (const section of sections) {
    const currentIdx = slideIdxCounter
    const sectionLines: AvLyricLine[] = []

    for (const line of section.lines) {
      const primaryText = lyricFromLine(line, primaryLanguageIndex, collapseLyricWhitespace)
      if (!primaryText.trim()) continue
      const secondaryText = lyricFromLine(line, secondaryLanguageIndex, collapseLyricWhitespace)
      const lyricLine: AvLyricLine = secondaryText.trim()
        ? { primary: primaryText, secondary: secondaryText }
        : { primary: primaryText }
      sectionLines.push(lyricLine)
    }

    const sectionStructuredSlides = chunkStructuredLines(
      sectionLines,
      maxLinesPerSlide,
      balanceSlideLines,
    )
    for (const structuredSlide of sectionStructuredSlides) {
      structuredSlides.push(structuredSlide)
      slides.push(avLyricLinesToSlideText(structuredSlide))
      slideIdxCounter += 1
    }

    if (sectionStructuredSlides.length > 0 && !sectionMap.has(section.title)) {
      sectionMap.set(section.title, { textIdx: currentIdx, len: sectionStructuredSlides.length })
    }
  }

  return { slides, structuredSlides, sectionMap }
}

function chunkLines(
  lines: string[],
  maxLinesPerSlide: number,
  balanceSlideLines: boolean,
): string[] {
  const counts = distributeSlideLineCounts(lines.length, maxLinesPerSlide, balanceSlideLines)
  const slides: string[] = []
  let offset = 0
  for (const count of counts) {
    slides.push(lines.slice(offset, offset + count).join('\n'))
    offset += count
  }
  return slides
}

function buildSlidesFromSections(
  sections: Section[],
  maxLinesPerSlide: number,
  languageIndex: number,
  balanceSlideLines: boolean,
  collapseLyricWhitespace: boolean,
): { slides: string[]; sectionMap: Map<string, { textIdx: number; len: number }> } {
  const slides: string[] = []
  const sectionMap = new Map<string, { textIdx: number; len: number }>()
  let slideIdxCounter = 0

  for (const section of sections) {
    const currentIdx = slideIdxCounter
    const sectionLines: string[] = []

    for (const line of section.lines) {
      const lineText = lyricFromLine(line, languageIndex, collapseLyricWhitespace)
      if (lineText.trim()) sectionLines.push(lineText)
    }

    const sectionSlides = chunkLines(sectionLines, maxLinesPerSlide, balanceSlideLines)
    for (const slide of sectionSlides) {
      slides.push(slide)
      slideIdxCounter += 1
    }

    if (sectionSlides.length > 0 && !sectionMap.has(section.title)) {
      sectionMap.set(section.title, { textIdx: currentIdx, len: sectionSlides.length })
    }
  }

  return { slides, sectionMap }
}

function buildOutline(
  sections: Section[],
  sectionMap: Map<string, { textIdx: number; len: number }>,
): AvSectionOutline[] {
  const outline: AvSectionOutline[] = []
  const seen = new Set<string>()
  let outlineIdx = 0

  for (const section of sections) {
    const entry = sectionMap.get(section.title)
    const len = entry?.len ?? 0
    const textIdx = entry?.textIdx ?? Number.MAX_SAFE_INTEGER

    outline.push({
      title: section.title,
      textIdx,
      outlineIdx,
      len: len || 1,
      duplicate: seen.has(section.title),
      hasText: textIdx !== Number.MAX_SAFE_INTEGER,
    })
    seen.add(section.title)
    outlineIdx += len || 1
  }

  return outline
}

export function buildAvLyricSlides(
  sections: Section[] | undefined | null,
  maxLinesPerSlide: number,
  languageIndex = 0,
  balanceSlideLines = true,
  collapseLyricWhitespace = true,
): AvLyricSlidesResult {
  if (!sections?.length) {
    return { slides: [], outline: [] }
  }
  const { slides, sectionMap } = buildSlidesFromSections(
    sections,
    maxLinesPerSlide,
    languageIndex,
    balanceSlideLines,
    collapseLyricWhitespace,
  )
  return { slides, outline: buildOutline(sections, sectionMap) }
}

export function buildAvBilingualLyricSlides(
  sections: Section[] | undefined | null,
  maxLinesPerSlide: number,
  primaryLanguageIndex: number,
  secondaryLanguageIndex: number | null,
  balanceSlideLines = true,
  collapseLyricWhitespace = true,
): AvBilingualLyricSlidesResult {
  if (!sections?.length) {
    return { slides: [], outline: [] }
  }
  if (secondaryLanguageIndex == null) {
    return buildAvLyricSlides(
      sections,
      maxLinesPerSlide,
      primaryLanguageIndex,
      balanceSlideLines,
      collapseLyricWhitespace,
    )
  }
  const { slides, structuredSlides, sectionMap } = buildBilingualSlidesFromSections(
    sections,
    maxLinesPerSlide,
    primaryLanguageIndex,
    secondaryLanguageIndex,
    balanceSlideLines,
    collapseLyricWhitespace,
  )
  return {
    slides,
    structuredSlides,
    outline: buildOutline(sections, sectionMap),
  }
}

export function findAvSectionOutline(
  outline: AvSectionOutline[],
  title: string,
): AvSectionOutline | undefined {
  return outline.find((row) => row.title === title || row.title.startsWith(`${title} (`))
}

/** Strip trailing " (N)" repeat suffix for section name matching. */
export function baseSectionTitle(title: string): string {
  return title.replace(/ \(\d+\)$/, '')
}

export function findAvTextDonor(
  outline: AvSectionOutline[],
  title: string,
): AvSectionOutline | undefined {
  const base = baseSectionTitle(title)
  return outline.find((row) => row.hasText && baseSectionTitle(row.title) === base)
}

export function resolveAvOutlineSlideText(
  outline: AvSectionOutline[],
  slides: string[],
  row: AvSectionOutline,
  offset = 0,
): string {
  if (row.hasText) {
    return slides[row.textIdx + offset] ?? ''
  }
  const donor = findAvTextDonor(outline, row.title)
  if (!donor) return ''
  const donorOffset = Math.min(offset, donor.len - 1)
  return slides[donor.textIdx + donorOffset] ?? ''
}

export function resolveAvOutlineStructuredSlideText(
  outline: AvSectionOutline[],
  slides: AvLyricLine[][],
  row: AvSectionOutline,
  offset = 0,
): AvLyricLine[] {
  if (row.hasText) {
    return slides[row.textIdx + offset] ?? []
  }
  const donor = findAvTextDonor(outline, row.title)
  if (!donor) return []
  const donorOffset = Math.min(offset, donor.len - 1)
  return slides[donor.textIdx + donorOffset] ?? []
}

/** Full navigable slide list aligned with the outline (includes empty/borrowed slides). */
export function buildAvPresentationSlides(
  outline: AvSectionOutline[],
  slides: string[],
): string[] {
  if (outline.length === 0) {
    return slides
  }
  const presentation: string[] = []
  for (const row of outline) {
    for (let offset = 0; offset < row.len; offset += 1) {
      presentation.push(resolveAvOutlineSlideText(outline, slides, row, offset))
    }
  }
  return presentation
}

/** Full navigable structured slide list aligned with the outline. */
export function buildAvPresentationStructuredSlides(
  outline: AvSectionOutline[],
  slides: AvLyricLine[][],
): AvLyricLine[][] {
  if (outline.length === 0) {
    return slides
  }
  const presentation: AvLyricLine[][] = []
  for (const row of outline) {
    for (let offset = 0; offset < row.len; offset += 1) {
      presentation.push(resolveAvOutlineStructuredSlideText(outline, slides, row, offset))
    }
  }
  return presentation
}

export function avPresentationIndexForSectionTitle(
  outline: AvSectionOutline[],
  title: string,
  offset = 0,
): number | null {
  let index = 0
  for (const row of outline) {
    if (row.title === title || row.title.startsWith(`${title} (`)) {
      return index + offset
    }
    index += row.len
  }
  return null
}

/** Map a presentation slide index to the deck entry index shown in the slides panel. */
export function avSlideDeckEntrySlideIndex(
  outline: AvSectionOutline[],
  presentationSlideIndex: number,
): number | null {
  let index = 0
  for (const row of outline) {
    for (let offset = 0; offset < row.len; offset += 1) {
      if (index !== presentationSlideIndex) {
        index += 1
        continue
      }
      if (row.duplicate) {
        const donor = findAvTextDonor(outline, row.title)
        if (!donor) return null
        const donorOffset = Math.min(offset, donor.len - 1)
        return avPresentationIndexForSectionTitle(outline, donor.title, donorOffset)
      }
      return row.hasText ? index : null
    }
  }
  return null
}

export function blobItemSlideText(title: string, subtitle?: string | null): string {
  if (subtitle?.trim()) return `${title}\n${subtitle.trim()}`
  return title
}

export type AvSlideDeckEntry = {
  slideIndex: number
  label: string
  text: string
  lines?: AvLyricLine[]
  isSubSlide: boolean
  hasText: boolean
}

/** Clickable slide cards for the current item (legacy presenter Slides panel). */
export function buildAvSlideDeckEntries(
  outline: AvSectionOutline[],
  sourceSlides: string[],
  structuredSourceSlides?: AvLyricLine[][],
): AvSlideDeckEntry[] {
  const entries: AvSlideDeckEntry[] = []
  let presentationIndex = 0
  for (const row of outline) {
    if (row.duplicate) {
      presentationIndex += row.len
      continue
    }
    for (let offset = 0; offset < row.len; offset += 1) {
      if (row.hasText) {
        const lines = structuredSourceSlides
          ? resolveAvOutlineStructuredSlideText(outline, structuredSourceSlides, row, offset)
          : undefined
        entries.push({
          slideIndex: presentationIndex,
          label: offset === 0 ? row.title : `${row.title} (${offset + 1})`,
          text: resolveAvOutlineSlideText(outline, sourceSlides, row, offset),
          lines: lines && lines.length > 0 ? lines : undefined,
          isSubSlide: offset > 0,
          hasText: true,
        })
      }
      presentationIndex += 1
    }
  }
  if (entries.length === 0) {
    for (let slideIndex = 0; slideIndex < sourceSlides.length; slideIndex += 1) {
      const lines = structuredSourceSlides?.[slideIndex]
      entries.push({
        slideIndex,
        label: `Slide ${slideIndex + 1}`,
        text: sourceSlides[slideIndex] ?? '',
        lines: lines && lines.length > 0 ? lines : undefined,
        isSubSlide: false,
        hasText: true,
      })
    }
  }
  return entries
}

export type AvOutlineRow = {
  slideIndex: number
  label: string
  isSubSlide: boolean
  hasText: boolean
  selected: boolean
}

/** Flat outline rows for the current item (legacy presenter Outline panel). */
export function buildAvOutlineRows(
  outline: AvSectionOutline[],
  currentSlideIndex: number,
): AvOutlineRow[] {
  const rows: AvOutlineRow[] = []
  let slideIndex = 0
  for (const item of outline) {
    for (let offset = 0; offset < item.len; offset += 1) {
      rows.push({
        slideIndex,
        label: offset === 0 ? item.title : `${item.title} (${offset + 1})`,
        isSubSlide: offset > 0,
        hasText: item.hasText,
        selected: slideIndex === currentSlideIndex,
      })
      slideIndex += 1
    }
  }
  return rows
}
