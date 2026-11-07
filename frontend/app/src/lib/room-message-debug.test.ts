import { describe, expect, it } from 'vitest'

import type { RoomMessage } from '@/lib/room-message-api'
import {
  MAX_DEBUG_ENTRIES,
  appendRoomDebugEntry,
  createRoomDebugLog,
  serializeRoomDebugLog,
} from '@/lib/room-message-debug'

function message(sequence: number): RoomMessage {
  return {
    id: `message-${sequence}`,
    room_id: 'room-1',
    visit_id: 'visit-1',
    order: { epoch: 4, sequence },
    change: { type: 'vote', song: 1, voted: true },
  }
}

describe('room message diagnostics', () => {
  it('keeps replay and live source metadata and exports the same bounded log', () => {
    let log = createRoomDebugLog('room-1')
    log = appendRoomDebugEntry(log, { source: 'replay', event: message(1) })
    log = appendRoomDebugEntry(log, { source: 'live', event: message(2) })

    const json = serializeRoomDebugLog(log)
    expect(log.entries.map((entry) => [entry.source, 'order' in entry.event ? entry.event.order.sequence : null])).toEqual([
      ['replay', 1],
      ['live', 2],
    ])
    expect(JSON.parse(json)).toEqual(log)
    expect(json).not.toContain('resume_credential')
    expect(json).not.toContain('connection_ticket')
  })

  it('marks and bounds truncation by entry count and byte size', () => {
    let log = createRoomDebugLog('room-1')
    for (let sequence = 1; sequence <= MAX_DEBUG_ENTRIES + 1; sequence += 1) {
      log = appendRoomDebugEntry(log, { source: 'live', event: message(sequence) })
    }

    expect(log.entries).toHaveLength(MAX_DEBUG_ENTRIES)
    const first = log.entries[0]?.event
    expect(first && 'id' in first ? first.id : null).toBe('message-2')
    expect(log.truncated).toBe(true)
    expect(JSON.parse(serializeRoomDebugLog(log)).truncated).toBe(true)

    const oversized = appendRoomDebugEntry(createRoomDebugLog('room-2'), {
      source: 'presence',
      event: { type: 'presence', members: [{ visit_id: 'v', display_name: 'x'.repeat(600_000) }] },
    })
    expect(oversized.entries).toHaveLength(0)
    expect(oversized.truncated).toBe(true)
  })

  it('starts each new room session with an empty log', () => {
    const prior = appendRoomDebugEntry(createRoomDebugLog('room-1'), { source: 'live', event: message(1) })
    const next = createRoomDebugLog('room-1')

    expect(prior.entries).toHaveLength(1)
    expect(next).toEqual({ room_id: 'room-1', entries: [], truncated: false })
  })
})
