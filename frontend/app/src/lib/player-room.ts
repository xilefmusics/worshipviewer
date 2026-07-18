import { useCallback, useEffect, useRef, useState } from 'react'

import type { components } from '@/api/schema'

export type PlayerRoomMode = 'sheet' | 'av' | 'slide'
export type PlayerRoomSourceType = 'song' | 'collection' | 'setlist'
export type PlayerRoomMusicalState = { item_index: number; language: string | null; transposition: string | null }
export type PlayerRoomProjection = {
  content_text: string
  content_lines?: unknown
  content_layer: Record<string, unknown>
  background_layer: Record<string, unknown>
  transition: Record<string, unknown>
  screen_state: 'live' | 'blank' | 'blackout'
  item_title: string
  next_preview: string | null
}
export type PlayerRoomParticipant = { id: string; mode: PlayerRoomMode; hide_chords?: boolean; display_name: string; avatar_url: string | null; anonymous: boolean; connected: boolean; is_host: boolean; is_av_host: boolean }
export type PlayerRoomSummary = { id: string; name: string; team_id: string; source_type: PlayerRoomSourceType; source_id: string; source_title: string; host_email: string; participant_count: number; av_occupied: boolean; created_at: string }
export type PlayerRoomSnapshot = PlayerRoomSummary & { content: { items: components['schemas']['Player']['items']; toc: components['schemas']['Player']['toc'] }; musical_state: PlayerRoomMusicalState; projection: PlayerRoomProjection | null; participants: PlayerRoomParticipant[]; revision: number; host_lease_expires_at: string; guests_allowed?: boolean }
export type PlayerRoomCredentials = { room_id: string; participant_id: string; mode: PlayerRoomMode; resume_credential: string; connection_ticket: string }
export type CreatedPlayerRoom = { room: PlayerRoomSummary; credentials: PlayerRoomCredentials; invite_secret: string }

const apiBase = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '')
const credentialKey = (roomId: string) => `playerRoom:${roomId}:credentials`
const inviteKey = (roomId: string) => `playerRoom:${roomId}:invite`
const REDACTED_ROOM_EVENT_VALUE = '[redacted]'

export function redactPlayerRoomEvent(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactPlayerRoomEvent)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(
    Object.entries(value).map(([key, nested]) => [
      key,
      /ticket|credential|secret/i.test(key)
        ? REDACTED_ROOM_EVENT_VALUE
        : redactPlayerRoomEvent(nested),
    ]),
  )
}

function logPlayerRoomEvent(
  roomId: string,
  direction: 'incoming' | 'outgoing',
  event: unknown,
): void {
  console.log(`[PlayerRoom ${roomId}] ${direction}`, redactPlayerRoomEvent(event))
}

function sendPlayerRoomEvent(roomId: string, socket: WebSocket, event: object): void {
  logPlayerRoomEvent(roomId, 'outgoing', event)
  socket.send(JSON.stringify(event))
}

