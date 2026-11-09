import { describe, expect, it } from 'vitest'
import { applyRoomMessage, createRoomReplay, rankRoomSongs, type RoomMessage } from './room-message'
import type { RoomAvConfiguration } from './room-message-api'

function message(sequence: number, visit_id: string, change: RoomMessage['change']): RoomMessage {
  return { id: `${sequence}`, room_id: 'room', visit_id, order: { epoch: 1, sequence }, change }
}

function avConfiguration(): RoomAvConfiguration {
  return {
    content_layer: {
      max_lines_per_slide: 4,
      balance_slide_lines: true,
      font_size: 50,
      text_align: 'center',
      vertical_align: 'center',
      horizontal_align: 'center',
      text_shadow: 'subtle',
      text_transform: 'none',
      primary_text_lightness: 100,
      secondary_text_lightness: 80,
    },
    transition: { style: 'fade', duration_ms: 300 },
    bilingual_enabled: true,
    collapse_lyric_whitespace: false,
    language_by_item: { '0': 1 },
    screen_state: 'live',
  }
}

describe('room message replay', () => {
  it('keeps one ranked entry per song and retains votes per visit', () => {
    let state = createRoomReplay('room', [2, 1, 1])
    const messages: RoomMessage[] = [
      message(1, 'a', { type: 'selection', song: 0, section: 1, slide: 1, activate: true }),
      message(2, 'a', { type: 'vote', song: 0, voted: true }),
      message(3, 'b', { type: 'vote', song: 0, voted: true }),
      message(4, 'a', { type: 'vote', song: 0, voted: false }),
    ]
    for (const entry of messages) state = applyRoomMessage(state, entry)
    expect(state.selection).toEqual({ song: 0, section: 1, slide: 1 })
    expect(state.songs[0].voters.size).toBe(1)
    expect(state.songs[0].played).toBe(false)
    expect(rankRoomSongs(state)).toEqual([0, 1, 2])
    state = applyRoomMessage(state, message(5, 'a', { type: 'selection', song: 0, section: 0, slide: 0, activate: true }))
    expect(state.songs[0].voters.size).toBe(0)
    expect(rankRoomSongs(state)).toEqual([1, 2, 0])
  })

  it('accepts gaps and identical retries, but rejects conflicts and invalid references', () => {
    const first = message(1, 'a', { type: 'vote', song: 0, voted: true })
    let state = applyRoomMessage(createRoomReplay('room', [1]), first)
    state = applyRoomMessage(state, message(3, 'a', { type: 'selection', song: 0, section: 0, slide: 0, activate: false }))
    expect(applyRoomMessage(state, first)).toBe(state)
    expect(() => applyRoomMessage(state, { ...first, visit_id: 'b' })).toThrow('Conflicting')
    expect(() => applyRoomMessage(state, message(2, 'a', { type: 'vote', song: 0, voted: false }))).toThrow('order')
    expect(() => applyRoomMessage(state, message(4, 'a', { type: 'selection', song: 0, section: 1, slide: 0, activate: true }))).toThrow('section')
  })

  it('replays the latest shared AV background independently of song state', () => {
    const change = {
      type: 'set_background' as const,
      background: { preset: 2, image: { media_id: 'media:one', asset_id: 'asset:one' } },
    }
    const first = message(1, 'a', change)
    const state = applyRoomMessage(createRoomReplay('room', [1]), first)

    expect(state.background).toEqual(change.background)
    expect(state.selection).toBeNull()
    expect(state.songs[0]?.played).toBe(false)
    expect(applyRoomMessage(state, first)).toBe(state)
    expect(() => applyRoomMessage(state, message(2, 'a', {
      type: 'set_background',
      background: { preset: 5 },
    }))).toThrow('background')
  })

  it('replays the shared AV configuration and validates its screen state and layout', () => {
    const configuration = avConfiguration()
    const first = message(1, 'host', { type: 'set_av_configuration', configuration })
    const state = applyRoomMessage(createRoomReplay('room', [1]), first)

    expect(state.avConfiguration).toEqual(configuration)
    expect(applyRoomMessage(state, first)).toBe(state)
    expect(() => applyRoomMessage(state, message(2, 'host', {
      type: 'set_av_configuration',
      configuration: { ...configuration, content_layer: { ...configuration.content_layer, max_lines_per_slide: 0 } },
    }))).toThrow('AV configuration')

    const blackout = { ...configuration, screen_state: 'blackout' as const }
    const updated = applyRoomMessage(state, message(2, 'host', { type: 'set_av_configuration', configuration: blackout }))
    expect(updated.avConfiguration?.screen_state).toBe('blackout')
  })
})
