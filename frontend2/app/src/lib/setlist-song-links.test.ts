import { describe, expect, it } from 'vitest'

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
  type SongLink,
} from '@/lib/setlist-song-links'

describe('chordSymbolToPitchLevel', () => {
  it('maps flat roots to the same levels as API wire (0=C … 11=B)', () => {
    expect(chordSymbolToPitchLevel('C')).toBe(0)
    expect(chordSymbolToPitchLevel('Db')).toBe(1)
    expect(chordSymbolToPitchLevel('F')).toBe(5)
    expect(chordSymbolToPitchLevel('A')).toBe(9)
    expect(chordSymbolToPitchLevel('Ab')).toBe(8)
    expect(chordSymbolToPitchLevel('Bb')).toBe(10)
  })

  it('uses longest root prefix and minor / extension tails', () => {
    expect(chordSymbolToPitchLevel('Am')).toBe(9)
    expect(chordSymbolToPitchLevel('Ebm7')).toBe(3)
    expect(chordSymbolToPitchLevel('Ebmaj7')).toBe(3)
  })
})

describe('songLinkKeyEditorToWire', () => {
  it('translates editor strings to `{ level }`', () => {
    expect(songLinkKeyEditorToWire('Db')).toEqual({ level: 1 })
  })

  it('accepts structured keys from GET responses', () => {
    expect(songLinkKeyEditorToWire({ level: 10 })).toEqual({ level: 10 })
  })

  it('returns null for default / missing key', () => {
    expect(songLinkKeyEditorToWire(null)).toBeNull()
    expect(songLinkKeyEditorToWire('')).toBeNull()
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
    expect(coerceMusicalKeyString({ level: 7 })).toBe('G')
    expect(coerceMusicalKeyString({ level: 6 })).toBe('Gb')
    expect(coerceMusicalKeyString(0)).toBe('C')
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

  it('maps API pitch-class level objects (0=C … 11=B, chromatic from C)', () => {
    expect(resolveSongDataKey({ key: { level: 7 } })).toBe('G')
    expect(resolveSongDataKey({ key: { level: 0 } })).toBe('C')
    expect(resolveSongDataKey({ key: { level: 11 } })).toBe('B')
    expect(resolveSongDataKey({ key: { level: 1 } })).toBe('Db')
    expect(resolveSongDataKey({ key: { level: 10 } })).toBe('Bb')
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

describe('normalizeSongLinksForEditor', () => {
  it('keeps id and key only', () => {
    expect(normalizeSongLinksForEditor([{ id: 'a', key: 'C', nr: '1' }])).toEqual([{ id: 'a', key: 'C' }])
    expect(normalizeSongLinksForEditor([{ id: 'b', key: null }])).toEqual([{ id: 'b', key: null }])
  })

  it('normalizes opaque song ids to strings', () => {
    expect(normalizeSongLinksForEditor([{ id: 99 as unknown as string, key: null }])).toEqual([
      { id: '99', key: null },
    ])
  })

  it('coerces structured slot keys to strings', () => {
    expect(
      normalizeSongLinksForEditor([{ id: 'a', key: { root: 'F#' } as unknown as string | null }]),
    ).toEqual([{ id: 'a', key: 'Gb' }])
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
    const links: SongLink[] = [
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
      normalizeSongLinksForCollectionEditor([{ id: 'a', key: 'C', nr: ' 1 ' }]),
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
      key: { level: 0 },
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
