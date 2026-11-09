import { describe, expect, it } from 'vitest'

import { tocSlotEntryForIndex } from '@/lib/player/player-helpers'

const toc = [
  { idx: 0, title: 'First', id: 'song-1', nr: '1', liked: false, background: { preset: 2 } },
  { idx: 3, title: 'Media', id: 'media-1', nr: '', liked: false },
  { idx: 4, title: 'Second', id: 'song-2', nr: '2', liked: false, background: { preset: 2 } },
] as const

describe('tocSlotEntryForIndex', () => {
  it('keeps a song background attached across its flattened pages', () => {
    expect(tocSlotEntryForIndex([...toc], 2)?.id).toBe('song-1')
    expect(tocSlotEntryForIndex([...toc], 2)?.background).toEqual({ preset: 2 })
  })

  it('uses a media slot without inheriting the preceding song override', () => {
    expect(tocSlotEntryForIndex([...toc], 3)?.id).toBe('media-1')
    expect(tocSlotEntryForIndex([...toc], 3)?.background).toBeUndefined()
  })

  it('uses the last slot when duplicate TOC entries share an item index', () => {
    const duplicateSlots = [
      { idx: 0, title: 'First', id: 'song-1', nr: '1', liked: false, background: { preset: 2 } },
      { idx: 0, title: 'Second', id: 'song-2', nr: '2', liked: false, background: { preset: 4 } },
    ]
    expect(tocSlotEntryForIndex(duplicateSlots, 0)?.id).toBe('song-2')
    expect(tocSlotEntryForIndex(duplicateSlots, 0)?.background).toEqual({ preset: 4 })
  })
})
