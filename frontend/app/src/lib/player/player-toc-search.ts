import type { TocDisplayMode } from '@/lib/player/toc-display'
import { tocTagFilterId } from '@/lib/player/toc-filters'

const TOC_MODES: readonly TocDisplayMode[] = ['order', 'alphabetical', 'liked']
const TAG_URL_SEP = '~'

export function parseTocDisplayMode(raw: unknown): TocDisplayMode | undefined {
  if (typeof raw !== 'string') return undefined
  return TOC_MODES.includes(raw as TocDisplayMode) ? (raw as TocDisplayMode) : undefined
}

export function resolveTocDisplayMode(raw: unknown): TocDisplayMode {
  return parseTocDisplayMode(raw) ?? 'order'
}

export function parseTocLangSearch(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw
      .flatMap((part) => (typeof part === 'string' ? parseTocLangSearch(part) : []))
      .filter(Boolean)
  }
  if (typeof raw !== 'string' || !raw.trim()) return []
  return raw
    .split(',')
    .map((part) => decodeURIComponent(part.trim()))
    .filter(Boolean)
}

export function serializeTocLangSearch(ids: readonly string[]): string | undefined {
  if (ids.length === 0) return undefined
  return ids.map((id) => encodeURIComponent(id)).join(',')
}

function parseTocTagSearchPart(part: string): string | undefined {
  const trimmed = part.trim()
  if (!trimmed) return undefined

  const urlSep = trimmed.indexOf(TAG_URL_SEP)
  if (urlSep >= 0) {
    const key = decodeURIComponent(trimmed.slice(0, urlSep))
    const value = decodeURIComponent(trimmed.slice(urlSep + 1))
    return key && value ? tocTagFilterId(key, value) : undefined
  }

  const internalSep = trimmed.indexOf('\u0000')
  if (internalSep >= 0) {
    const key = trimmed.slice(0, internalSep)
    const value = trimmed.slice(internalSep + 1)
    return key && value ? tocTagFilterId(key, value) : undefined
  }

  return undefined
}

export function parseTocTagsSearch(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.flatMap((part) => (typeof part === 'string' ? parseTocTagsSearch(part) : []))
  }
  if (typeof raw !== 'string' || !raw.trim()) return []
  const ids: string[] = []
  for (const part of raw.split(',')) {
    const id = parseTocTagSearchPart(part)
    if (id) ids.push(id)
  }
  return ids
}

export function serializeTocTagsSearch(ids: readonly string[]): string | undefined {
  if (ids.length === 0) return undefined
  return ids
    .map((id) => {
      const sep = id.indexOf('\u0000')
      if (sep < 0) return encodeURIComponent(id)
      const key = id.slice(0, sep)
      const value = id.slice(sep + 1)
      return `${encodeURIComponent(key)}${TAG_URL_SEP}${encodeURIComponent(value)}`
    })
    .join(',')
}
