import { describe, expect, it } from 'vitest'

import type { components } from '@/api/schema'

import {
  chordSymbolToPitchLevel,
  coerceMusicalKeyString,
  songLinkKeyEditorToWire,
  applyOptimisticReorder,
  insertAt,
  moveIndex,
  normalizeSongLinkNr,
  normalizeSongLinksForCollectionEditor,
  normalizeSongLinksForEditor,
  removeAt,
  resolveSongDataKey,
  songLinkForCollectionMutation,
  songLinkForSetlistMutation,
  songLinkTempoEditorToWire,
  type EditorSongLink,
} from '@/lib/setlist-song-links'

type WireSongLink = components['schemas']['SongLink']

describe('chordSymbolToPitchLevel', () => {
  it('maps flat roots to chordlib pitch-class levels (0=A … 11=Ab)', () => {
    expect(chordSymbolToPitchLevel('A')).toBe(0)
    expect(chordSymbolToPitchLevel('Bb')).toBe(1)
    expect(chordSymbolToPitchLevel('C')).toBe(3)
    expect(chordSymbolToPitchLevel('Db')).toBe(4)
    expect(chordSymbolToPitchLevel('F')).toBe(8)
    expect(chordSymbolToPitchLevel('Ab')).toBe(11)
  })

  it('uses longest root prefix and minor / extension tails', () => {
    expect(chordSymbolToPitchLevel('Am')).toBe(0)
    expect(chordSymbolToPitchLevel('Ebm7')).toBe(6)
    expect(chordSymbolToPitchLevel('Ebmaj7')).toBe(6)
  })
})

describe('songLinkKeyEditorToWire', () => {
  it('translates editor strings to `{ level }`', () => {
    expect(songLinkKeyEditorToWire('Db')).toEqual({ level: 4 })
  })

  it('accepts structured keys from GET responses', () => {
    expect(songLinkKeyEditorToWire({ level: 10 })).toEqual({ level: 10 })
  })

  it('returns null for default / missing key', () => {
    expect(songLinkKeyEditorToWire(null)).toBeNull()
    expect(songLinkKeyEditorToWire('')).toBeNull()
  })
})

describe('songLinkTempoEditorToWire', () => {
  it('normalizes valid BPM values', () => {
    expect(songLinkTempoEditorToWire(120.4)).toBe(120)
    expect(songLinkTempoEditorToWire('88')).toBeNull()
  })

  it('returns null for inherit / invalid values', () => {
    expect(songLinkTempoEditorToWire(null)).toBeNull()
    expect(songLinkTempoEditorToWire(undefined)).toBeNull()
    expect(songLinkTempoEditorToWire(0)).toBeNull()
    expect(songLinkTempoEditorToWire(1000)).toBeNull()
  })
})

describe('songLinkForSetlistMutation', () => {
  it('includes tempo override on wire payload', () => {
    expect(
      songLinkForSetlistMutation({ id: 's1', key: 'C', tempo: 96 }),
    ).toEqual({ id: 's1', key: { level: 3 }, tempo: 96 })
  })

  it('serializes inherit tempo as null', () => {
    expect(songLinkForSetlistMutation({ id: 's1', key: null, tempo: null })).toEqual({
      id: 's1',
      key: null,
      tempo: null,
    })
  })
})

describe('normalizeSongLinksForEditor', () => {
  it('carries tempo from wire links', () => {
    const links: WireSongLink[] = [{ id: 'a', key: null, tempo: 72 }]
    expect(normalizeSongLinksForEditor(links)).toEqual([{ id: 'a', key: null, tempo: 72 }])
  })

  it('keeps id and key only', () => {
    expect(normalizeSongLinksForEditor([{ id: 'a', key: { level: 3 }, nr: '1' }])).toEqual([
      { id: 'a', key: 'C', tempo: null },
    ])
    expect(normalizeSongLinksForEditor([{ id: 'b', key: null }])).toEqual([
      { id: 'b', key: null, tempo: null },
    ])
  })

  it('normalizes opaque song ids to strings', () => {
    expect(normalizeSongLinksForEditor([{ id: 99 as unknown as string, key: null }])).toEqual([
      { id: '99', key: null, tempo: null },
    ])
  })

  it('coerces wire `{ level }` keys to chord symbols', () => {
    expect(
      normalizeSongLinksForEditor([{ id: 'a', key: { level: 8 } } as WireSongLink]),
    ).toEqual([{ id: 'a', key: 'F', tempo: null }])
  })
})