async function jsonRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBase}${path}`, { credentials: 'include', ...init, headers: { 'Content-Type': 'application/json', ...init?.headers } })
  if (!response.ok) {
    const problem = await response.clone().json().catch(async () => ({
      detail: await response.text().catch(() => ''),
    }))
    console.warn('[PlayerRoom HTTP] request failed', {
      method: init?.method ?? 'GET',
      path,
      status: response.status,
      problem: redactPlayerRoomEvent(problem),
    })
    const code = problem && typeof problem === 'object' && 'code' in problem
      ? String(problem.code)
      : response.status === 409 ? 'av_occupied' : 'player_room_unavailable'
    throw new Error(code)
  }
  return response.json() as Promise<T>
}

export function saveRoomCredentials(credentials: PlayerRoomCredentials): void { sessionStorage.setItem(credentialKey(credentials.room_id), JSON.stringify(credentials)) }
export function readRoomCredentials(roomId: string): PlayerRoomCredentials | null { try { const raw = sessionStorage.getItem(credentialKey(roomId)); return raw ? JSON.parse(raw) as PlayerRoomCredentials : null } catch { return null } }
export function saveRoomInvite(roomId: string, secret: string): void { sessionStorage.setItem(inviteKey(roomId), secret) }
export function readRoomInvite(roomId: string): string | null { return sessionStorage.getItem(inviteKey(roomId)) }

export async function createPlayerRoom(input: { source_type: PlayerRoomSourceType; source_id: string; host_mode: Exclude<PlayerRoomMode, 'slide'>; musical_state: PlayerRoomMusicalState; projection: PlayerRoomProjection | null }): Promise<CreatedPlayerRoom> {
  console.log('[PlayerRoom HTTP] create', redactPlayerRoomEvent(input))
  const created = await jsonRequest<CreatedPlayerRoom>('/api/v1/player-rooms', { method: 'POST', body: JSON.stringify(input) })
  saveRoomCredentials(created.credentials); saveRoomInvite(created.room.id, created.invite_secret); return created
}
export async function listPlayerRooms(params: { page: number; q?: string; team?: string }): Promise<{ items: PlayerRoomSummary[]; total: number }> {
  const search = new URLSearchParams({ page: String(params.page), page_size: '50' }); if (params.q) search.set('q', params.q); if (params.team) search.set('team', params.team)
  const response = await fetch(`${apiBase}/api/v1/player-rooms?${search}`, { credentials: 'include' }); if (!response.ok) throw new Error('player_room_unavailable')
  return { items: await response.json() as PlayerRoomSummary[], total: Number(response.headers.get('x-total-count') ?? 0) }
}
export async function joinPlayerRoom(roomId: string, mode: PlayerRoomMode, hideChords = false): Promise<PlayerRoomCredentials> {
  const previous = readRoomCredentials(roomId); const credentials = await jsonRequest<PlayerRoomCredentials>(`/api/v1/player-rooms/${encodeURIComponent(roomId)}/join`, { method: 'POST', body: JSON.stringify({ mode, hide_chords: hideChords, resume_credential: previous?.mode === mode ? previous.resume_credential : null }) }); saveRoomCredentials(credentials); return credentials
}
export async function inspectPlayerRoomInvite(inviteSecret: string): Promise<{ room_id: string; name: string; host_email: string; av_occupied: boolean; guests_allowed?: boolean }> { return jsonRequest('/api/v1/player-rooms/invite/inspect', { method: 'POST', body: JSON.stringify({ invite_secret: inviteSecret }) }) }
export async function joinPlayerRoomInvite(input: { invite_secret: string; display_name: string; mode: PlayerRoomMode; hide_chords?: boolean }): Promise<PlayerRoomCredentials> { const credentials = await jsonRequest<PlayerRoomCredentials>('/api/v1/player-rooms/invite/join', { method: 'POST', body: JSON.stringify({ hide_chords: false, ...input }) }); saveRoomCredentials(credentials); return credentials }
export async function endPlayerRoom(roomId: string, resumeCredential: string): Promise<void> { const response = await fetch(`${apiBase}/api/v1/player-rooms/${encodeURIComponent(roomId)}`, { method: 'DELETE', credentials: 'include', headers: { 'X-Player-Room-Credential': resumeCredential } }); if (!response.ok) throw new Error('player_room_unavailable') }
async function reconnectPlayerRoom(credentials: PlayerRoomCredentials): Promise<PlayerRoomCredentials> { const next = await jsonRequest<PlayerRoomCredentials>(`/api/v1/player-rooms/${encodeURIComponent(credentials.room_id)}/reconnect`, { method: 'POST', body: JSON.stringify({ mode: credentials.mode, resume_credential: credentials.resume_credential }) }); saveRoomCredentials(next); return next }

export type RoomConnection = { snapshot: PlayerRoomSnapshot | null; status: 'connecting' | 'connected' | 'reconnecting' | 'ended'; sendMusicalState: (state: PlayerRoomMusicalState) => void; sendProjection: (projection: PlayerRoomProjection) => void; sendGuestsAllowed: (guestsAllowed: boolean) => void; leave: () => void }

export function usePlayerRoom(credentials: PlayerRoomCredentials | null): RoomConnection {
  const [snapshot, setSnapshot] = useState<PlayerRoomSnapshot | null>(null)
  const [status, setStatus] = useState<RoomConnection['status']>('connecting')
  const socketRef = useRef<WebSocket | null>(null); const retryRef = useRef(0); const closedRef = useRef(false)
  const send = useCallback((message: object) => {
    if (credentials && socketRef.current?.readyState === WebSocket.OPEN) {
      sendPlayerRoomEvent(credentials.room_id, socketRef.current, message)
    }
  }, [credentials])
  useEffect(() => {
    if (!credentials) return
    closedRef.current = false; let disposed = false; let retryTimer: number | undefined; let heartbeat: number | undefined
    const connect = async () => {
      setStatus(retryRef.current ? 'reconnecting' : 'connecting')
      console.log(`[PlayerRoom ${credentials.room_id}] connecting`, { attempt: retryRef.current + 1 })
      let activeCredentials = credentials
      if (retryRef.current > 0) {
        const reconnected = await reconnectPlayerRoom(credentials).catch(() => null)
        if (disposed) return
        if (!reconnected) {
          console.warn(`[PlayerRoom ${credentials.room_id}] credential exchange failed`)
          setStatus('reconnecting')
          const delay = Math.min(10_000, 500 * 2 ** retryRef.current++)
          console.log(`[PlayerRoom ${credentials.room_id}] reconnect scheduled`, { delayMs: delay })
          retryTimer = window.setTimeout(connect, delay)
          return
        }
        activeCredentials = reconnected
      }
      const base = apiBase || window.location.origin; const url = new URL('/api/v1/player-rooms/ws', base); url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
      const ws = new WebSocket(url); socketRef.current = ws
      ws.onopen = () => {
        console.log(`[PlayerRoom ${credentials.room_id}] socket open`)
        sendPlayerRoomEvent(credentials.room_id, ws, { type: 'authenticate', ticket: activeCredentials.connection_ticket })
        heartbeat = window.setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) sendPlayerRoomEvent(credentials.room_id, ws, { type: 'heartbeat' })
        }, 10_000)
      }
      ws.onmessage = (event) => {
        let message: { type: string; snapshot?: PlayerRoomSnapshot }
        try {
          message = JSON.parse(String(event.data)) as typeof message
        } catch (error) {
          console.warn(`[PlayerRoom ${credentials.room_id}] invalid incoming event`, {
            dataType: typeof event.data,
            dataLength: typeof event.data === 'string' ? event.data.length : undefined,
            error,
          })
          return
        }
        logPlayerRoomEvent(credentials.room_id, 'incoming', message)
        if (message.type === 'room_ended') { closedRef.current = true; setStatus('ended'); ws.close(); return }
        if (message.snapshot) { setSnapshot((current) => { if (current && message.type === 'state_updated' && message.snapshot!.revision > current.revision + 1) { sendPlayerRoomEvent(credentials.room_id, ws, { type: 'request_snapshot' }); return current } return !current || message.snapshot!.revision >= current.revision ? message.snapshot! : current }); setStatus('connected'); retryRef.current = 0 }
      }
      ws.onerror = () => console.warn(`[PlayerRoom ${credentials.room_id}] socket error`)
      ws.onclose = (event) => {
        console.log(`[PlayerRoom ${credentials.room_id}] socket closed`, { code: event.code, reason: event.reason, wasClean: event.wasClean })
        if (heartbeat) window.clearInterval(heartbeat)
        if (closedRef.current) return
        setStatus('reconnecting')
        const delay = Math.min(10_000, 500 * 2 ** retryRef.current++)
        console.log(`[PlayerRoom ${credentials.room_id}] reconnect scheduled`, { delayMs: delay })
        retryTimer = window.setTimeout(connect, delay)
      }
    }
    void connect(); return () => { disposed = true; closedRef.current = true; if (retryTimer) window.clearTimeout(retryTimer); if (heartbeat) window.clearInterval(heartbeat); socketRef.current?.close() }
  }, [credentials])
  const sendMusicalState = useCallback(
    (musical_state: PlayerRoomMusicalState) =>
      send({ type: 'update_musical_state', command_id: crypto.randomUUID(), musical_state }),
    [send],
  )
  const sendProjection = useCallback(
    (projection: PlayerRoomProjection) =>
      send({ type: 'update_projection', command_id: crypto.randomUUID(), projection }),
    [send],
  )
  const sendGuestsAllowed = useCallback(
    (guests_allowed: boolean) =>
      send({ type: 'update_guests_allowed', command_id: crypto.randomUUID(), guests_allowed }),
    [send],
  )
  const leave = useCallback(() => {
    send({ type: 'leave' })
    closedRef.current = true
    socketRef.current?.close()
  }, [send])
  return { snapshot, status, sendMusicalState, sendProjection, sendGuestsAllowed, leave }
}

export function playerFromRoom(snapshot: PlayerRoomSnapshot): components['schemas']['Player'] { return { items: snapshot.content.items, toc: snapshot.content.toc, scroll_type: 'one_page', scroll_type_cache_other_orientation: 'book', orientation: 'portrait', between_items: false, index: snapshot.musical_state.item_index } }

export function participantModeLabel(
  participant: Pick<PlayerRoomParticipant, 'mode' | 'hide_chords'>,
  t: (key: string) => string,
): string {
  if (participant.mode === 'sheet') {
    return t(participant.hide_chords ? 'playerRooms.mode.text' : 'playerRooms.mode.chords')
  }
  return t(`playerRooms.mode.${participant.mode}`)
}

export function formatRoomDuration(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
  }
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

export function useRoomElapsedSeconds(since: string): number {
  const [elapsed, setElapsed] = useState(() =>
    Math.max(0, Math.floor((Date.now() - Date.parse(since)) / 1000)),
  )

  useEffect(() => {
    const tick = () => {
      setElapsed(Math.max(0, Math.floor((Date.now() - Date.parse(since)) / 1000)))
    }
    tick()
    const id = window.setInterval(tick, 1000)
    return () => window.clearInterval(id)
  }, [since])

  return elapsed
}

export function roomSourceTypeLabel(
  sourceType: PlayerRoomSourceType,
  t: (key: string) => string,
): string {
  return t(`playerRooms.sourceType.${sourceType}`)
}

export function playerRoomShortName(room: Pick<PlayerRoomSummary, 'source_title'>): string {
  return room.source_title
}
