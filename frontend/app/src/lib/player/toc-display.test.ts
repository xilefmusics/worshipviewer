import { describe, expect, it } from 'vitest'

import type { components } from '@/api/schema'

import { displayTocEntries, tocDisplayNr } from '@/lib/player/toc-display'
import { buildTocMetadataBySongId } from '@/lib/player/toc-filters'

type PlayerItem = components['schemas']['PlayerItem']

function chordPlayerItem(
  id: string,
  data: {
    languages?: string[]
    titles?: string[]
    language?: string | null
  },
): PlayerItem {
  return {
    type: 'chords',
    song: {
      id,
      blobs: [],
      not_a_song: false,
      owner: 'user:test',
      user_specific_addons: { liked: false },
      data: {
        sections: [],
        languages: data.languages,
        titles: data.titles,
      },
    },
    language: data.language ?? null,
  } as PlayerItem
}

const toc = [
  { idx: 0, nr: '1', title: 'Anchor', id: 'song-a', liked: false },
  { idx: 1, nr: '2', title: 'Boat', id: 'song-b', liked: true },
  { idx: 2, nr: '3', title: 'Zzz Blob', liked: false },
  { idx: 3, nr: '4', title: 'Cedar', id: 'song-c', liked: false },
  { idx: 4, nr: '', title: 'Anchor', id: 'song-a', liked: false },
]

const items: PlayerItem[] = [
  chordPlayerItem('song-a', {
    languages: ['en', 'de'],
    titles: ['Anchor', 'Anker'],
    language: 'en',
  }),
  chordPlayerItem('song-b', {
    languages: ['en'],
    titles: ['Boat'],
    language: 'en',
  }),
  { type: 'blob', blob_id: 'blob:1' } as PlayerItem,
  chordPlayerItem('song-c', {
    languages: ['en', 'de', 'fr'],
    titles: ['Cedar', 'Cedro', 'Cypress'],
    language: 'fr',
  }),
  chordPlayerItem('song-a', {
    languages: ['en', 'de'],
    titles: ['Anchor', 'Anker'],
    language: 'de',
  }),
]

const metadata = buildTocMetadataBySongId(items)

function displayEntries(
  mode: 'order' | 'alphabetical' | 'liked',
  multilingualToc: boolean,
  activeLanguageIds = new Set<string>(),
) {
  return displayTocEntries(toc, mode, {
    items,
    metadataBySongId: metadata,
    activeLanguageIds,
    activeTagIds: new Set(),
    multilingualToc,
  })
}

describe('displayTocEntries', () => {
  it('keeps current order behavior when multilingual TOC is off', () => {
    const entries = displayEntries('order', false)
    expect(entries.map((row) => row.title)).toEqual(['Anchor', 'Boat', 'Zzz Blob', 'Cedar', 'Anchor'])
    expect(entries.map((row) => row.languageIndex)).toEqual([0, 0, null, 2, 1])
    expect(entries.every((row) => row.showNumber)).toBe(true)
    expect(new Set(entries.map((row) => row.key)).size).toBe(entries.length)
  })

  it('keeps one row per source item in alphabetical mode when multilingual TOC is off', () => {
    const entries = displayEntries('alphabetical', false)
    expect(entries.map((row) => row.title)).toEqual(['Anchor', 'Anchor', 'Boat', 'Cedar', 'Zzz Blob'])
    expect(entries.map((row) => row.languageIndex)).toEqual([0, 1, 0, 2, null])
    expect(entries.every((row) => row.showNumber)).toBe(true)
  })

  it('expands alphabetical rows to every translated title when multilingual TOC is on', () => {
    const entries = displayEntries('alphabetical', true)
    expect(entries.map((row) => row.title)).toEqual([
      'Anchor',
      'Anchor',
      'Anker',
      'Anker',
      'Boat',
      'Cedar',
      'Cedro',
      'Cypress',
      'Zzz Blob',
    ])
    expect(entries.map((row) => row.sourceIdx)).toEqual([0, 4, 0, 4, 1, 3, 3, 3, 2])
    expect(entries.map((row) => row.languageIndex)).toEqual([0, 0, 1, 1, 0, 0, 1, 2, null])
    expect(entries.every((row) => !row.showNumber)).toBe(true)
    expect(new Set(entries.map((row) => row.key)).size).toBe(entries.length)
  })

  it('keeps translated rows stable for duplicate setlist occurrences', () => {
    const entries = displayEntries('alphabetical', true)
    const duplicateAnchors = entries.filter((row) => row.title === 'Anchor')
    expect(duplicateAnchors.map((row) => row.sourceIdx)).toEqual([0, 4])
    expect(duplicateAnchors.map((row) => row.languageIndex)).toEqual([0, 0])
    expect(duplicateAnchors[0]?.key).not.toBe(duplicateAnchors[1]?.key)
  })

  it('collapses alphabetical expansion to the active language when a language filter is set', () => {
    const entries = displayEntries('alphabetical', true, new Set(['de']))
    expect(entries.map((row) => row.title)).toEqual(['Anker', 'Anker', 'Cedro', 'Zzz Blob'])
    expect(entries.map((row) => row.sourceIdx)).toEqual([0, 4, 3, 2])
    expect(entries.map((row) => row.languageIndex)).toEqual([1, 1, 1, null])
    expect(entries.every((row) => !row.showNumber)).toBe(true)
  })

  it('keeps liked mode one row per source item', () => {
    const entries = displayEntries('liked', true)
    expect(entries.map((row) => row.title)).toEqual(['Boat'])
    expect(entries.map((row) => row.languageIndex)).toEqual([0])
    expect(entries.every((row) => row.showNumber)).toBe(true)
  })
})

describe('tocDisplayNr', () => {
  it('uses explicit nr when present', () => {
    expect(tocDisplayNr(toc, 1)).toBe('2')
  })

  it('falls back to 1-based order index when nr is blank', () => {
    expect(tocDisplayNr(toc, 4)).toBe('5')
  })

  it('keeps collection order number when sorted alphabetically', () => {
    expect(tocDisplayNr(toc, 0)).toBe('1')
  })
})
