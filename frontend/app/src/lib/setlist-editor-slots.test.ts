import { describe, expect, it } from 'vitest'

import {
  makeMediaSlotRow,
  setlistItemsFromSlots,
  slotsFromSetlistItems,
} from '@/lib/setlist-editor-slots'

describe('mixed setlist editor slots', () => {
  it('preserves tagged order, repeats, and song overrides when serialized', () => {
    const items = [
      { type: 'media' as const, id: 'media:1' },
      { type: 'song' as const, id: 'song:1', nr: '4', key: { level: 3 }, tempo: 92, language: 'de', flow: null },
      { type: 'media' as const, id: 'media:1' },
    ]
    const slots = slotsFromSetlistItems(items)

    expect(slots.map((slot) => slot.type)).toEqual(['media', 'song', 'media'])
    expect(slots[0]?.slotId).not.toBe(slots[2]?.slotId)
    expect(setlistItemsFromSlots(slots)).toEqual(items)
  })

  it('gives repeated media independent local identities', () => {
    const first = makeMediaSlotRow('media:repeat')
    const second = makeMediaSlotRow('media:repeat')

    expect(first.link).toEqual(second.link)
    expect(first.slotId).not.toBe(second.slotId)
  })

  it('serializes reordered mixed rows in their exact editor order', () => {
    const slots = slotsFromSetlistItems([
      { type: 'song', id: 'song:1', key: null },
      { type: 'media', id: 'media:1' },
    ])
    expect(setlistItemsFromSlots([slots[1]!, slots[0]!])).toEqual([
      { type: 'media', id: 'media:1' },
      { type: 'song', id: 'song:1', nr: null, key: null, tempo: null, language: null, flow: null },
    ])
  })

  it('round-trips a saved capo shape on a song slot', () => {
    const slots = slotsFromSetlistItems([
      { type: 'song', id: 'song:1', key: { level: 0 }, capo_shape: { level: 10 } },
    ])

    expect(slots[0]?.type === 'song' ? slots[0].link.capoShapeKey : null).toBe('G')
    expect(setlistItemsFromSlots(slots)).toEqual([
      {
        type: 'song',
        id: 'song:1',
        nr: null,
        key: { level: 0 },
        capo_shape: { level: 10 },
        tempo: null,
        language: null,
        flow: null,
      },
    ])
  })
})
