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
  { idx: 0, nr: '1', title: 'Anchor', id: 'song-a', liked: true },
  { idx: 1, nr: '2', title: 'Boat', id: 'song-b', liked: false },
  { idx: 2, nr: '3', title: 'PDF', liked: false },
  { idx: 3, nr: '4', title: 'Cedar', id: 'song-c', liked: true },
  { idx: 4, nr: '', title: 'Anchor', id: 'song-a', liked: true },
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
    titles: ['Cedar', ' ', 'Cypress'],
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
    expect(entries.map((row) => row.title)).toEqual(['Anchor', 'Boat', 'PDF', 'Cedar', 'Anchor'])
    expect(entries.map((row) => row.languageIndex)).toEqual([0, 0, null, 2, 1])
    expect(entries.every((row) => row.showNumber)).toBe(true)
    expect(new Set(entries.map((row) => row.key)).size).toBe(entries.length)
  })

  it('keeps current liked behavior when multilingual TOC is off', () => {
    const entries = displayEntries('liked', false)
    expect(entries.map((row) => row.title)).toEqual(['Anchor', 'Cedar', 'Anchor'])
    expect(entries.map((row) => row.sourceIdx)).toEqual([0, 3, 4])
    expect(entries.map((row) => row.languageIndex)).toEqual([0, 2, 1])
    expect(entries.every((row) => row.showNumber)).toBe(true)
  })

  it('expands alphabetical rows to every non-empty translated title and skips blanks', () => {
    const entries = displayEntries('alphabetical', true)
    expect(entries.map((row) => row.title)).toEqual([
      'Anchor',
      'Anchor',
      'Anker',
      'Anker',
      'Boat',
      'Cedar',
      'Cypress',
      'PDF',
    ])
    expect(entries.map((row) => row.sourceIdx)).toEqual([0, 4, 0, 4, 1, 3, 3, 2])
    expect(entries.map((row) => row.languageIndex)).toEqual([0, 0, 1, 1, 0, 0, 2, null])
    expect(entries.every((row) => !row.showNumber)).toBe(true)
    expect(new Set(entries.map((row) => row.key)).size).toBe(entries.length)
  })

  it('keeps liked fan-out in source order and preserves hearts', () => {
    const entries = displayEntries('liked', true)
    expect(entries.map((row) => row.title)).toEqual(['Anchor', 'Anker', 'Cedar', 'Cypress', 'Anchor', 'Anker'])
    expect(entries.map((row) => row.sourceIdx)).toEqual([0, 0, 3, 3, 4, 4])
    expect(entries.map((row) => row.languageIndex)).toEqual([0, 1, 0, 2, 0, 1])
    expect(entries.every((row) => row.liked)).toBe(true)
    expect(entries.every((row) => !row.showNumber)).toBe(true)
    expect(new Set(entries.map((row) => row.key)).size).toBe(entries.length)
    expect(entries[0]?.key).not.toBe(entries[4]?.key)
  })

  it('uses the filtered language in order mode and omits missing translated titles', () => {
    const entries = displayEntries('order', true, new Set(['de']))
    expect(entries.map((row) => row.title)).toEqual(['Anker', 'PDF', 'Anker'])
    expect(entries.map((row) => row.sourceIdx)).toEqual([0, 2, 4])
    expect(entries.map((row) => row.languageIndex)).toEqual([1, null, 1])
    expect(entries.every((row) => row.showNumber)).toBe(true)
  })

  it('collapses liked mode to the filtered language and omits missing translated titles', () => {
    const entries = displayEntries('liked', true, new Set(['de']))
    expect(entries.map((row) => row.title)).toEqual(['Anker', 'Anker'])
    expect(entries.map((row) => row.sourceIdx)).toEqual([0, 4])
    expect(entries.map((row) => row.languageIndex)).toEqual([1, 1])
    expect(entries.every((row) => row.liked)).toBe(true)
    expect(entries.every((row) => !row.showNumber)).toBe(true)
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
