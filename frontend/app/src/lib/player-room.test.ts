import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  playerFromRoom,
  playerRoomShortName,
  readRoomCredentials,
  redactPlayerRoomEvent,
  saveRoomCredentials,
  type PlayerRoomSnapshot,
} from '@/lib/player-room'

function createSessionStorageMock(): Storage {
  const store = new Map<string, string>()
  return {
    get length() {
      return store.size
    },
    clear: () => {
      store.clear()
    },
    getItem: (key: string) => store.get(key) ?? null,
    key: (index: number) => [...store.keys()][index] ?? null,
    removeItem: (key: string) => {
      store.delete(key)
    },
    setItem: (key: string, value: string) => {
      store.set(key, value)
    },
  }
}

const sessionStorageMock = createSessionStorageMock()
vi.stubGlobal('sessionStorage', sessionStorageMock)

beforeEach(() => sessionStorageMock.clear())

afterAll(() => {
  vi.unstubAllGlobals()
})

describe('player rooms', () => {
  it('uses source title as the short room display name', () => {
    expect(
      playerRoomShortName({
        source_title: 'Sunday Setlist',
      } as Parameters<typeof playerRoomShortName>[0]),
    ).toBe('Sunday Setlist')
  })

  it('keeps participant credentials scoped by room', () => {
    const credentials = { room_id: 'r1', participant_id: 'p1', mode: 'sheet' as const, resume_credential: 'resume', connection_ticket: 'ticket' }
    saveRoomCredentials(credentials)
    expect(readRoomCredentials('r1')).toEqual(credentials)
    expect(readRoomCredentials('r2')).toBeNull()
  })

  it('adapts content snapshots without importing host layout state', () => {
    const snapshot = { id: 'r1', name: 'Room', team_id: 't1', source_type: 'song', source_id: 's1', source_title: 'Song', host_email: 'h@example.com', participant_count: 1, av_occupied: false, created_at: new Date().toISOString(), content: { items: [{ type: 'blob', blob_id: 'b1' }], toc: [] }, musical_state: { item_index: 0, language: null, transposition: null }, projection: null, participants: [], revision: 1, host_lease_expires_at: new Date().toISOString() } as PlayerRoomSnapshot
    expect(playerFromRoom(snapshot)).toMatchObject({ index: 0, scroll_type: 'one_page', orientation: 'portrait', items: snapshot.content.items })
  })

  it('redacts credentials from room event diagnostics', () => {
    expect(redactPlayerRoomEvent({
      type: 'authenticate',
      ticket: 'connection-ticket',
      nested: { resume_credential: 'resume-secret', inviteSecret: 'invite-secret' },
    })).toEqual({
      type: 'authenticate',
      ticket: '[redacted]',
      nested: { resume_credential: '[redacted]', inviteSecret: '[redacted]' },
    })
  })
})
