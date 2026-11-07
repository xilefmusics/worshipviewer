import { describe, expect, it } from 'vitest'

import type { components } from '@/api/schema'
import type { SongFlowItem } from '@/ports/chord-engine'
import {
  completeRoomFlow,
  roomRenderedSectionToSourceSlide,
  roomSourceSectionRefs,
  roomSourceSlideToRenderedSection,
} from '@/lib/room-slide-index'

type Section = components['schemas']['Section']

function section(title: string, text: string, repeatCount = 1): Section {
  return {
    title,
    repeat_count: repeatCount,
    lines: [{ parts: [{ comment: false, languages: [text] }] }],
  } as Section
}

function flow(title: string, occurrence_index: number): SongFlowItem {
  return { title, occurrence_index, repeats: 1 }
}

describe('room slide index mapping', () => {
  it('maps reordered custom flows to stable source sections and adds omitted sections', () => {
    const sections = [
      section('Verse', 'first', 2),
      section('Chorus', 'chorus'),
      section('Verse', 'second'),
      section('Verse', 'first', 2),
    ]
    const customFlow = [flow('Chorus', 0), flow('Verse', 1)]

    expect(roomSourceSectionRefs(sections)).toEqual([
      { title: 'Verse', occurrence_index: 0 },
      { title: 'Chorus', occurrence_index: 0 },
      { title: 'Verse', occurrence_index: 1 },
      { title: 'Verse', occurrence_index: 0 },
    ])
    expect(completeRoomFlow(sections, customFlow)).toEqual([
      ...customFlow,
      { title: 'Verse', occurrence_index: 0, repeats: 2 },
    ])
    const completedFlow = completeRoomFlow(sections, customFlow)!
    expect(roomSourceSlideToRenderedSection(sections, completedFlow, 0)).toBe(2)
    expect(roomSourceSlideToRenderedSection(sections, completedFlow, 1)).toBe(0)
    expect(roomSourceSlideToRenderedSection(sections, completedFlow, 2)).toBe(1)
    expect(roomSourceSlideToRenderedSection(sections, completedFlow, 3)).toBe(2)
    expect(roomRenderedSectionToSourceSlide(sections, completedFlow, 0)).toBe(1)
    expect(roomRenderedSectionToSourceSlide(sections, completedFlow, 1)).toBe(2)
    expect(roomRenderedSectionToSourceSlide(sections, completedFlow, 2)).toBe(0)
  })

  it('uses source order for songs without a valid custom flow', () => {
    const sections = [section('Verse', 'first'), section('Chorus', 'chorus')]
    expect(roomSourceSlideToRenderedSection(sections, null, 1)).toBe(1)
    expect(roomRenderedSectionToSourceSlide(sections, undefined, 0)).toBe(0)
    expect(roomSourceSlideToRenderedSection(sections, [flow('Missing', 0)], 1)).toBe(1)
    expect(roomRenderedSectionToSourceSlide(sections, [flow('Missing', 0)], 1)).toBe(1)
  })
})
