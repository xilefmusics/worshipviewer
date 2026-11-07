import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useMessageRoom } from '@/lib/use-message-room'
import type { MessageRoomCredentials, RoomMessage } from '@/lib/room-message-api'

const api = vi.hoisted(() => ({
  fetchReplay: vi.fn(),
  join: vi.fn(),
}))

vi.mock('@/lib/room-message-api', () => ({
  fetchMessageRoomReplay: api.fetchReplay,
  joinMessageRoom: api.join,
}))

const sockets: FakeWebSocket[] = []

class FakeWebSocket {
  static OPEN = 1
  static CLOSED = 3

  readonly url: string
  readyState = 0
  sent: string[] = []
  onopen: ((event: Event) => void) | null = null
  onmessage: ((event: MessageEvent) => void) | null = null
  onerror: ((event: Event) => void) | null = null
  onclose: ((event: CloseEvent) => void) | null = null

  constructor(url: string) {
    this.url = url
    sockets.push(this)
  }

  send(value: string) {
    this.sent.push(value)
  }

  close() {
    this.readyState = FakeWebSocket.CLOSED
    this.onclose?.({} as CloseEvent)
  }

  open() {
    this.readyState = FakeWebSocket.OPEN
    this.onopen?.({} as Event)
  }

  async message(data: string) {
    await this.onmessage?.({ data } as MessageEvent)
  }
}

const credentials: MessageRoomCredentials = {
  room_id: 'room-1',
  visit_id: 'visit-1',
  resume_credential: 'resume-secret',
  connection_ticket: 'ticket-secret',
  mode: 'sheet',
}

const room = {
  items: [{ song: { data: { sections: [{ title: 'Verse' }] } } }],
  toc: [],
} as unknown as import('@/lib/room-message-api').RoomContent

function message(sequence: number, change: RoomMessage['change']): RoomMessage {
  return {
    id: `message-${sequence}`,
    room_id: 'room-1',
    visit_id: 'visit-1',
    order: { epoch: 1, sequence },
    change,
  }
}

const replayResponse = {
  room,
  room_name: 'Room One',
  boundary: { epoch: 1, sequence: 2 },
  history: [
    message(1, { type: 'vote', song: 0, voted: true }),
    message(2, { type: 'selection', song: 0, slide: 0, activate: false }),
  ],
}

beforeEach(() => {
  sockets.length = 0
  api.fetchReplay.mockReset().mockResolvedValue(replayResponse)
  api.join.mockReset().mockResolvedValue({ ...credentials, connection_ticket: 'rotated-ticket' })
  vi.stubGlobal('WebSocket', FakeWebSocket)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('useMessageRoom', () => {
  it('replays before ready, applies ordered server echoes and records presence without secrets', async () => {
    let finishReplay: ((value: typeof replayResponse) => void) | undefined
    api.fetchReplay.mockImplementation(() => new Promise((resolve) => { finishReplay = resolve }))
    const { result } = renderHook(() => useMessageRoom('room-1', credentials))
    await waitFor(() => expect(sockets).toHaveLength(1))

    const socket = sockets[0]!
    act(() => socket.open())
    expect(JSON.parse(socket.sent[0]!)).toEqual({ type: 'authenticate', ticket: 'ticket-secret' })

    let authorization: Promise<void> | undefined
    await act(async () => {
      authorization = socket.message(JSON.stringify({
        type: 'authorized',
        room_id: 'room-1',
        boundary: { epoch: 1, sequence: 2 },
        members: [{ visit_id: 'visit-1', display_name: 'Alex' }],
      }))
      await Promise.resolve()
    })
    expect(result.current.status).toBe('replaying')
    expect(api.fetchReplay).toHaveBeenCalledWith('room-1', credentials, { epoch: 1, sequence: 2 })

    const live = message(3, { type: 'selection', song: 0, slide: 0, activate: true })
    await act(async () => socket.message(JSON.stringify({ type: 'change', message: live })))
    expect(result.current.replay).toBeNull()

    await act(async () => {
      finishReplay?.(replayResponse)
      await authorization
    })
    await waitFor(() => expect(result.current.status).toBe('connected'))
    expect(result.current.roomName).toBe('Room One')
    expect(result.current.replay?.lastOrder).toEqual({ epoch: 1, sequence: 2 })
    expect(socket.sent.map((entry) => JSON.parse(entry))).toContainEqual({ type: 'history_ready' })

    await act(async () => socket.message(JSON.stringify({ type: 'change', message: live })))
    expect(result.current.replay?.selection).toEqual({ song: 0, slide: 0 })
    expect(result.current.replay?.songs[0]?.played).toBe(true)
    await act(async () => socket.message(JSON.stringify({
      type: 'presence',
      members: [
        { visit_id: 'visit-1', display_name: 'Alex' },
        { visit_id: 'visit-2', display_name: 'Sam' },
      ],
    })))

    expect(result.current.members).toHaveLength(2)
    expect(result.current.debugLog.entries.map((entry) => entry.source)).toEqual([
      'replay', 'replay', 'live', 'presence',
    ])
    const debugJson = JSON.stringify(result.current.debugLog)
    expect(debugJson).not.toContain('resume-secret')
    expect(debugJson).not.toContain('ticket-secret')
  })

  it('resumes the same visit with a rotated ticket after a socket interruption', async () => {
    const { result } = renderHook(() => useMessageRoom('room-1', credentials))
    await waitFor(() => expect(sockets).toHaveLength(1))
    const firstSocket = sockets[0]!
    act(() => firstSocket.close())

    await waitFor(() => expect(sockets).toHaveLength(2), { timeout: 2_000 })
    expect(api.join).toHaveBeenCalledWith('room-1', 'sheet', false, 'resume-secret')
    act(() => sockets[1]!.open())
    expect(JSON.parse(sockets[1]!.sent[0]!)).toEqual({ type: 'authenticate', ticket: 'rotated-ticket' })
    expect(result.current.status).toBe('reconnecting')
  })
})
