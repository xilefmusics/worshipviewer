import { describe, expect, it } from 'vitest'
import { applyRoomMessage, createRoomReplay, rankRoomSongs, type RoomMessage } from './room-message'

function message(sequence: number, visit_id: string, change: RoomMessage['change']): RoomMessage {
  return { id: `${sequence}`, room_id: 'room', visit_id, order: { epoch: 1, sequence }, change }
}

describe('room message replay', () => {
  it('keeps one ranked entry per song and retains votes per visit', () => {
    let state = createRoomReplay('room', [2, 1, 1])
    const messages: RoomMessage[] = [
      message(1, 'a', { type: 'selection', song: 0, slide: 1, activate: true }),
      message(2, 'a', { type: 'vote', song: 0, voted: true }),
      message(3, 'b', { type: 'vote', song: 0, voted: true }),
      message(4, 'a', { type: 'vote', song: 0, voted: false }),
    ]
    for (const entry of messages) state = applyRoomMessage(state, entry)
    expect(state.selection).toEqual({ song: 0, slide: 1 })
    expect(state.songs[0].voters.size).toBe(1)
    expect(state.songs[0].played).toBe(false)
    expect(rankRoomSongs(state)).toEqual([0, 1, 2])
    state = applyRoomMessage(state, message(5, 'a', { type: 'selection', song: 0, slide: 0, activate: true }))
    expect(state.songs[0].voters.size).toBe(0)
    expect(rankRoomSongs(state)).toEqual([1, 2, 0])
  })

  it('accepts gaps and identical retries, but rejects conflicts and invalid references', () => {
    const first = message(1, 'a', { type: 'vote', song: 0, voted: true })
    let state = applyRoomMessage(createRoomReplay('room', [1]), first)
    state = applyRoomMessage(state, message(3, 'a', { type: 'selection', song: 0, slide: 0, activate: false }))
    expect(applyRoomMessage(state, first)).toBe(state)
    expect(() => applyRoomMessage(state, { ...first, visit_id: 'b' })).toThrow('Conflicting')
    expect(() => applyRoomMessage(state, message(2, 'a', { type: 'vote', song: 0, voted: false }))).toThrow('order')
    expect(() => applyRoomMessage(state, message(4, 'a', { type: 'selection', song: 0, slide: 1, activate: true }))).toThrow('slide')
  })
})
