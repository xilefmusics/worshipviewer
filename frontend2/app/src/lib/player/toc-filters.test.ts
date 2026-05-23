import { describe, expect, it } from 'vitest'

import {
  applyTocMetadataFilters,
  buildTocMetadataBySongId,
  collectTocLanguageFilterOptions,
  collectTocTagFilterOptions,
  extractTocSongMetadata,
  tocTagFilterId,
} from '@/lib/player/toc-filters'

const toc = [
  { idx: 0, nr: '1', title: 'Song A', id: 'a', liked: false },
  { idx: 1, nr: '2', title: 'Song B', id: 'b', liked: false },
  { idx: 2, nr: '3', title: 'Song C', id: 'c', liked: false },
]

const items = [
  {
    type: 'chords' as const,
    song: {
      id: 'a',
      data: { sections: [], languages: ['en'], tags: { theme: 'Grace' } },
    },
  },
  {
    type: 'chords' as const,
    song: {
      id: 'b',
      data: { sections: [], languages: ['de'], tags: { theme: 'Worship' } },
    },
  },
  {
    type: 'chords' as const,
    song: {
      id: 'c',
      data: { sections: [], languages: ['en', 'de'], tags: { theme: 'Grace' } },
    },
  },
]

describe('extractTocSongMetadata', () => {
  it('reads BCP47 languages and skips language meta tags from tag filters', () => {
    expect(
      extractTocSongMetadata({
        sections: [],
        languages: ['en'],
        tags: { language2: 'de-CH', theme: 'Grace' },
      }),
    ).toEqual({
      languages: ['en', 'de-CH'],
      tags: { theme: 'Grace' },
    })
  })
})

describe('buildTocMetadataBySongId', () => {
  it('extracts languages and tags from chord items', () => {
    const meta = buildTocMetadataBySongId(items)
    expect(meta.get('a')).toEqual({ languages: ['en'], tags: { theme: 'Grace' } })
    expect(meta.get('b')).toEqual({ languages: ['de'], tags: { theme: 'Worship' } })
  })
})

describe('collectTocLanguageFilterOptions', () => {
  it('returns language filters when multiple languages exist in the player', () => {
    const metadata = buildTocMetadataBySongId(items)
    expect(collectTocLanguageFilterOptions(metadata).map((row) => row.id)).toEqual(['de', 'en'])
    expect(collectTocLanguageFilterOptions(buildTocMetadataBySongId([items[0]!]))).toEqual([])
  })
})

describe('collectTocTagFilterOptions', () => {
  it('returns tag filters when multiple distinct tag pairs exist', () => {
    const metadata = buildTocMetadataBySongId(items)
    expect(collectTocTagFilterOptions(metadata)).toEqual([
      {
        id: tocTagFilterId('theme', 'Grace'),
        key: 'theme',
        value: 'Grace',
        label: 'theme: Grace',
      },
      {
        id: tocTagFilterId('theme', 'Worship'),
        key: 'theme',
        value: 'Worship',
        label: 'theme: Worship',
      },
    ])
  })

  it('returns filters for different tag keys across songs', () => {
    const metadata = buildTocMetadataBySongId([
      {
        type: 'chords',
        song: { id: 'a', data: { sections: [], tags: { theme: 'Grace' } } },
      },
      {
        type: 'chords',
        song: { id: 'b', data: { sections: [], tags: { category: 'Hymn' } } },
      },
    ])
    expect(collectTocTagFilterOptions(metadata).map((row) => row.label)).toEqual([
      'category: Hymn',
      'theme: Grace',
    ])
  })
})

describe('applyTocMetadataFilters', () => {
  it('filters by active language and tag selections', () => {
    const metadata = buildTocMetadataBySongId(items)
    expect(
      applyTocMetadataFilters(toc, items, metadata, new Set(['de']), new Set()).map((row) => row.id),
    ).toEqual(['b', 'c'])
    expect(
      applyTocMetadataFilters(
        toc,
        items,
        metadata,
        new Set(),
        new Set([tocTagFilterId('theme', 'Worship')]),
      ).map((row) => row.id),
    ).toEqual(['b'])
  })
})
