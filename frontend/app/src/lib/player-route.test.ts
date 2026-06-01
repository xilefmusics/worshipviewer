import { describe, expect, it } from 'vitest'

import { buildPlayerSearch, buildPlayerSearchParams, type PlayerEntityType } from '@/lib/player-route'
import { tocTagFilterId } from '@/lib/player/toc-filters'
import {
  parseTocDisplayMode,
  parseTocLangSearch,
  parseTocTagsSearch,
  serializeTocLangSearch,
  serializeTocTagsSearch,
} from '@/lib/player/player-toc-search'

describe('buildPlayerSearchParams', () => {
  it('returns type and id for each entity', () => {
    const types: PlayerEntityType[] = ['collection', 'song', 'setlist']
    for (const type of types) {
      expect(buildPlayerSearchParams(type, 'abc-123')).toEqual({ type, id: 'abc-123' })
    }
  })
})

describe('buildPlayerSearch', () => {
  it('includes optional mode and index', () => {
    expect(buildPlayerSearch({ type: 'song', id: 'id-1', index: 2, mode: 'av' })).toEqual({
      type: 'song',
      id: 'id-1',
      index: 2,
      mode: 'av',
      toc: undefined,
      tocLang: undefined,
      tocTags: undefined,
    })
  })

  it('includes index zero for first item', () => {
    expect(buildPlayerSearch({ type: 'setlist', id: 'set-1', index: 0, mode: 'normal' })).toEqual({
      type: 'setlist',
      id: 'set-1',
      index: 0,
      mode: 'normal',
      toc: undefined,
      tocLang: undefined,
      tocTags: undefined,
    })
  })

  it('serializes toc mode and filters', () => {
    expect(
      buildPlayerSearch({
        type: 'setlist',
        id: 'set-1',
        toc: 'alphabetical',
        tocLang: ['de', 'en'],
        tocTags: [tocTagFilterId('Explorer', 'true'), tocTagFilterId('Ocean', 'true')],
      }),
    ).toEqual({
      type: 'setlist',
      id: 'set-1',
      index: undefined,
      mode: undefined,
      toc: 'alphabetical',
      tocLang: serializeTocLangSearch(['de', 'en']),
      tocTags: serializeTocTagsSearch([
        tocTagFilterId('Explorer', 'true'),
        tocTagFilterId('Ocean', 'true'),
      ]),
    })
  })

  it('omits default toc mode and empty filters', () => {
    expect(buildPlayerSearch({ type: 'song', id: 'id-1', toc: 'order', tocLang: [], tocTags: [] })).toEqual({
      type: 'song',
      id: 'id-1',
      index: undefined,
      mode: undefined,
      toc: undefined,
      tocLang: undefined,
      tocTags: undefined,
    })
  })
})

describe('player toc search parsing', () => {
  it('parses toc display mode', () => {
    expect(parseTocDisplayMode('liked')).toBe('liked')
    expect(parseTocDisplayMode('invalid')).toBeUndefined()
  })

  it('round-trips language filters', () => {
    const serialized = serializeTocLangSearch(['English', 'de'])
    expect(parseTocLangSearch(serialized)).toEqual(['English', 'de'])
  })

  it('round-trips tag filters', () => {
    const ids = [tocTagFilterId('Explorer', 'true'), tocTagFilterId('Ocean', 'true')]
    const serialized = serializeTocTagsSearch(ids)
    expect(parseTocTagsSearch(serialized)).toEqual(ids)
  })
})
