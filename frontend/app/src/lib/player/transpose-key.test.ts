import { describe, expect, it } from 'vitest'

import { nextPlayerScrollType } from '@/lib/player/effective-scroll-type'
import { CAPO_SHAPE_KEYS, capoFretForKeys, resolvePlayerKeyState } from '@/lib/player/capo'
import {
  formatPlayedKeyOffset,
  resolveTransposeKey,
  stepMusicalKey,
  transposeOffsetBetweenKeys,
} from '@/lib/player/transpose-key'

describe('capoFretForKeys', () => {
  it('calculates the positive capo distance', () => {
    expect(capoFretForKeys('A', 'G')).toBe(2)
    expect(capoFretForKeys('A', 'A')).toBe(0)
    expect(capoFretForKeys('C', 'G')).toBe(5)
    for (const shapeKey of CAPO_SHAPE_KEYS) {
      expect(capoFretForKeys(shapeKey, shapeKey)).toBe(0)
    }
  })

  it('wraps around the chromatic key list', () => {
    expect(capoFretForKeys('C', 'B')).toBe(1)
  })

  it('returns null for invalid keys', () => {
    expect(capoFretForKeys('H', 'G')).toBeNull()
    expect(capoFretForKeys('A', 'H')).toBeNull()
  })
})

describe('resolvePlayerKeyState', () => {
  it('renders the selected capo shape while preserving the sounding key', () => {
    expect(resolvePlayerKeyState('A', undefined, 'G')).toEqual({
      soundingKey: 'A',
      displayKey: 'G',
      capoShapeKey: 'G',
      capoFret: 2,
    })
  })

  it('moves the capo when the sounding key changes', () => {
    expect(resolvePlayerKeyState('A', 'D', 'G')).toEqual({
      soundingKey: 'D',
      displayKey: 'G',
      capoShapeKey: 'G',
      capoFret: 7,
    })
  })

  it('falls back to ordinary transposition for invalid capo state', () => {
    expect(resolvePlayerKeyState('A', 'D', 'H')).toEqual({
      soundingKey: 'D',
      displayKey: 'D',
      capoShapeKey: null,
      capoFret: null,
    })
  })
})

describe('stepMusicalKey', () => {
  it('steps up and down within the chromatic circle', () => {
    expect(stepMusicalKey('G', 1)).toBe('Ab')
    expect(stepMusicalKey('C', -1)).toBe('B')
    expect(stepMusicalKey('B', 1)).toBe('C')
  })

  it('returns null for unknown keys', () => {
    expect(stepMusicalKey('H', 1)).toBeNull()
  })
})

describe('resolveTransposeKey', () => {
  it('returns null when display key is missing', () => {
    expect(resolveTransposeKey(null, 1)).toBeNull()
    expect(resolveTransposeKey(undefined, -1)).toBeNull()
  })

  it('transposes from a valid display key', () => {
    expect(resolveTransposeKey('D', 1)).toBe('Eb')
    expect(resolveTransposeKey('D', -1)).toBe('Db')
  })
})

describe('transposeOffsetBetweenKeys', () => {
  it('keeps offsets in the -5…+6 range', () => {
    expect(transposeOffsetBetweenKeys('A', 'E')).toBe(-5)
    expect(transposeOffsetBetweenKeys('A', 'Eb')).toBe(6)
    expect(transposeOffsetBetweenKeys('A', 'A')).toBe(0)
  })

  it('returns null when either key is invalid', () => {
    expect(transposeOffsetBetweenKeys('H', 'A')).toBeNull()
    expect(transposeOffsetBetweenKeys('A', null)).toBeNull()
  })
})

describe('formatPlayedKeyOffset', () => {
  it('formats the interval from the played key to the selected key', () => {
    expect(formatPlayedKeyOffset(-4)).toBe('+4')
    expect(formatPlayedKeyOffset(1)).toBe('-1')
    expect(formatPlayedKeyOffset(0)).toBe('0')
  })
})

describe('nextPlayerScrollType', () => {
  it('cycles through supported player scroll modes', () => {
    expect(nextPlayerScrollType('one_page')).toBe('book')
    expect(nextPlayerScrollType('book')).toBe('one_column')
    expect(nextPlayerScrollType('one_column')).toBe('one_column_next')
    expect(nextPlayerScrollType('one_column_next')).toBe('two_column')
    expect(nextPlayerScrollType('two_column')).toBe('two_column_next')
    expect(nextPlayerScrollType('two_column_next')).toBe('three_column')
    expect(nextPlayerScrollType('three_column')).toBe('three_column_next')
    expect(nextPlayerScrollType('three_column_next')).toBe('one_page')
  })
})
