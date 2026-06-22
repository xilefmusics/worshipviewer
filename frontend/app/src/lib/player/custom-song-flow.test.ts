import { describe, expect, it } from 'vitest'

import type { components } from '@/api/schema'

import {
  buildDefaultFlowSlots,
  buildFlowSourcePool,
  resolveSongDataForCustomFlow,
  resolveSongForBookRendering,
} from '@/lib/player/custom-song-flow'

type SongData = components['schemas']['SongDataSchema']

function makeSongData(): SongData {
  return {
    titles: ['Flow Song'],
    sections: [
      { title: 'Verse', lines: [{ parts: [{ comment: false, languages: ['Verse 1'] }] }], repeat_count: 4 },
      { title: 'Verse', lines: [{ parts: [{ comment: false, languages: ['Verse 2'] }] }], repeat_count: 2 },
      { title: 'Marker', lines: [{ parts: [{ comment: true, languages: ['Ignored'] }] }] },
      { title: 'Chorus', lines: [{ parts: [{ comment: false, languages: ['Chorus 1'] }] }], repeat_count: 3 },
      { title: 'Chorus', lines: [{ parts: [{ comment: false, languages: ['Chorus 2'] }] }], repeat_count: 2 },
    ],
  } as SongData
}

describe('buildFlowSourcePool', () => {
  it('includes content sections and labels duplicate titles with suffixes', () => {
    expect(buildFlowSourcePool(makeSongData()).map((entry) => entry.label)).toEqual([
      'Verse',
      'Verse [2]',
      'Chorus',
      'Chorus [2]',
    ])
  })
})

describe('buildDefaultFlowSlots', () => {
  it('keeps empty repeated markers in the default flow while preserving content order', () => {
    const songData = {
      titles: ['Ohne Titel'],
      sections: [
        { title: 'Tag 1', lines: [{ parts: [{ comment: false, languages: ['Text 1'] }] }] },
        { title: 'Tag 2', lines: [{ parts: [{ comment: false, languages: ['Text 2'] }] }] },
        { title: 'Tag 3', lines: [{ parts: [{ comment: false, languages: ['Text 3'] }] }] },
        { title: 'Tag 1', lines: [{ parts: [] }] },
        { title: 'Tag 2', lines: [{ parts: [] }] },
        { title: 'Tag 3', lines: [{ parts: [] }] },
      ],
    } as SongData

    expect(
      buildDefaultFlowSlots(songData).map((slot) => ({
        section_title: slot.section_title,
        occurrence_index: slot.occurrence_index,
        repeat_count: slot.repeat_count,
      })),
    ).toEqual([
      { section_title: 'Tag 1', occurrence_index: 0, repeat_count: 1 },
      { section_title: 'Tag 2', occurrence_index: 0, repeat_count: 1 },
      { section_title: 'Tag 3', occurrence_index: 0, repeat_count: 1 },
      { section_title: 'Tag 1', occurrence_index: 1, repeat_count: 1 },
      { section_title: 'Tag 2', occurrence_index: 1, repeat_count: 1 },
      { section_title: 'Tag 3', occurrence_index: 1, repeat_count: 1 },
    ])
  })
})

describe('resolveSongDataForCustomFlow', () => {
  it('reorders sections, uses zero-based occurrences, and overrides repeat counts', () => {
    const songData = makeSongData()
    const resolved = resolveSongDataForCustomFlow(songData, [
      { section_title: 'Verse', occurrence_index: 1, repeat_count: 1 },
      { section_title: 'Chorus', occurrence_index: 0, repeat_count: 2 },
      { section_title: 'Chorus', occurrence_index: 1, repeat_count: 3 },
    ])

    expect(resolved.sections?.map((section) => section.title)).toEqual(['Verse', 'Chorus', 'Chorus'])
    expect(resolved.sections?.map((section) => section.repeat_count)).toEqual([1, 2, 3])
    expect(resolved.sections?.[0]?.lines?.[0]?.parts?.[0]?.languages).toEqual(['Verse 2'])
  })

  it('keeps repeated markers empty when the selected source occurrence is empty', () => {
    const songData = {
      titles: ['Ohne Titel'],
      sections: [
        { title: 'Tag 1', lines: [{ parts: [{ comment: false, languages: ['Text 1'] }] }] },
        { title: 'Tag 2', lines: [{ parts: [{ comment: false, languages: ['Text 2'] }] }] },
        { title: 'Tag 3', lines: [{ parts: [{ comment: false, languages: ['Text 3'] }] }] },
        { title: 'Tag 1', lines: [{ parts: [] }] },
        { title: 'Tag 2', lines: [{ parts: [] }] },
        { title: 'Tag 3', lines: [{ parts: [] }] },
      ],
    } as SongData

    const resolved = resolveSongDataForCustomFlow(songData, [
      { section_title: 'Tag 1', occurrence_index: 0, repeat_count: 1 },
      { section_title: 'Tag 2', occurrence_index: 0, repeat_count: 1 },
      { section_title: 'Tag 3', occurrence_index: 0, repeat_count: 1 },
      { section_title: 'Tag 1', occurrence_index: 1, repeat_count: 1 },
      { section_title: 'Tag 2', occurrence_index: 1, repeat_count: 1 },
      { section_title: 'Tag 3', occurrence_index: 1, repeat_count: 1 },
    ])

    expect(resolved.sections?.map((section) => section.title)).toEqual([
      'Tag 1',
      'Tag 2',
      'Tag 3',
      'Tag 1',
      'Tag 2',
      'Tag 3',
    ])
    expect(resolved.sections?.[3]?.lines?.[0]?.parts).toEqual([])
    expect(resolved.sections?.[4]?.lines?.[0]?.parts).toEqual([])
    expect(resolved.sections?.[5]?.lines?.[0]?.parts).toEqual([])
  })

  it('falls back atomically when any slot is invalid', () => {
    const songData = makeSongData()
    const resolved = resolveSongDataForCustomFlow(songData, [
      { section_title: 'Verse', occurrence_index: 0, repeat_count: 1 },
      { section_title: 'Missing', occurrence_index: 0, repeat_count: 1 },
    ])

    expect(resolved).toBe(songData)
  })
})

