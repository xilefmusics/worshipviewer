import { describe, expect, it } from 'vitest'

import { buildCollectionPatchBody } from '@/lib/collection-field-diff'

const base = {
  title: 'A',
  cover: '',
  owner: 'team-a',
  songs: [{ id: 'x', key: 'C', nr: '1' }],
}

describe('buildCollectionPatchBody', () => {
  it('returns null when draft matches normalized baseline', () => {
    expect(
      buildCollectionPatchBody(base, {
        title: 'A',
        cover: '',
        owner: 'team-a',
        songs: [{ id: 'x', key: 'C', nr: '1' }],
      }),
    ).toBeNull()
  })

  it('sends title when changed', () => {
    expect(
      buildCollectionPatchBody(base, {
        title: 'B',
        cover: '',
        owner: 'team-a',
        songs: [{ id: 'x', key: 'C', nr: '1' }],
      }),
    ).toEqual({ title: 'B' })
  })

  it('sends cover when changed', () => {
    expect(
      buildCollectionPatchBody(base, {
        title: 'A',
        cover: 'blob-1',
        owner: 'team-a',
        songs: [{ id: 'x', key: 'C', nr: '1' }],
      }),
    ).toEqual({ cover: 'blob-1' })
  })

  it('sends owner when changed', () => {
    expect(
      buildCollectionPatchBody(base, {
        title: 'A',
        cover: '',
        owner: 'team-b',
        songs: [{ id: 'x', key: 'C', nr: '1' }],
      }),
    ).toEqual({ owner: 'team-b' })
  })

  it('sends songs when slot nr changes', () => {
    expect(
      buildCollectionPatchBody(base, {
        title: 'A',
        cover: '',
        owner: 'team-a',
        songs: [{ id: 'x', key: 'C', nr: '2' }],
      }),
    ).toEqual({
      songs: [{ id: 'x', key: { level: 3 }, nr: '2' }],
    })
  })

  it('clears nr to null in PATCH body', () => {
    expect(
      buildCollectionPatchBody(base, {
        title: 'A',
        cover: '',
        owner: 'team-a',
        songs: [{ id: 'x', key: 'C', nr: null }],
      }),
    ).toEqual({
      songs: [{ id: 'x', key: { level: 3 }, nr: null }],
    })
  })

  it('sends full songs array when order changes', () => {
    expect(
      buildCollectionPatchBody(base, {
        title: 'A',
        cover: '',
        owner: 'team-a',
        songs: [
          { id: 'y', key: null, nr: null },
          { id: 'x', key: 'C', nr: '1' },
        ],
      }),
    ).toEqual({
      songs: [
        { id: 'y', key: null, nr: null },
        { id: 'x', key: { level: 3 }, nr: '1' },
      ],
    })
  })
})
