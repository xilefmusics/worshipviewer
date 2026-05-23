import type { components } from '@/api/schema'

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

function lyricFromPart(part: Part, languageIndex: number): string {
  if (part.comment) return ''
  const languages = part.languages
  if (!Array.isArray(languages) || languages.length === 0) return ''
  const idx = Math.min(languageIndex, languages.length - 1)
  const value = languages[idx]
  return typeof value === 'string' ? value : ''
}

function lyricFromLine(line: Line, languageIndex: number): string {
  return line.parts.map((part) => lyricFromPart(part, languageIndex)).join('')
}

function buildSlidesFromSections(
  sections: Section[],
  maxLinesPerSlide: number,
  languageIndex: number,
): { slides: string[]; sectionMap: Map<string, { textIdx: number; len: number }> } {
  const slides: string[] = []
  const sectionMap = new Map<string, { textIdx: number; len: number }>()
  let slideIdxCounter = 0

  for (const section of sections) {
    const repeatCount = Math.max(1, section.repeat_count ?? 1)
    for (let repeat = 0; repeat < repeatCount; repeat += 1) {
      const currentIdx = slideIdxCounter
      let slideLenCounter = 0
      let slide = ''

      for (const line of section.lines) {
        const lineText = lyricFromLine(line, languageIndex)
        if (!lineText.trim()) continue

        const lineCount = slide ? slide.split('\n').length : 0
        if (lineCount >= maxLinesPerSlide) {
          slides.push(slide)
          slideLenCounter += 1
          slideIdxCounter += 1
          slide = lineText
        } else {
          slide = slide ? `${slide}\n${lineText}` : lineText
        }
      }

      if (slide.trim()) {
        slides.push(slide)
        slideLenCounter += 1
        slideIdxCounter += 1
      }

      const mapKey = repeatCount > 1 ? `${section.title} (${repeat + 1})` : section.title
      if (slideLenCounter > 0 && !sectionMap.has(mapKey)) {
        sectionMap.set(mapKey, { textIdx: currentIdx, len: slideLenCounter })
      }
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
    const repeatCount = Math.max(1, section.repeat_count ?? 1)
    for (let repeat = 0; repeat < repeatCount; repeat += 1) {
      const mapKey = repeatCount > 1 ? `${section.title} (${repeat + 1})` : section.title
      const entry = sectionMap.get(mapKey)
      const len = entry?.len ?? 0
      const textIdx = entry?.textIdx ?? Number.MAX_SAFE_INTEGER

      outline.push({
        title: mapKey,
        textIdx,
        outlineIdx,
        len: len || 1,
        duplicate: seen.has(section.title),
        hasText: textIdx !== Number.MAX_SAFE_INTEGER,
      })
      seen.add(section.title)
      outlineIdx += len || 1
    }
  }

  return outline
}

export function buildAvLyricSlides(
  sections: Section[] | undefined | null,
  maxLinesPerSlide: number,
  languageIndex = 0,
): AvLyricSlidesResult {
  if (!sections?.length) {
    return { slides: [], outline: [] }
  }
  const { slides, sectionMap } = buildSlidesFromSections(
    sections,
    maxLinesPerSlide,
    languageIndex,
  )
  return { slides, outline: buildOutline(sections, sectionMap) }
}

export function findAvSectionOutline(
  outline: AvSectionOutline[],
  title: string,
): AvSectionOutline | undefined {
  return outline.find((row) => row.title === title || row.title.startsWith(`${title} (`))
}

export function blobItemSlideText(title: string, subtitle?: string | null): string {
  if (subtitle?.trim()) return `${title}\n${subtitle.trim()}`
  return title
}
