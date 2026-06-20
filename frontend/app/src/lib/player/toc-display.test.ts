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
  { idx: 1, nr: '2', title: 'Beta', id: 'song-b', liked: true },
  { idx: 2, nr: '3', title: 'PDF', liked: false },
  { idx: 3, nr: '', title: 'Anchor', id: 'song-a', liked: false },
]

const items: PlayerItem[] = [
  chordPlayerItem('song-a', { languages: ['en', 'de'], titles: ['Anchor', 'Anker'], language: 'en' }),
  chordPlayerItem('song-b', { languages: ['en'], titles: ['Beta'], language: 'en' }),
  { type: 'blob', blob_id: 'blob:1' } as PlayerItem,
  chordPlayerItem('song-a', { languages: ['en', 'de'], titles: ['Anchor', 'Anker'], language: 'de' }),
]

const metadata = buildTocMetadataBySongId(items)

function displayOrder(multilingualToc: boolean, activeLanguageIds = new Set<string>()) {
  return displayTocEntries(toc, 'order', {
    items,
    metadataBySongId: metadata,
    activeLanguageIds,
    activeTagIds: new Set(),
    multilingualToc,
  })
}

describe('displayTocEntries', () => {
  it('keeps current order behavior when multilingual TOC is off', () => {
    const entries = displayOrder(false)
    expect(entries.map((row) => row.title)).toEqual(['Anchor', 'Beta', 'PDF', 'Anchor'])
    expect(entries.map((row) => row.languageIndex)).toEqual([0, 0, null, 1])
    expect(entries.every((row) => row.showNumber)).toBe(true)
    expect(new Set(entries.map((row) => row.key)).size).toBe(entries.length)
  })

  it('keeps one row per source item when multilingual TOC is on without a language filter', () => {
    const entries = displayOrder(true)
    expect(entries.map((row) => row.title)).toEqual(['Anchor', 'Beta', 'PDF', 'Anchor'])
    expect(entries.map((row) => row.languageIndex)).toEqual([0, 0, null, 1])
  })

  it('uses the translated title and language index for an active language filter', () => {
    const entries = displayOrder(true, new Set(['de']))
    expect(entries.map((row) => row.title)).toEqual(['Anker', 'PDF', 'Anker'])
    expect(entries.map((row) => row.languageIndex)).toEqual([1, null, 1])
    expect(entries.map((row) => tocDisplayNr(toc, row.sourceIdx))).toEqual(['1', '3', '4'])
  })

  it('keeps blob rows visible when language filters are active', () => {
    const entries = displayOrder(true, new Set(['de']))
    expect(entries.find((row) => row.sourceIdx === 2)).toEqual(
      expect.objectContaining({
        title: 'PDF',
        languageIndex: null,
      }),
    )
  })

  it('keeps keys stable for duplicate source items', () => {
    const entries = displayOrder(true, new Set(['de']))
    const keys = entries.map((row) => row.key)
    expect(new Set(keys).size).toBe(keys.length)
    expect(keys[0]).not.toBe(keys[2])
  })
})

describe('tocDisplayNr', () => {
  it('uses explicit nr when present', () => {
    expect(tocDisplayNr(toc, 1)).toBe('2')
  })

  it('falls back to 1-based order index when nr is blank', () => {
    expect(tocDisplayNr(toc, 3)).toBe('4')
  })

  it('keeps collection order number when sorted alphabetically', () => {
    expect(tocDisplayNr(toc, 0)).toBe('1')
  })
})
