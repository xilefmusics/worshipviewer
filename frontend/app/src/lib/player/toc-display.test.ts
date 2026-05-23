import { describe, expect, it } from 'vitest'

import { displayTocEntries, tocDisplayNr } from '@/lib/player/toc-display'

const toc = [
  { idx: 0, nr: '1', title: 'Zebra', liked: false },
  { idx: 1, nr: '2', title: 'Alpha', liked: true },
  { idx: 2, nr: '3', title: 'Beta', liked: false },
]

describe('displayTocEntries', () => {
  it('keeps API order by default', () => {
    expect(displayTocEntries(toc, 'order').map((r) => r.title)).toEqual(['Zebra', 'Alpha', 'Beta'])
  })

  it('sorts alphabetically by title', () => {
    expect(displayTocEntries(toc, 'alphabetical').map((r) => r.title)).toEqual([
      'Alpha',
      'Beta',
      'Zebra',
    ])
  })

  it('filters to liked rows only', () => {
    expect(displayTocEntries(toc, 'liked')).toEqual([toc[1]])
  })
})

describe('tocDisplayNr', () => {
  it('uses explicit nr when present', () => {
    expect(tocDisplayNr(toc, toc[1]!)).toBe('2')
  })

  it('falls back to 1-based order index when nr is blank', () => {
    const row = { idx: 1, nr: '', title: 'Alpha', liked: true }
    expect(tocDisplayNr(toc, row)).toBe('2')
  })

  it('keeps collection order number when sorted alphabetically', () => {
    const row = { idx: 0, nr: '', title: 'Zebra', liked: false }
    expect(tocDisplayNr(toc, row)).toBe('1')
  })
})
