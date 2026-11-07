import { useCallback, useEffect, useRef, useState } from 'react'

import { applyRoomMessage, createRoomReplay, type RoomReplay } from '@/lib/room-message'
import {
  appendRoomDebugEntry,
  createRoomDebugLog,
  type RoomDebugLog,
  type RoomDebugEntryInput,
} from '@/lib/room-message-debug'
import {
  fetchMessageRoomReplay,
  joinMessageRoom,
  type MessageRoomCredentials,
  type MessageRoomOrder,
  type RoomContent,
  type RoomMember,
  type RoomMessage,
} from '@/lib/room-message-api'

type RoomStatus = 'joining' | 'connecting' | 'replaying' | 'connected' | 'reconnecting' | 'failed' | 'ended'
type RoomServerEvent =
  | { type: 'authorized'; room_id: string; boundary: MessageRoomOrder; members: RoomMember[] }
  | { type: 'change'; message: RoomMessage }
  | { type: 'presence'; members: RoomMember[] }
  | { type: 'error'; code: string }

function apiWebSocketUrl(): string {
  const base = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '') || window.location.origin
  const url = new URL('/api/v1/rooms/ws', base)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  return url.toString()
}

export function useMessageRoom(roomId: string, credentials: MessageRoomCredentials | null) {
  const [content, setContent] = useState<RoomContent | null>(null)
  const [roomName, setRoomName] = useState<string>('')
  const [roomCreatedAt, setRoomCreatedAt] = useState<string | null>(null)
  const [replay, setReplay] = useState<RoomReplay | null>(null)
  const [members, setMembers] = useState<RoomMember[]>([])
  const [status, setStatus] = useState<RoomStatus>('joining')
  const [error, setError] = useState<string | null>(null)
  const [debugLog, setDebugLog] = useState<RoomDebugLog>(() => createRoomDebugLog(roomId))
  const socketRef = useRef<WebSocket | null>(null)
  const replayRef = useRef<RoomReplay | null>(null)
  const debugLogRef = useRef(debugLog)

  const appendDebug = useCallback((entry: RoomDebugEntryInput) => {
    const next = appendRoomDebugEntry(debugLogRef.current, entry)
    debugLogRef.current = next
    setDebugLog(next)
  }, [])

  useEffect(() => {
    let disposed = false
    let reconnectTimer: number | undefined
    let retryCount = 0
    let stopReconnect = false
    let liveCredentials = credentials
    replayRef.current = null
    debugLogRef.current = createRoomDebugLog(roomId)
    queueMicrotask(() => {
      if (disposed) return
      setContent(null)
      setRoomName('')
      setRoomCreatedAt(null)
      setReplay(null)
      setMembers([])
      setError(null)
      setDebugLog(debugLogRef.current)
    })
    if (!credentials) {
      queueMicrotask(() => { if (!disposed) setStatus('joining') })
      return () => { disposed = true }
    }

    const scheduleReconnect = (code?: string) => {
      if (disposed || stopReconnect) return
      if (code === 'room_deleted') {
        stopReconnect = true
        setError(code)
        setStatus('ended')
        return
      }
      if (code === 'unauthorized' || code === 'room_unavailable') {
        stopReconnect = true
        setError(code)
        setStatus('failed')
        return
      }
      setStatus('reconnecting')
      const delay = Math.min(10_000, 500 * 2 ** retryCount)
      retryCount += 1
      reconnectTimer = window.setTimeout(async () => {
        if (disposed || !liveCredentials) return
        try {
          liveCredentials = await joinMessageRoom(roomId, liveCredentials.mode, false, liveCredentials.resume_credential)
          connect(liveCredentials)
        } catch (cause) {
          const nextCode = cause instanceof Error ? cause.message : 'room_unavailable'
          scheduleReconnect(nextCode)
        }
      }, delay)
    }

    const connect = (activeCredentials: MessageRoomCredentials) => {
      if (disposed) return
      setStatus(retryCount > 0 ? 'reconnecting' : 'connecting')
      const ws = new WebSocket(apiWebSocketUrl())
      socketRef.current = ws
      let replayReady = false
      ws.onopen = () => {
        if (disposed) { ws.close(); return }
        ws.send(JSON.stringify({ type: 'authenticate', ticket: activeCredentials.connection_ticket }))
      }
      ws.onmessage = async (rawEvent) => {
        if (disposed || typeof rawEvent.data !== 'string') return
        let event: RoomServerEvent
        try { event = JSON.parse(rawEvent.data) as RoomServerEvent } catch { return }
        if (event.type === 'authorized') {
          if (event.room_id !== roomId) {
            setError('room_unavailable')
            setStatus('failed')
            stopReconnect = true
            ws.close()
            return
          }
          setMembers(event.members)
          setStatus('replaying')
          try {
            const response = await fetchMessageRoomReplay(roomId, activeCredentials, event.boundary)
            if (disposed || ws.readyState !== WebSocket.OPEN) return
            let nextReplay = createRoomReplay(
              roomId,
              response.room.items.map((item) => Math.max(1, item.song.data.sections.length)),
            )
            for (const message of response.history) {
              nextReplay = applyRoomMessage(nextReplay, message)
              appendDebug({ source: 'replay', event: message })
            }
            replayRef.current = nextReplay
            setContent(response.room)
            setRoomName(response.room_name)
            setRoomCreatedAt(response.created_at ?? null)
            setReplay(nextReplay)
            ws.send(JSON.stringify({ type: 'history_ready' }))
            replayReady = true
            retryCount = 0
            setStatus('connected')
          } catch (cause) {
            const code = cause instanceof Error ? cause.message : 'room_unavailable'
            if (code === 'room_deleted') {
              stopReconnect = true
              setStatus('ended')
              setError(code)
              return
            }
            if (code === 'unauthorized' || code === 'room_unavailable') {
              stopReconnect = true
              setStatus('failed')
              setError(code)
              return
            }
            ws.close()
          }
          return
        }
        if (event.type === 'presence') {
          setMembers(event.members)
          appendDebug({ source: 'presence', event: { type: 'presence', members: event.members } })
          return
        }
        if (event.type === 'error') {
          if (event.code === 'room_deleted') {
            stopReconnect = true
            setStatus('ended')
            setError(event.code)
            ws.close()
          } else if (event.code === 'room_unavailable' || event.code === 'unauthorized') {
            stopReconnect = true
            setStatus('failed')
            setError(event.code)
            ws.close()
          }
          return
        }
        if (event.type === 'change') {
          if (!replayReady || !replayRef.current) {
            return
          }
          try {
            const next = applyRoomMessage(replayRef.current, event.message)
            replayRef.current = next
            setReplay(next)
            appendDebug({ source: 'live', event: event.message })
          } catch {
            setError('invalid_room_message')
            setStatus('failed')
            stopReconnect = true
            ws.close()
          }
        }
      }
      ws.onerror = () => { /* reconnect is scheduled by onclose */ }
      ws.onclose = () => {
        if (disposed || stopReconnect) return
        scheduleReconnect()
      }
    }

    connect(credentials)
    return () => {
      disposed = true
      if (reconnectTimer) window.clearTimeout(reconnectTimer)
      socketRef.current?.close()
      socketRef.current = null
    }
  // The active credentials are replaced locally as tickets rotate on reconnect.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, credentials?.connection_ticket, credentials?.visit_id])

  const sendChange = useCallback((change: RoomMessage['change']) => {
    const socket = socketRef.current
    if (!socket || socket.readyState !== WebSocket.OPEN) return false
    socket.send(JSON.stringify({ type: 'change', id: crypto.randomUUID(), change }))
    return true
  }, [])

  return { content, roomName, roomCreatedAt, replay, members, status, error, debugLog, sendChange }
}
