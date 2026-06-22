import { describe, expect, it } from 'vitest'

import { buildSetlistPatchBody } from '@/lib/setlist-field-diff'

const ownerA = 'team-a'

const base = {
  title: 'A',
  owner: ownerA,
  songs: [{ id: 'x', key: 'C', nr: '1', flow: null }],
}

describe('buildSetlistPatchBody', () => {
  it('returns null when draft matches normalized baseline', () => {
    expect(
      buildSetlistPatchBody(base, {
        title: 'A',
        owner: ownerA,
        songs: [{ id: 'x', key: 'C', nr: '1', flow: null }],
      }),
    ).toBeNull()
  })

  it('sends title when changed', () => {
    expect(
      buildSetlistPatchBody(base, {
        title: 'B',
        owner: ownerA,
        songs: [{ id: 'x', key: 'C', nr: '1', flow: null }],
      }),
    ).toEqual({ title: 'B' })
  })

  it('sends songs when order differs', () => {
    expect(
      buildSetlistPatchBody(base, {
        title: 'A',
        owner: ownerA,
        songs: [
          { id: 'y', key: null, nr: null, flow: null },
          { id: 'x', key: 'C', nr: '1', flow: null },
        ],
      }),
    ).toEqual({
      songs: [
        { id: 'y', nr: null, key: null, tempo: null, language: null, flow: null },
        { id: 'x', nr: '1', key: { level: 3 }, tempo: null, language: null, flow: null },
      ],
    })
  })

  it('treats equivalent chord symbols as unchanged', () => {
    expect(
      buildSetlistPatchBody(
        {
          title: 'A',
          owner: ownerA,
          songs: [{ id: 'x', key: 'C', nr: '1', flow: null }],
        },
        { title: 'A', owner: ownerA, songs: [{ id: 'x', key: 'C', nr: '1', flow: null }] },
      ),
    ).toBeNull()
  })

  it('detects slot key drift', () => {
    expect(
      buildSetlistPatchBody(base, {
        title: 'A',
        owner: ownerA,
        songs: [{ id: 'x', key: null, nr: '1', flow: null }],
      }),
    ).toEqual({ songs: [{ id: 'x', nr: '1', key: null, tempo: null, language: null, flow: null }] })
  })

  it('treats matching baseline and draft keys as unchanged', () => {
    expect(
      buildSetlistPatchBody(
        {
          title: 'A',
          owner: ownerA,
          songs: [{ id: 'x', key: 'C', nr: '1', flow: null }],
        },
        { title: 'A', owner: ownerA, songs: [{ id: 'x', key: 'C', nr: '1', flow: null }] },
      ),
    ).toBeNull()
  })

  it('serializes slot keys to pitch-class `{ level }` objects for PATCH', () => {
    expect(
      buildSetlistPatchBody(base, {
        title: 'A',
        owner: ownerA,
        songs: [{ id: 'x', key: 'F', nr: '1', flow: null }],
      }),
    ).toEqual({ songs: [{ id: 'x', nr: '1', key: { level: 8 }, tempo: null, language: null, flow: null }] })
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
        songs: [{ id: '7', key: 'C', flow: null }],
      }),
    ).toEqual({ songs: [{ id: '7', nr: null, key: { level: 3 }, tempo: null, language: null, flow: null }] })
  })

  it('sends owner when changed', () => {
    expect(
      buildSetlistPatchBody(base, {
        title: 'A',
        owner: 'team-b',
        songs: [{ id: 'x', key: 'C', nr: '1', flow: null }],
      }),
    ).toEqual({ owner: 'team-b' })
  })

  it('omits empty owner drafts', () => {
    expect(
      buildSetlistPatchBody(base, {
        title: 'A',
        owner: '',
        songs: [{ id: 'x', key: 'C', nr: '1', flow: null }],
      }),
    ).toBeNull()
  })

  it('detects slot tempo drift', () => {
    expect(
      buildSetlistPatchBody(base, {
        title: 'A',
        owner: ownerA,
        songs: [{ id: 'x', key: 'C', nr: '1', tempo: 88, flow: null }],
      }),
    ).toEqual({ songs: [{ id: 'x', nr: '1', key: { level: 3 }, tempo: 88, language: null, flow: null }] })
  })

  it('treats matching tempo overrides as unchanged', () => {
    expect(
      buildSetlistPatchBody(
        {
          title: 'A',
          owner: ownerA,
          songs: [{ id: 'x', key: 'C', nr: '1', tempo: 88, flow: null }],
        },
        { title: 'A', owner: ownerA, songs: [{ id: 'x', key: 'C', nr: '1', tempo: 88, flow: null }] },
      ),
    ).toBeNull()
  })

  it('detects slot language drift', () => {
    expect(
      buildSetlistPatchBody(base, {
        title: 'A',
        owner: ownerA,
        songs: [{ id: 'x', key: 'C', nr: '1', language: 'de', flow: null }],
      }),
    ).toEqual({ songs: [{ id: 'x', nr: '1', key: { level: 3 }, tempo: null, language: 'de', flow: null }] })
  })

  it('treats matching language overrides as unchanged', () => {
    expect(
      buildSetlistPatchBody(
        {
          title: 'A',
          owner: ownerA,
          songs: [{ id: 'x', key: 'C', nr: '1', language: 'de', flow: null }],
        },
        { title: 'A', owner: ownerA, songs: [{ id: 'x', key: 'C', nr: '1', language: ' de ', flow: null }] },
      ),
    ).toBeNull()
  })
})
