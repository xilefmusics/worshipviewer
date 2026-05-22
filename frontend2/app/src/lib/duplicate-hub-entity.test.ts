import { describe, expect, it } from 'vitest'

import type { components } from '@/api/schema'
import {
  buildDuplicateCollectionBody,
  buildDuplicateSetlistBody,
  duplicateTitle,
} from '@/lib/duplicate-hub-entity'

describe('duplicate hub entity', () => {
  it('appends suffix to trimmed title', () => {
    expect(duplicateTitle('Sunday set', '(copy)')).toBe('Sunday set (copy)')
    expect(duplicateTitle('  Easter  ', '(copy)')).toBe('Easter (copy)')
  })

  it('uses em dash when title is empty', () => {
    expect(duplicateTitle('   ', '(copy)')).toBe('— (copy)')
  })

  it('builds setlist create payload from detail', () => {
    const source: components['schemas']['Setlist'] = {
      id: 'sl-1',
      title: 'Main',
      owner: 'team-a',
      songs: [{ id: 'song-1', nr: '1' }, { id: 'song-2' }],
    }
    expect(buildDuplicateSetlistBody(source, '(copy)')).toEqual({
      title: 'Main (copy)',
      owner: 'team-a',
      songs: [{ id: 'song-1', nr: '1' }, { id: 'song-2' }],
    })
  })

  it('builds collection create payload including cover', () => {
    const source: components['schemas']['Collection'] = {
      id: 'col-1',
      title: 'Hymns',
      owner: 'team-b',
      cover: 'blob-cover-id',
      songs: [{ id: 'song-3' }],
    }
    expect(buildDuplicateCollectionBody(source, '(Kopie)')).toEqual({
      title: 'Hymns (Kopie)',
      owner: 'team-b',
      cover: 'blob-cover-id',
      songs: [{ id: 'song-3' }],
    })
  })
})
