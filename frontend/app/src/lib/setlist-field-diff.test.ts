import { describe, expect, it } from 'vitest'

import { buildSetlistPatchBody } from '@/lib/setlist-field-diff'

const ownerA = 'team-a'

const base = {
  title: 'A',
  owner: ownerA,
  songs: [{ id: 'x', key: 'C', nr: '1' }],
}

describe('buildSetlistPatchBody', () => {
  it('returns null when draft matches normalized baseline', () => {
    expect(
      buildSetlistPatchBody(base, {
        title: 'A',
        owner: ownerA,
        songs: [{ id: 'x', key: 'C' }],
      }),
    ).toBeNull()
  })

  it('sends title when changed', () => {
    expect(
      buildSetlistPatchBody(base, {
        title: 'B',
        owner: ownerA,
        songs: [{ id: 'x', key: 'C' }],
      }),
    ).toEqual({ title: 'B' })
  })

  it('sends songs when order differs', () => {
    expect(
      buildSetlistPatchBody(base, {
        title: 'A',
        owner: ownerA,
        songs: [
          { id: 'y', key: null },
          { id: 'x', key: 'C' },
        ],
      }),
    ).toEqual({
      songs: [
        { id: 'y', key: null, tempo: null, language: null },
        { id: 'x', key: { level: 3 }, tempo: null, language: null },
      ],
    })
  })

  it('treats equivalent chord symbols as unchanged', () => {
    expect(
      buildSetlistPatchBody(
        {
          title: 'A',
          owner: ownerA,
          songs: [{ id: 'x', key: 'C' }],
        },
        { title: 'A', owner: ownerA, songs: [{ id: 'x', key: 'C' }] },
      ),
    ).toBeNull()
  })

  it('detects slot key drift', () => {
    expect(
      buildSetlistPatchBody(base, {
        title: 'A',
        owner: ownerA,
        songs: [{ id: 'x', key: null }],
      }),
    ).toEqual({ songs: [{ id: 'x', key: null, tempo: null, language: null }] })
  })

  it('treats matching baseline and draft keys as unchanged', () => {
    expect(
      buildSetlistPatchBody(
        {
          title: 'A',
          owner: ownerA,
          songs: [{ id: 'x', key: 'C' }],
        },
        { title: 'A', owner: ownerA, songs: [{ id: 'x', key: 'C' }] },
      ),
    ).toBeNull()
  })

  it('serializes slot keys to pitch-class `{ level }` objects for PATCH', () => {
    expect(
      buildSetlistPatchBody(base, {
        title: 'A',
        owner: ownerA,
        songs: [{ id: 'x', key: 'F' }],
      }),
    ).toEqual({ songs: [{ id: 'x', key: { level: 8 }, tempo: null, language: null }] })
  })

  it('stringifies numeric song ids for PATCH bodies', () => {
    const numBase = {
      title: 'A',
      owner: ownerA,
      songs: [{ id: '7', key: null }],
    }
    expect(
      buildSetlistPatchBody(numBase, {
        title: 'A',
        owner: ownerA,
        songs: [{ id: '7', key: 'C' }],
      }),
    ).toEqual({ songs: [{ id: '7', key: { level: 3 }, tempo: null, language: null }] })
  })

  it('sends owner when changed', () => {
    expect(
      buildSetlistPatchBody(base, {
        title: 'A',
        owner: 'team-b',
        songs: [{ id: 'x', key: 'C' }],
      }),
    ).toEqual({ owner: 'team-b' })
  })

  it('omits empty owner drafts', () => {
    expect(
      buildSetlistPatchBody(base, {
        title: 'A',
        owner: '',
        songs: [{ id: 'x', key: 'C' }],
      }),
    ).toBeNull()
  })

  it('detects slot tempo drift', () => {
    expect(
      buildSetlistPatchBody(base, {
        title: 'A',
        owner: ownerA,
        songs: [{ id: 'x', key: 'C', tempo: 88 }],
      }),
    ).toEqual({ songs: [{ id: 'x', key: { level: 3 }, tempo: 88, language: null }] })
  })

  it('treats matching tempo overrides as unchanged', () => {
    expect(
      buildSetlistPatchBody(
        {
          title: 'A',
          owner: ownerA,
          songs: [{ id: 'x', key: 'C', tempo: 88 }],
        },
        { title: 'A', owner: ownerA, songs: [{ id: 'x', key: 'C', tempo: 88 }] },
      ),
    ).toBeNull()
  })

  it('detects slot language drift', () => {
    expect(
      buildSetlistPatchBody(base, {
        title: 'A',
        owner: ownerA,
        songs: [{ id: 'x', key: 'C', language: 'de' }],
      }),
    ).toEqual({ songs: [{ id: 'x', key: { level: 3 }, tempo: null, language: 'de' }] })
  })

  it('treats matching language overrides as unchanged', () => {
    expect(
      buildSetlistPatchBody(
        {
          title: 'A',
          owner: ownerA,
          songs: [{ id: 'x', key: 'C', language: 'de' }],
        },
        { title: 'A', owner: ownerA, songs: [{ id: 'x', key: 'C', language: ' de ' }] },
      ),
    ).toBeNull()
  })
})
