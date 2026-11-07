import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  clearMessageRoomCredentials,
  fetchMessageRoomReplay,
  joinMessageRoom,
  readMessageRoomCredentials,
  roomDebugOptionsEnabled,
  saveMessageRoomCredentials,
  setRoomDebugOptionsEnabled,
} from '@/lib/room-message-api'

const credentials = {
  room_id: 'room-1',
  visit_id: 'visit-1',
  resume_credential: 'resume-secret',
  connection_ticket: 'ticket-secret',
}

const localStorageState = new Map<string, string>()
const localStorageMock = {
  getItem: (key: string) => localStorageState.get(key) ?? null,
  setItem: (key: string, value: string) => localStorageState.set(key, value),
  removeItem: (key: string) => localStorageState.delete(key),
  clear: () => localStorageState.clear(),
}

beforeEach(() => {
  localStorageState.clear()
  vi.stubGlobal('localStorage', localStorageMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
  sessionStorage.clear()
})

describe('message room API credentials', () => {
  it('stores the resume secret but never the one-use connection ticket', () => {
    saveMessageRoomCredentials({ ...credentials, mode: 'sheet' })

    expect(readMessageRoomCredentials('room-1')).toEqual({
      room_id: 'room-1',
      visit_id: 'visit-1',
      resume_credential: 'resume-secret',
      mode: 'sheet',
    })
    expect(sessionStorage.getItem('message-room:room-1:credentials')).not.toContain('ticket-secret')
    clearMessageRoomCredentials('room-1')
    expect(readMessageRoomCredentials('room-1')).toBeNull()
  })

  it('creates a new visit without a resume token and rotates a ticket when resuming', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(credentials), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ...credentials, visit_id: 'visit-1', connection_ticket: 'next-ticket' }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const created = await joinMessageRoom('room-1', 'sheet', true)
    expect(JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string)).toEqual({ resume_credential: null })
    expect(created.visit_id).toBe('visit-1')

    clearMessageRoomCredentials('room-1')
    await joinMessageRoom('room-1', 'av', false, 'resume-secret')
    expect(JSON.parse(fetchMock.mock.calls[1]?.[1]?.body as string)).toEqual({ resume_credential: 'resume-secret' })
    expect(readMessageRoomCredentials('room-1')?.mode).toBe('av')
  })

  it('sends resume credentials only in the history header, never in its URL', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ room: {}, room_name: 'Room', history: [], boundary: { epoch: 2, sequence: 3 } }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await fetchMessageRoomReplay('room-1', { ...credentials, mode: 'sheet' }, { epoch: 2, sequence: 3 })

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('epoch=2&sequence=3')
    expect(url).not.toContain('resume-secret')
    expect(new Headers(init.headers).get('x-room-resume')).toBe('resume-secret')
  })

  it('stores the local diagnostics option without involving room APIs', () => {
    expect(roomDebugOptionsEnabled()).toBe(false)
    setRoomDebugOptionsEnabled(true)
    expect(roomDebugOptionsEnabled()).toBe(true)
    expect(localStorage.getItem('room:debug-options')).toBe('true')
  })
})
