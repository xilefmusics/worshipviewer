import { describe, expect, it } from 'vitest'

import { buildSetlistPatchBody } from '@/lib/setlist-field-diff'
import type { SongLink } from '@/lib/setlist-song-links'

const ownerA = 'team-a'

const base = {
  title: 'A',
  owner: ownerA,
  songs: [{ id: 'x', key: 'C', nr: '1' }] as SongLink[],
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
        { id: 'y', key: null },
        { id: 'x', key: { level: 0 } },
      ],
    })
  })

  it('treats `{ level }` baseline keys same as equivalent chord symbols', () => {
    expect(
      buildSetlistPatchBody(
        {
          title: 'A',
          owner: ownerA,
          songs: [{ id: 'x', key: { level: 0 } } as unknown as SongLink],
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
    ).toEqual({ songs: [{ id: 'x', key: null }] })
  })

  it('treats object-shaped baseline keys as their coerced strings', () => {
    expect(
      buildSetlistPatchBody(
        {
          title: 'A',
          owner: ownerA,
          songs: [{ id: 'x', key: { root: 'C' } } as unknown as SongLink],
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
        songs: [{ id: 'x', key: { name: 'F' } } as unknown as SongLink],
      }),
    ).toEqual({ songs: [{ id: 'x', key: { level: 5 } }] })
  })

  it('stringifies numeric song ids for PATCH bodies', () => {
    const numBase = {
      title: 'A',
      owner: ownerA,
      songs: [{ id: 7 as unknown as string, key: null }] as SongLink[],
    }
    expect(
      buildSetlistPatchBody(numBase, {
        title: 'A',
        owner: ownerA,
        songs: [{ id: '7', key: 'C' }],
      }),
    ).toEqual({ songs: [{ id: '7', key: { level: 0 } }] })
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
})
