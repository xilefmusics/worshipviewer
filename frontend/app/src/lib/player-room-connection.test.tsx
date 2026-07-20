import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { usePlayerRoom } from '@/lib/player-room'

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('player room connection', () => {
  it('ignores a close event from a disposed socket generation', () => {
    vi.useFakeTimers()
    class MockWebSocket {
      static readonly OPEN = 1
      static instances: MockWebSocket[] = []

      readyState = 0
      onopen: (() => void) | null = null
      onmessage: ((event: MessageEvent) => void) | null = null
      onerror: (() => void) | null = null
      onclose: ((event: CloseEvent) => void) | null = null
      send = vi.fn()
      close = vi.fn()

      constructor() {
        MockWebSocket.instances.push(this)
      }
    }
    vi.stubGlobal('WebSocket', MockWebSocket)
    const firstCredentials = {
      room_id: 'r1',
      participant_id: 'p1',
      mode: 'sheet' as const,
      resume_credential: 'resume-1',
      connection_ticket: 'ticket-1',
    }
    const { rerender, unmount } = renderHook(
      ({ value }) => usePlayerRoom(value),
      { initialProps: { value: firstCredentials } },
    )
    const disposedSocket = MockWebSocket.instances[0]

    rerender({
      value: {
        ...firstCredentials,
        room_id: 'r2',
        resume_credential: 'resume-2',
        connection_ticket: 'ticket-2',
      },
    })
    disposedSocket.onclose?.({
      code: 1006,
      reason: '',
      wasClean: false,
    } as CloseEvent)

    expect(MockWebSocket.instances).toHaveLength(2)
    expect(vi.getTimerCount()).toBe(0)
    unmount()
  })

  it('keeps the socket open when equivalent credentials are recreated', () => {
    vi.useFakeTimers()
    class MockWebSocket {
      static readonly OPEN = 1
      static instances: MockWebSocket[] = []

      readyState = 0
      onopen: (() => void) | null = null
      onmessage: ((event: MessageEvent) => void) | null = null
      onerror: (() => void) | null = null
      onclose: ((event: CloseEvent) => void) | null = null
      send = vi.fn()
      close = vi.fn()

      constructor() {
        MockWebSocket.instances.push(this)
      }
    }
    vi.stubGlobal('WebSocket', MockWebSocket)
    const credentials = {
      room_id: 'r1',
      participant_id: 'p1',
      mode: 'sheet' as const,
      resume_credential: 'resume',
      connection_ticket: 'ticket',
    }
    const { rerender, unmount } = renderHook(
      ({ value }) => usePlayerRoom(value),
      { initialProps: { value: credentials } },
    )
    const socket = MockWebSocket.instances[0]

    rerender({ value: { ...credentials } })

    expect(MockWebSocket.instances).toHaveLength(1)
    expect(socket.close).not.toHaveBeenCalled()
    unmount()
  })

  it('sends the latest queued musical state after the room socket opens', () => {
    vi.useFakeTimers()
    class MockWebSocket {
      static readonly OPEN = 1
      static instances: MockWebSocket[] = []

      readyState = 0
      onopen: (() => void) | null = null
      onmessage: ((event: MessageEvent) => void) | null = null
      onerror: (() => void) | null = null
      onclose: ((event: CloseEvent) => void) | null = null
      send = vi.fn()
      close = vi.fn()

      constructor() {
        MockWebSocket.instances.push(this)
      }
    }
    vi.stubGlobal('WebSocket', MockWebSocket)

    const credentials = {
      room_id: 'r1',
      participant_id: 'p1',
      mode: 'sheet' as const,
      resume_credential: 'resume',
      connection_ticket: 'ticket',
    }
    const { result, unmount } = renderHook(() => usePlayerRoom(credentials))
    const socket = MockWebSocket.instances[0]

    act(() => {
      result.current.sendMusicalState({ item_index: 1, language: null, transposition: null })
      result.current.sendMusicalState({ item_index: 2, language: null, transposition: null })
      socket.readyState = MockWebSocket.OPEN
      socket.onopen?.()
    })

    expect(socket.send).toHaveBeenCalledTimes(2)
    expect(JSON.parse(socket.send.mock.calls[0][0] as string)).toEqual({
      type: 'authenticate',
      ticket: 'ticket',
    })
    expect(JSON.parse(socket.send.mock.calls[1][0] as string)).toMatchObject({
      type: 'update_musical_state',
      musical_state: { item_index: 2, language: null, transposition: null },
    })
    unmount()
  })
})
