import { describe, expect, it } from 'vitest'

import { nextPlayerScrollType } from '@/lib/player/effective-scroll-type'
import { resolveTransposeKey, stepMusicalKey } from '@/lib/player/transpose-key'

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

describe('nextPlayerScrollType', () => {
  it('cycles through supported player scroll modes', () => {
    expect(nextPlayerScrollType('one_page')).toBe('book')
    expect(nextPlayerScrollType('book')).toBe('two_column')
    expect(nextPlayerScrollType('two_column')).toBe('three_column')
    expect(nextPlayerScrollType('three_column')).toBe('one_page')
  })
})