describe('coerceMusicalKeyString', () => {
  it('handles strings', () => {
    expect(coerceMusicalKeyString('  Am  ')).toBe('Am')
    expect(coerceMusicalKeyString('')).toBeNull()
    expect(coerceMusicalKeyString(null)).toBeNull()
  })
  it('extracts chord symbol objects', () => {
    expect(coerceMusicalKeyString({ name: 'Dm' })).toBe('Dm')
    expect(coerceMusicalKeyString({ key: 'Eb' })).toBe('Eb')
    expect(coerceMusicalKeyString({ root: 'C' })).toBe('C')
    expect(coerceMusicalKeyString({ key: { root: 'Gm' } })).toBe('Gm')
    expect(coerceMusicalKeyString({ level: 7 })).toBe('E')
    expect(coerceMusicalKeyString({ level: 6 })).toBe('Eb')
    expect(coerceMusicalKeyString(0)).toBe('A')
    expect(coerceMusicalKeyString({ level: 3 })).toBe('C')
    expect(coerceMusicalKeyString('C#')).toBe('Db')
    expect(coerceMusicalKeyString('F#m7')).toBe('Gbm7')
    expect(coerceMusicalKeyString({})).toBeNull()
    expect(coerceMusicalKeyString([])).toBeNull()
  })
})

describe('resolveSongDataKey', () => {
  it('uses structured key first', () => {
    expect(resolveSongDataKey({ key: 'Bb', tags: { key: 'C' } })).toBe('Bb')
  })

  it('maps API pitch-class level objects (chordlib: 0=A … 11=Ab)', () => {
    expect(resolveSongDataKey({ key: { level: 7 } })).toBe('E')
    expect(resolveSongDataKey({ key: { level: 0 } })).toBe('A')
    expect(resolveSongDataKey({ key: { level: 3 } })).toBe('C')
    expect(resolveSongDataKey({ key: { level: 11 } })).toBe('Ab')
    expect(resolveSongDataKey({ key: { level: 1 } })).toBe('Bb')
    expect(resolveSongDataKey({ key: { level: 10 } })).toBe('G')
  })

  it('falls back to tags.key variants', () => {
    expect(resolveSongDataKey({ tags: { key: 'Dm' } })).toBe('Dm')
    expect(resolveSongDataKey({ tags: { Key: '  Em  ' } })).toBe('Em')
    expect(resolveSongDataKey({ tags: { odd: 1, KEY: 'F' } })).toBe('F')
  })

  it('matches tag keys case-insensitively', () => {
    expect(resolveSongDataKey({ tags: { KeY: 'Gm' } })).toBe('Gm')
  })

  it('reads key from section block meta', () => {
    expect(
      resolveSongDataKey({
        sections: [{ meta: { key: 'A' } }, { lines: [] }],
      }),
    ).toBe('A')
  })

  it('uses default_key and musical_key', () => {
    expect(resolveSongDataKey({ default_key: 'Dm' })).toBe('Dm')
    expect(resolveSongDataKey({ musical_key: 'Gm' })).toBe('Gm')
  })

  it('deep-scans nested structures', () => {
    expect(
      resolveSongDataKey({
        sections: {
          a: { lines: [], meta: { nested: { key: 'Bb' } } },
        },
      }),
    ).toBe('Bb')
  })

  it('parses {key: …} inside short strings', () => {
    expect(resolveSongDataKey({ subtitle: 'Intro {key: F#}' })).toBe('Gb')
  })

  it('returns null when missing', () => {
    expect(resolveSongDataKey(undefined)).toBeNull()
    expect(resolveSongDataKey({ tags: {} })).toBeNull()
  })
})

