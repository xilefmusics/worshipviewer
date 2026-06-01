import type { TocDisplayMode } from '@/lib/player/toc-display'
import {
  parseTocDisplayMode,
  parseTocLangSearch,
  parseTocTagsSearch,
  serializeTocLangSearch,
  serializeTocTagsSearch,
} from '@/lib/player/player-toc-search'
import { parseOptionalPlayerIndex } from '@/lib/player/player-editor-return'
import { parsePlayerMode } from '@/lib/player/player-mode'
import type { HubEntity } from '@/lib/hub-entity'
import type { PlayerMode } from '@/lib/player/player-mode'

export type PlayerEntityType = 'collection' | 'song' | 'setlist'

export type PlayerRouteSearchState = {
  type: PlayerEntityType
  id: string
  index?: number
  mode?: PlayerMode
  toc?: TocDisplayMode
  tocLang?: readonly string[]
  tocTags?: readonly string[]
}

export type PlayerRouteSearchParams = {
  type: PlayerEntityType
  id: string
  index: number | undefined
  mode: PlayerMode | undefined
  toc: TocDisplayMode | undefined
  tocLang: string | undefined
  tocTags: string | undefined
}

export function hubEntityToPlayerType(entity: HubEntity): PlayerEntityType {
  if (entity === 'collections') return 'collection'
  if (entity === 'songs') return 'song'
  return 'setlist'
}

/** Build `/player` search params for navigation. */
export function buildPlayerSearch(state: PlayerRouteSearchState): PlayerRouteSearchParams {
  return {
    type: state.type,
    id: state.id,
    index: state.index,
    mode: state.mode,
    toc: state.toc && state.toc !== 'order' ? state.toc : undefined,
    tocLang: serializeTocLangSearch(state.tocLang ?? []),
    tocTags: serializeTocTagsSearch(state.tocTags ?? []),
  }
}

export function parsePlayerRouteSearch(search: Record<string, unknown>): {
  type: PlayerEntityType | undefined
  id: string
  index: number | undefined
  mode: PlayerMode | undefined
  toc: TocDisplayMode | undefined
  tocLang: string[]
  tocTags: string[]
} {
  const typeRaw = search.type
  const type =
    typeRaw === 'song' || typeRaw === 'setlist' || typeRaw === 'collection' ? typeRaw : undefined
  const id = typeof search.id === 'string' ? search.id : ''

  return {
    type,
    id,
    index: parseOptionalPlayerIndex(search.index),
    mode: parsePlayerMode(search.mode),
    toc: parseTocDisplayMode(search.toc),
    tocLang: parseTocLangSearch(search.tocLang),
    tocTags: parseTocTagsSearch(search.tocTags),
  }
}

/** @deprecated Prefer {@link buildPlayerSearch} for typed TanStack Router search. */
export function buildPlayerSearchParams(
  type: PlayerEntityType,
  id: string,
): Record<string, string> {
  return { type, id }
}
