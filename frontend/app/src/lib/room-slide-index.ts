import type { components } from '@/api/schema'
import type { SongFlowItem } from '@/ports/chord-engine'

type Section = components['schemas']['Section']
type SectionRef = Pick<SongFlowItem, 'title' | 'occurrence_index'>

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (value != null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
    return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`).join(',')}}`
  }
  return JSON.stringify(value) ?? 'null'
}

function sectionKey(ref: SectionRef): string {
  return JSON.stringify([ref.title, ref.occurrence_index])
}

/** Mirrors chordlib's title/body identity so room slides stay tied to source sections. */
export function roomSourceSectionRefs(sections: readonly Section[]): SectionRef[] {
  const variantsByTitle = new Map<string, string[]>()
  return sections.map((section) => {
    const title = section.title
    const lines = section.lines ?? []
    if (lines.length === 0) return { title, occurrence_index: 0 }

    const variants = variantsByTitle.get(title) ?? []
    variantsByTitle.set(title, variants)
    const body = stableJson(lines)
    let occurrenceIndex = variants.indexOf(body)
    if (occurrenceIndex < 0) {
      occurrenceIndex = variants.length
      variants.push(body)
    }
    return { title, occurrence_index: occurrenceIndex }
  })
}

function flowIsValid(sections: readonly Section[], flow: readonly SongFlowItem[]): boolean {
  const validRefs = new Set(roomSourceSectionRefs(sections).map(sectionKey))
  return flow.every((item) =>
    Number.isSafeInteger(item.occurrence_index) &&
    item.occurrence_index >= 0 &&
    Number.isSafeInteger(item.repeats) &&
    item.repeats >= 1 &&
    validRefs.has(sectionKey(item)),
  )
}

/** Adds omitted source sections to a valid custom flow so every room slide can be selected. */
export function completeRoomFlow(
  sections: readonly Section[],
  flow: readonly SongFlowItem[] | null | undefined,
): SongFlowItem[] | null | undefined {
  if (!flow?.length || !flowIsValid(sections, flow)) return flow ? [...flow] : flow
  const refs = roomSourceSectionRefs(sections)
  const existing = new Set(flow.map(sectionKey))
  const added = new Set<string>()
  const result = [...flow]
  refs.forEach((ref, index) => {
    const key = sectionKey(ref)
    if (existing.has(key) || added.has(key)) return
    added.add(key)
    result.push({
      ...ref,
      repeats: Math.max(1, sections[index]?.repeat_count ?? 1),
    })
  })
  return result
}

export function roomSourceSlideToRenderedSection(
  sections: readonly Section[],
  flow: readonly SongFlowItem[] | null | undefined,
  sourceSlide: number,
): number | null {
  if (!Number.isSafeInteger(sourceSlide) || sourceSlide < 0 || sourceSlide >= sections.length) return null
  if (!flow?.length || !flowIsValid(sections, flow)) return sourceSlide

  const refs = roomSourceSectionRefs(sections)
  const key = sectionKey(refs[sourceSlide]!)
  const matchingSourceSlides = refs.flatMap((ref, index) => sectionKey(ref) === key ? [index] : [])
  const ordinal = matchingSourceSlides.indexOf(sourceSlide)
  const matchingRenderedSections = flow.flatMap((item, index) => sectionKey(item) === key ? [index] : [])
  return matchingRenderedSections[Math.min(ordinal, matchingRenderedSections.length - 1)] ?? null
}

export function roomRenderedSectionToSourceSlide(
  sections: readonly Section[],
  flow: readonly SongFlowItem[] | null | undefined,
  renderedSection: number,
): number | null {
  if (!Number.isSafeInteger(renderedSection) || renderedSection < 0) return null
  if (!flow?.length || !flowIsValid(sections, flow)) {
    return renderedSection < sections.length ? renderedSection : null
  }

  const rendered = flow[renderedSection]
  if (!rendered) return null
  const key = sectionKey(rendered)
  const renderedOrdinal = flow.slice(0, renderedSection + 1).filter((item) => sectionKey(item) === key).length - 1
  const matchingSourceSlides = roomSourceSectionRefs(sections)
    .flatMap((ref, index) => sectionKey(ref) === key ? [index] : [])
  return matchingSourceSlides[Math.min(renderedOrdinal, matchingSourceSlides.length - 1)] ?? null
}