describe('moveIndex', () => {
  it('returns a copy unchanged when bounds invalid or same index', () => {
    const a = [1, 2, 3]
    expect(moveIndex(a, -1, 1)).toEqual([1, 2, 3])
    expect(moveIndex(a, 10, 0)).toEqual([1, 2, 3])
    expect(moveIndex(a, 0, 0)).toEqual([1, 2, 3])
  })

  it('moves an item toward the tail', () => {
    expect(moveIndex([1, 2, 3, 4], 0, 3)).toEqual([2, 3, 4, 1])
  })

  it('moves an item toward the head', () => {
    expect(moveIndex([1, 2, 3, 4], 3, 0)).toEqual([4, 1, 2, 3])
  })
})

describe('insertAt', () => {
  it('noop when index out of range', () => {
    expect(insertAt([1], -1, 9)).toEqual([1])
    expect(insertAt([1], 3, 9)).toEqual([1])
  })

  it('inserts including append', () => {
    expect(insertAt([1, 2], 0, 9)).toEqual([9, 1, 2])
    expect(insertAt([1, 2], 2, 9)).toEqual([1, 2, 9])
  })
})

describe('removeAt', () => {
  it('noop when index invalid', () => {
    expect(removeAt([1], -1)).toEqual([1])
    expect(removeAt([1], 2)).toEqual([1])
  })

  it('drops the index', () => {
    expect(removeAt([1, 2, 3], 1)).toEqual([1, 3])
  })
})

describe('applyOptimisticReorder', () => {
  it('delegates to moveIndex', () => {
    expect(applyOptimisticReorder(['a', 'b', 'c'], 2, 0)).toEqual(['c', 'a', 'b'])
  })

  it('preserves nr and duplicate ids on slots', () => {
    const links: EditorSongLink[] = [
      { id: 'a', key: 'C', nr: '1' },
      { id: 'a', key: 'D', nr: '2' },
    ]
    expect(applyOptimisticReorder(links, 0, 1)).toEqual([
      { id: 'a', key: 'D', nr: '2' },
      { id: 'a', key: 'C', nr: '1' },
    ])
  })
})

describe('normalizeSongLinkNr', () => {
  it('trims nonempty strings', () => {
    expect(normalizeSongLinkNr('  2a  ')).toBe('2a')
    expect(normalizeSongLinkNr('')).toBeNull()
    expect(normalizeSongLinkNr(' \t')).toBeNull()
    expect(normalizeSongLinkNr(null)).toBeNull()
  })
})

describe('normalizeSongLinksForCollectionEditor', () => {
  it('keeps normalized nr alongside id/key', () => {
    expect(
      normalizeSongLinksForCollectionEditor([{ id: 'a', key: { level: 3 }, nr: ' 1 ' }]),
    ).toEqual([{ id: 'a', key: 'C', nr: '1' }])
    expect(normalizeSongLinksForCollectionEditor([{ id: 'b', key: null, nr: '' }])).toEqual([
      { id: 'b', key: null, nr: null },
    ])
  })
})

describe('songLinkForCollectionMutation', () => {
  it('maps key to wire and nr to null when empty', () => {
    expect(songLinkForCollectionMutation({ id: 'x', key: 'C', nr: ' \n' })).toEqual({
      id: 'x',
      key: { level: 3 },
      nr: null,
    })
  })

  it('preserves nonempty nr string', () => {
    expect(songLinkForCollectionMutation({ id: 'y', key: null, nr: '3b' })).toEqual({
      id: 'y',
      key: null,
      nr: '3b',
    })
  })
})
