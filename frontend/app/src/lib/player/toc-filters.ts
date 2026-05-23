import type { components } from '@/api/schema'

type PlayerItem = components['schemas']['PlayerItem']
type TocItem = components['schemas']['TocItem']

export type TocSongMetadata = {
  languages: string[]
  tags: Record<string, string>
}

export type TocLanguageFilterOption = {
  id: string
  label: string
}

export type TocTagFilterOption = {
  id: string
  key: string
  value: string
  label: string
}

const TAG_FILTER_SEP = '\u0000'

export function tocTagFilterId(key: string, value: string): string {
  return `${key}${TAG_FILTER_SEP}${value}`
}

function songIdsMatch(a: string, b: string): boolean {
  if (a === b) return true
  return a.endsWith(`:${b}`) || b.endsWith(`:${a}`)
}

function extractLanguages(data: Record<string, unknown>): string[] {
  const languages = new Set<string>()
  if (Array.isArray(data.languages)) {
    for (const lang of data.languages) {
      if (typeof lang === 'string' && lang.trim()) languages.add(lang.trim())
    }
  }
  if (data.tags && typeof data.tags === 'object' && !Array.isArray(data.tags)) {
    for (const [key, value] of Object.entries(data.tags as Record<string, unknown>)) {
      if (!/^language\d*$/i.test(key)) continue
      if (typeof value === 'string' && value.trim()) languages.add(value.trim())
    }
  }
  return [...languages]
}

function extractTags(data: Record<string, unknown>): Record<string, string> {
  const tags: Record<string, string> = {}
  if (!data.tags || typeof data.tags !== 'object' || Array.isArray(data.tags)) return tags
  for (const [key, value] of Object.entries(data.tags as Record<string, unknown>)) {
    if (/^language\d*$/i.test(key)) continue
    if (typeof value === 'string') {
      const trimmed = value.trim()
      if (trimmed) tags[key] = trimmed
    } else if (value != null && typeof value !== 'object') {
      tags[key] = String(value)
    }
  }
  return tags
}

export function extractTocSongMetadata(data: Record<string, unknown>): TocSongMetadata {
  return {
    languages: extractLanguages(data),
    tags: extractTags(data),
  }
}

export function buildTocMetadataBySongId(items: PlayerItem[]): Map<string, TocSongMetadata> {
  const map = new Map<string, TocSongMetadata>()
  for (const item of items) {
    if (item.type !== 'chords') continue
    map.set(item.song.id, extractTocSongMetadata(item.song.data as Record<string, unknown>))
  }
  return map
}

export function resolveTocRowMetadata(
  row: TocItem,
  items: PlayerItem[],
  metadataBySongId: Map<string, TocSongMetadata>,
): TocSongMetadata | undefined {
  if (row.id) {
    const direct = metadataBySongId.get(row.id)
    if (direct) return direct
    for (const [songId, meta] of metadataBySongId) {
      if (songIdsMatch(songId, row.id)) return meta
    }
  }

  const atIdx = items[row.idx]
  if (atIdx?.type === 'chords') {
    return metadataBySongId.get(atIdx.song.id)
  }

  for (const item of items) {
    if (item.type !== 'chords') continue
    if (row.id && songIdsMatch(item.song.id, row.id)) {
      return metadataBySongId.get(item.song.id)
    }
  }

  for (let i = row.idx; i < items.length; i++) {
    const item = items[i]
    if (item?.type !== 'chords') continue
    return metadataBySongId.get(item.song.id)
  }

  return undefined
}

export function collectTocLanguageFilterOptions(
  metadataBySongId: Map<string, TocSongMetadata>,
): TocLanguageFilterOption[] {
  const languages = new Set<string>()
  for (const meta of metadataBySongId.values()) {
    for (const lang of meta.languages) languages.add(lang)
  }
  if (languages.size <= 1) return []
  return [...languages]
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
    .map((id) => ({ id, label: id }))
}

export function collectTocTagFilterOptions(
  metadataBySongId: Map<string, TocSongMetadata>,
): TocTagFilterOption[] {
  const pairs = new Map<string, TocTagFilterOption>()
  for (const meta of metadataBySongId.values()) {
    for (const [key, value] of Object.entries(meta.tags)) {
      const id = tocTagFilterId(key, value)
      pairs.set(id, { id, key, value, label: `${key}: ${value}` })
    }
  }
  if (pairs.size <= 1) return []
  return [...pairs.values()].sort((a, b) =>
    a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }),
  )
}

export function applyTocMetadataFilters(
  toc: TocItem[],
  items: PlayerItem[],
  metadataBySongId: Map<string, TocSongMetadata>,
  activeLanguageIds: ReadonlySet<string>,
  activeTagIds: ReadonlySet<string>,
): TocItem[] {
  if (activeLanguageIds.size === 0 && activeTagIds.size === 0) return toc

  return toc.filter((row) => {
    const meta = resolveTocRowMetadata(row, items, metadataBySongId)
    if (!meta) return false

    if (activeLanguageIds.size > 0) {
      const matchesLanguage = meta.languages.some((lang) => activeLanguageIds.has(lang))
      if (!matchesLanguage) return false
    }

    if (activeTagIds.size > 0) {
      const matchesTag = [...activeTagIds].some((tagId) => {
        const sep = tagId.indexOf(TAG_FILTER_SEP)
        if (sep < 0) return false
        const key = tagId.slice(0, sep)
        const value = tagId.slice(sep + 1)
        return meta.tags[key] === value
      })
      if (!matchesTag) return false
    }

    return true
  })
}
