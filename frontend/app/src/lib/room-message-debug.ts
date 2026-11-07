import type { RoomMember, RoomMessage } from '@/lib/room-message-api'

export type RoomDebugEntry = {
  source: 'replay' | 'live' | 'presence'
  event: RoomMessage | { type: 'presence'; members: RoomMember[] }
}

export type RoomDebugLog = { room_id: string; entries: RoomDebugEntry[]; truncated: boolean }

export const MAX_DEBUG_ENTRIES = 1000
export const MAX_DEBUG_BYTES = 512 * 1024

export function createRoomDebugLog(roomId: string): RoomDebugLog {
  return { room_id: roomId, entries: [], truncated: false }
}

export function appendRoomDebugEntry(log: RoomDebugLog, entry: RoomDebugEntry): RoomDebugLog {
  const entries = [...log.entries, entry]
  let truncated = log.truncated
  while (entries.length > MAX_DEBUG_ENTRIES || new TextEncoder().encode(JSON.stringify(entries)).byteLength > MAX_DEBUG_BYTES) {
    entries.shift()
    truncated = true
  }
  return { ...log, entries, truncated }
}

/** The viewer and download use this same bounded, credential-free session log. */
export function serializeRoomDebugLog(log: RoomDebugLog): string {
  return JSON.stringify(log, null, 2)
}
