import type { RoomMember, RoomMessage } from '@/lib/room-message-api'

export type RoomDebugEntry = {
  source: 'replay' | 'live' | 'presence'
  event: RoomMessage | { type: 'presence'; members: RoomMember[] }
  recorded_at: string
}

export type RoomDebugEntryInput = Omit<RoomDebugEntry, 'recorded_at'>

export type RoomDebugLog = { room_id: string; entries: RoomDebugEntry[]; truncated: boolean }

export const MAX_DEBUG_ENTRIES = 1000
export const MAX_DEBUG_BYTES = 512 * 1024

export function createRoomDebugLog(roomId: string): RoomDebugLog {
  return { room_id: roomId, entries: [], truncated: false }
}

export function appendRoomDebugEntry(
  log: RoomDebugLog,
  entry: RoomDebugEntryInput,
  recordedAt = new Date().toISOString(),
): RoomDebugLog {
  const entries = [...log.entries, { ...entry, recorded_at: recordedAt }]
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