describe('resolveSongForBookRendering', () => {
  it('keeps default Book rendering unchanged when flow is null, keeps repeated slots empty when fill is off, and fills them when it is on', () => {
    const song = {
      id: 'song-1',
      data: {
        titles: ['Flow Song'],
        sections: [
          { title: 'Verse', lines: [{ parts: [{ comment: false, languages: ['Verse 1'] }] }] },
          { title: 'Chorus', lines: [{ parts: [{ comment: false, languages: ['Chorus 1'] }] }] },
          { title: 'Verse', lines: [{ parts: [{ comment: false, languages: ['Verse 2'] }] }] },
          { title: 'Chorus', lines: [{ parts: [{ comment: false, languages: ['Chorus 2'] }] }] },
        ],
      },
    } as components['schemas']['Song']

    expect(resolveSongForBookRendering(song, null, false)).toBe(song)

    const unfilled = resolveSongForBookRendering(
      song,
      [
        { section_title: 'Verse', occurrence_index: 0, repeat_count: 1 },
        { section_title: 'Chorus', occurrence_index: 0, repeat_count: 1 },
        { section_title: 'Verse', occurrence_index: 1, repeat_count: 1 },
        { section_title: 'Chorus', occurrence_index: 1, repeat_count: 1 },
      ],
      false,
    )

    expect(unfilled).not.toBe(song)
    expect(unfilled.data.sections?.map((section) => section.title)).toEqual([
      'Verse',
      'Chorus',
      'Verse',
      'Chorus',
    ])
    expect(unfilled.data.sections?.[0]?.lines?.[0]?.parts?.[0]?.languages).toEqual(['Verse 1'])
    expect(unfilled.data.sections?.[1]?.lines?.[0]?.parts?.[0]?.languages).toEqual(['Chorus 1'])
    expect(unfilled.data.sections?.[2]?.lines?.length).toBe(0)
    expect(unfilled.data.sections?.[3]?.lines?.length).toBe(0)

    const emptyRepeatSong = {
      id: 'song-2',
      data: {
        titles: ['Flow Song'],
        sections: [
          { title: 'Verse', lines: [{ parts: [{ comment: false, languages: ['Verse 1'] }] }] },
          { title: 'Chorus', lines: [{ parts: [{ comment: false, languages: ['Chorus 1'] }] }] },
          { title: 'Verse', lines: [{ parts: [] }] },
          { title: 'Chorus', lines: [{ parts: [] }] },
        ],
      },
    } as components['schemas']['Song']

    const filled = resolveSongForBookRendering(
      emptyRepeatSong,
      [
        { section_title: 'Verse', occurrence_index: 0, repeat_count: 1 },
        { section_title: 'Chorus', occurrence_index: 0, repeat_count: 1 },
        { section_title: 'Verse', occurrence_index: 1, repeat_count: 1 },
        { section_title: 'Chorus', occurrence_index: 1, repeat_count: 1 },
      ],
      true,
    )

    expect(filled).not.toBe(emptyRepeatSong)
    expect(filled.data.sections?.map((section) => section.title)).toEqual([
      'Verse',
      'Chorus',
      'Verse',
      'Chorus',
    ])
    expect(filled.data.sections?.[2]?.lines?.[0]?.parts?.[0]?.languages).toEqual(['Verse 1'])
    expect(filled.data.sections?.[3]?.lines?.[0]?.parts?.[0]?.languages).toEqual(['Chorus 1'])
  })
})
