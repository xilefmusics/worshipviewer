import { useCallback, useEffect, useRef, useState } from 'react'

import type { components } from '@/api/schema'

export type RoomMode = 'sheet' | 'av' | 'slide'
export type RoomSourceType = 'song' | 'collection' | 'setlist'
export type RoomSongPool = components['schemas']['RoomSongPool']
export type RoomSongPoolSelection = components['schemas']['RoomSongPoolSelection']
export type RoomMusicalState = { item_index: number; language: string | null; transposition: string | null }
export type RoomProjection = {
  content_text: string
  content_lines?: unknown
  content_layer: Record<string, unknown>
  background_layer: Record<string, unknown>
  transition: Record<string, unknown>
  screen_state: 'live' | 'blank' | 'blackout'
  item_title: string
  next_preview: string | null
}
export type RoomQueueItem = {
  id: string
  song_id: string
  title: string
  song: Extract<components['schemas']['PlayerItem'], { type: 'chords' }>
  added_by: string
  upvotes: number
}
export type RoomParticipant = { id: string; mode: RoomMode; hide_chords?: boolean; display_name: string; avatar_url: string | null; anonymous: boolean; connected: boolean; is_host: boolean; is_av_host: boolean }
export type RoomSummary = { id: string; name: string; team_id: string; source_type: RoomSourceType | null; source_id: string | null; source_title: string | null; song_pool?: RoomSongPool; open?: boolean; host_email: string; can_close?: boolean; participant_count: number; av_occupied: boolean; created_at: string }
export type RoomSnapshot = RoomSummary & { content: { items: components['schemas']['Player']['items']; toc: components['schemas']['Player']['toc'] }; queue: RoomQueueItem[]; voted_queue_ids: string[]; musical_state: RoomMusicalState; projection: RoomProjection | null; participants: RoomParticipant[]; revision: number; host_lease_expires_at: string; guests_allowed?: boolean }
export type RoomCredentials = { room_id: string; participant_id: string; mode: RoomMode; resume_credential: string; connection_ticket: string }
export type CreatedRoom = { room: RoomSummary; credentials: RoomCredentials; invite_secret: string }
export type RoomServerMessage =
  | { type: 'snapshot'; snapshot: RoomSnapshot }
  | { type: 'heartbeat'; revision: number; host_lease_expires_at: string }
  | { type: 'musical_state_updated'; musical_state: RoomMusicalState; revision: number }
  | { type: 'projection_updated'; projection: RoomProjection; revision: number }
  | { type: 'queue_updated'; queue: RoomQueueItem[]; revision: number }
  | { type: 'guests_allowed_updated'; guests_allowed: boolean; revision: number }
  | { type: 'song_pool_updated'; song_pool: RoomSongPool | null; open: boolean; revision: number }
  | { type: 'participants_changed'; participants: RoomParticipant[]; participant_count: number; av_occupied: boolean; revision: number }
  | { type: 'command_accepted'; command_id: string; revision: number; queue_id?: string; upvoted?: boolean }
  | { type: 'command_rejected'; command_id: string; reason: string; revision: number }
  | { type: 'room_ended' }

const apiBase = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '')
const credentialKey = (roomId: string) => `room:${roomId}:credentials`
const inviteKey = (roomId: string) => `room:${roomId}:invite`
const REDACTED_ROOM_EVENT_VALUE = '[redacted]'

export function redactRoomEvent(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactRoomEvent)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(
    Object.entries(value).map(([key, nested]) => [
      key,
      /ticket|credential|secret/i.test(key)
        ? REDACTED_ROOM_EVENT_VALUE
        : redactRoomEvent(nested),
    ]),
  )
}

function logRoomEvent(
  roomId: string,
  direction: 'incoming' | 'outgoing',
  event: unknown,
): void {
  console.log(`[Room ${roomId}] ${direction}`, redactRoomEvent(event))
}

function sendRoomEvent(roomId: string, socket: WebSocket, event: object): void {
  logRoomEvent(roomId, 'outgoing', event)
  socket.send(JSON.stringify(event))
}

async function jsonRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBase}${path}`, { credentials: 'include', ...init, headers: { 'Content-Type': 'application/json', ...init?.headers } })
  if (!response.ok) {
    const problem = await response.clone().json().catch(async () => ({
      detail: await response.text().catch(() => ''),
    }))
    console.warn('[Room HTTP] request failed', {
      method: init?.method ?? 'GET',
      path,
      status: response.status,
      problem: redactRoomEvent(problem),
    })
    const code = problem && typeof problem === 'object' && 'code' in problem
      ? String(problem.code)
      : response.status === 409 ? 'av_occupied' : 'room_unavailable'
    throw new Error(code)
  }
  return response.json() as Promise<T>
}

export function saveRoomCredentials(credentials: RoomCredentials): void { sessionStorage.setItem(credentialKey(credentials.room_id), JSON.stringify(credentials)) }
export function readRoomCredentials(roomId: string): RoomCredentials | null { try { const raw = sessionStorage.getItem(credentialKey(roomId)); return raw ? JSON.parse(raw) as RoomCredentials : null } catch { return null } }
export function saveRoomInvite(roomId: string, secret: string): void { sessionStorage.setItem(inviteKey(roomId), secret) }
export function readRoomInvite(roomId: string): string | null { return sessionStorage.getItem(inviteKey(roomId)) }

export async function createRoom(input: {
  team_id: string
  name?: string
  source_type?: RoomSourceType
  source_id?: string
}): Promise<CreatedRoom> {
  console.log('[Room HTTP] create', redactRoomEvent(input))
  const created = await jsonRequest<CreatedRoom>('/api/v1/rooms', { method: 'POST', body: JSON.stringify(input) })
  saveRoomCredentials(created.credentials); saveRoomInvite(created.room.id, created.invite_secret); return created
}
export async function listRooms(params: { page: number; q?: string; team?: string }): Promise<{ items: RoomSummary[]; total: number }> {
  const search = new URLSearchParams({ page: String(params.page), page_size: '50' }); if (params.q) search.set('q', params.q); if (params.team) search.set('team', params.team)
  const response = await fetch(`${apiBase}/api/v1/rooms?${search}`, { credentials: 'include' }); if (!response.ok) throw new Error('room_unavailable')
  return { items: await response.json() as RoomSummary[], total: Number(response.headers.get('x-total-count') ?? 0) }
}
export async function joinRoom(roomId: string, mode: RoomMode, hideChords = false): Promise<RoomCredentials> {
  const previous = readRoomCredentials(roomId); const credentials = await jsonRequest<RoomCredentials>(`/api/v1/rooms/${encodeURIComponent(roomId)}/join`, { method: 'POST', body: JSON.stringify({ mode, hide_chords: hideChords, resume_credential: previous?.mode === mode ? previous.resume_credential : null }) }); saveRoomCredentials(credentials); return credentials
}
export async function inspectRoomInvite(inviteSecret: string): Promise<{ room_id: string; name: string; host_email: string; av_occupied: boolean; guests_allowed?: boolean }> { return jsonRequest('/api/v1/rooms/invite/inspect', { method: 'POST', body: JSON.stringify({ invite_secret: inviteSecret }) }) }
export async function joinRoomInvite(input: { invite_secret: string; display_name: string; mode: RoomMode; hide_chords?: boolean }): Promise<RoomCredentials> { const credentials = await jsonRequest<RoomCredentials>('/api/v1/rooms/invite/join', { method: 'POST', body: JSON.stringify({ hide_chords: false, ...input }) }); saveRoomCredentials(credentials); return credentials }
export async function endRoom(roomId: string): Promise<void> { const response = await fetch(`${apiBase}/api/v1/rooms/${encodeURIComponent(roomId)}`, { method: 'DELETE', credentials: 'include' }); if (!response.ok) throw new Error(response.status === 403 ? 'room_forbidden' : 'room_unavailable') }
export function updateRoomSongPool(roomId: string, pool: RoomSongPoolSelection | null, open: boolean, revision: number): Promise<void> { return roomMutation(`/api/v1/rooms/${encodeURIComponent(roomId)}/song-pool`, { method: 'PUT', body: JSON.stringify({ pool, open, revision }) }) }
export async function fetchRoomPoolSongs(roomId: string, query: { page: number; q: string; signal?: AbortSignal }): Promise<{ items: components['schemas']['Song'][]; total: number }> {
  const params = new URLSearchParams({ page: String(query.page), page_size: '50' })
  if (query.q.trim()) params.set('q', query.q.trim())
  const response = await fetch(`${apiBase}/api/v1/rooms/${encodeURIComponent(roomId)}/song-pool/songs?${params}`, { credentials: 'include', signal: query.signal })
  if (!response.ok) {
    const problem = await response.clone().json().catch(async () => ({ detail: await response.text().catch(() => '') }))
    const code = problem && typeof problem === 'object' && 'code' in problem ? String(problem.code) : response.status === 409 ? 'song_pool_unavailable' : 'room_unavailable'
    throw new Error(code)
  }
  return { items: await response.json() as components['schemas']['Song'][], total: Number(response.headers.get('x-total-count') ?? 0) }
}
async function roomMutation(path: string, init: RequestInit): Promise<void> {
  const response = await fetch(`${apiBase}${path}`, { credentials: 'include', ...init, headers: { 'Content-Type': 'application/json', ...init.headers } })
  if (!response.ok) {
    const problem = await response.clone().json().catch(() => null)
    const code = problem && typeof problem === 'object' && 'code' in problem ? String(problem.code) : response.status === 403 ? 'room_forbidden' : response.status === 409 ? 'revision_conflict' : 'room_unavailable'
    throw new Error(code)
  }
}
export function addRoomQueueItem(roomId: string, songId: string, revision: number): Promise<void> { return roomMutation(`/api/v1/rooms/${encodeURIComponent(roomId)}/queue`, { method: 'POST', body: JSON.stringify({ song_id: songId, revision }) }) }
export function promoteRoomQueueItem(roomId: string, queueId: string, revision: number): Promise<void> { return roomMutation(`/api/v1/rooms/${encodeURIComponent(roomId)}/queue/${encodeURIComponent(queueId)}/promote`, { method: 'POST', body: JSON.stringify({ revision }) }) }
export function removeRoomQueueItem(roomId: string, queueId: string, revision: number): Promise<void> { return roomMutation(`/api/v1/rooms/${encodeURIComponent(roomId)}/queue/${encodeURIComponent(queueId)}?revision=${encodeURIComponent(revision)}`, { method: 'DELETE' }) }
export function reorderRoomQueue(roomId: string, queueIds: string[], revision: number): Promise<void> { return roomMutation(`/api/v1/rooms/${encodeURIComponent(roomId)}/queue/order`, { method: 'PUT', body: JSON.stringify({ queue_ids: queueIds, revision }) }) }
async function reconnectRoom(credentials: RoomCredentials): Promise<RoomCredentials> { const next = await jsonRequest<RoomCredentials>(`/api/v1/rooms/${encodeURIComponent(credentials.room_id)}/reconnect`, { method: 'POST', body: JSON.stringify({ mode: credentials.mode, resume_credential: credentials.resume_credential }) }); saveRoomCredentials(next); return next }

export type RoomConnection = { snapshot: RoomSnapshot | null; status: 'connecting' | 'connected' | 'reconnecting' | 'ended'; sendMusicalState: (state: RoomMusicalState) => void; sendProjection: (projection: RoomProjection) => void; sendGuestsAllowed: (guestsAllowed: boolean) => void; sendQueueVote: (queueId: string, upvoted: boolean) => void; leave: () => void }

export function applyRoomServerMessage(
  current: RoomSnapshot | null,
  message: RoomServerMessage,
): { snapshot: RoomSnapshot | null; needsSnapshot: boolean } {
  if (message.type === 'snapshot') {
    return {
      snapshot: !current || message.snapshot.revision >= current.revision
        ? {
            ...message.snapshot,
            voted_queue_ids: current
              ? (current.voted_queue_ids ?? []).filter((id) => message.snapshot.queue.some((item) => item.id === id))
              : (message.snapshot.voted_queue_ids ?? []),
          }
        : current,
      needsSnapshot: false,
    }
  }
  if (
    message.type === 'heartbeat' ||
    message.type === 'room_ended'
  ) {
    const remoteRevision = 'revision' in message ? message.revision : current?.revision
    return {
      snapshot: current,
      needsSnapshot: remoteRevision != null && current != null && remoteRevision > current.revision,
    }
  }
  if (message.type === 'command_accepted') {
    if (!current || message.queue_id == null || message.upvoted == null) {
      return { snapshot: current, needsSnapshot: false }
    }
    const votedQueueIds = new Set(current.voted_queue_ids ?? [])
    if (message.upvoted) votedQueueIds.add(message.queue_id)
    else votedQueueIds.delete(message.queue_id)
    return {
      snapshot: { ...current, voted_queue_ids: [...votedQueueIds] },
      needsSnapshot: false,
    }
  }
  if (message.type === 'command_rejected') {
    return {
      snapshot: current,
      needsSnapshot:
        message.reason === 'revision_conflict' &&
        current != null &&
        message.revision > current.revision,
    }
  }
  if (!current) return { snapshot: null, needsSnapshot: true }
  if (message.revision <= current.revision) return { snapshot: current, needsSnapshot: false }
  if (message.revision > current.revision + 1) return { snapshot: current, needsSnapshot: true }
  switch (message.type) {
    case 'musical_state_updated':
      return { snapshot: { ...current, musical_state: message.musical_state, revision: message.revision }, needsSnapshot: false }
    case 'projection_updated':
      return { snapshot: { ...current, projection: message.projection, revision: message.revision }, needsSnapshot: false }
    case 'guests_allowed_updated':
      return { snapshot: { ...current, guests_allowed: message.guests_allowed, revision: message.revision }, needsSnapshot: false }
    case 'song_pool_updated':
      return { snapshot: { ...current, song_pool: message.song_pool ?? undefined, open: message.open, revision: message.revision }, needsSnapshot: false }
    case 'queue_updated':
      return {
        snapshot: {
          ...current,
          queue: message.queue,
          voted_queue_ids: (current.voted_queue_ids ?? []).filter((id) => message.queue.some((item) => item.id === id)),
          revision: message.revision,
        },
        needsSnapshot: false,
      }
    case 'participants_changed':
      return {
        snapshot: {
          ...current,
          participants: message.participants,
          participant_count: message.participant_count,
          av_occupied: message.av_occupied,
          revision: message.revision,
        },
        needsSnapshot: false,
      }
  }
}

export function useRoom(credentials: RoomCredentials | null): RoomConnection {
  const [snapshot, setSnapshot] = useState<RoomSnapshot | null>(null)
  const [status, setStatus] = useState<RoomConnection['status']>('connecting')
  const roomId = credentials?.room_id
  const participantId = credentials?.participant_id
  const mode = credentials?.mode
  const resumeCredential = credentials?.resume_credential
  const connectionTicket = credentials?.connection_ticket
  const socketRef = useRef<WebSocket | null>(null); const retryRef = useRef(0); const closedRef = useRef(false); const snapshotRef = useRef<RoomSnapshot | null>(null)
  const pendingCommandsRef = useRef(new Map<string, object>())
  const send = useCallback((message: object) => {
    if (roomId && socketRef.current?.readyState === WebSocket.OPEN) {
      sendRoomEvent(roomId, socketRef.current, message)
      return
    }
    if ('type' in message && typeof message.type === 'string' && message.type.startsWith('update_')) {
      pendingCommandsRef.current.set(message.type, message)
    }
  }, [roomId])
  useEffect(() => {
    if (!roomId || !participantId || !mode || !resumeCredential || !connectionTicket) return
    const connectionCredentials: RoomCredentials = {
      room_id: roomId,
      participant_id: participantId,
      mode,
      resume_credential: resumeCredential,
      connection_ticket: connectionTicket,
    }
    const pendingCommands = pendingCommandsRef.current
    closedRef.current = false; let disposed = false; let retryTimer: number | undefined; let heartbeat: number | undefined
    const connect = async () => {
      if (disposed) return
      setStatus(retryRef.current ? 'reconnecting' : 'connecting')
      console.log(`[Room ${roomId}] connecting`, { attempt: retryRef.current + 1 })
      let activeCredentials = connectionCredentials
      if (retryRef.current > 0) {
        const reconnected = await reconnectRoom(connectionCredentials).catch(() => null)
        if (disposed) return
        if (!reconnected) {
          console.warn(`[Room ${roomId}] credential exchange failed`)
          setStatus('reconnecting')
          const delay = Math.min(10_000, 500 * 2 ** retryRef.current++)
          console.log(`[Room ${roomId}] reconnect scheduled`, { delayMs: delay })
          retryTimer = window.setTimeout(connect, delay)
          return
        }
        activeCredentials = reconnected
      }
      const base = apiBase || window.location.origin; const url = new URL('/api/v1/rooms/ws', base); url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
      const ws = new WebSocket(url); socketRef.current = ws
      ws.onopen = () => {
        if (disposed) {
          ws.close()
          return
        }
        console.log(`[Room ${roomId}] socket open`)
        sendRoomEvent(roomId, ws, { type: 'authenticate', ticket: activeCredentials.connection_ticket })
        for (const command of pendingCommands.values()) {
          sendRoomEvent(roomId, ws, command)
        }
        pendingCommands.clear()
        heartbeat = window.setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) sendRoomEvent(roomId, ws, { type: 'heartbeat', revision: snapshotRef.current?.revision ?? null })
        }, 10_000)
      }
      ws.onmessage = (event) => {
        if (disposed) return
        let message: RoomServerMessage
        try {
          message = JSON.parse(String(event.data)) as typeof message
        } catch (error) {
          console.warn(`[Room ${roomId}] invalid incoming event`, {
            dataType: typeof event.data,
            dataLength: typeof event.data === 'string' ? event.data.length : undefined,
            error,
          })
          return
        }
        logRoomEvent(roomId, 'incoming', message)
        if (message.type === 'room_ended') { closedRef.current = true; setStatus('ended'); ws.close(); return }
        setSnapshot((current) => {
          const result = applyRoomServerMessage(current, message)
          if (result.needsSnapshot) sendRoomEvent(roomId, ws, { type: 'request_snapshot' })
          snapshotRef.current = result.snapshot
          return result.snapshot
        })
        setStatus('connected')
        retryRef.current = 0
      }
      ws.onerror = () => {
        if (!disposed) console.warn(`[Room ${roomId}] socket error`)
      }
      ws.onclose = (event) => {
        if (disposed) return
        console.log(`[Room ${roomId}] socket closed`, { code: event.code, reason: event.reason, wasClean: event.wasClean })
        if (heartbeat) window.clearInterval(heartbeat)
        if (closedRef.current) return
        setStatus('reconnecting')
        const delay = Math.min(10_000, 500 * 2 ** retryRef.current++)
        console.log(`[Room ${roomId}] reconnect scheduled`, { delayMs: delay })
        retryTimer = window.setTimeout(connect, delay)
      }
    }
    void connect(); return () => { disposed = true; closedRef.current = true; snapshotRef.current = null; pendingCommands.clear(); if (retryTimer) window.clearTimeout(retryTimer); if (heartbeat) window.clearInterval(heartbeat); socketRef.current?.close() }
  }, [connectionTicket, mode, participantId, resumeCredential, roomId])
  const sendMusicalState = useCallback(
    (musical_state: RoomMusicalState) =>
      send({ type: 'update_musical_state', command_id: crypto.randomUUID(), musical_state }),
    [send],
  )
  const sendProjection = useCallback(
    (projection: RoomProjection) =>
      send({ type: 'update_projection', command_id: crypto.randomUUID(), projection }),
    [send],
  )
  const sendGuestsAllowed = useCallback(
    (guests_allowed: boolean) =>
      send({ type: 'update_guests_allowed', command_id: crypto.randomUUID(), guests_allowed }),
    [send],
  )
  const sendQueueVote = useCallback(
    (queue_id: string, upvoted: boolean) =>
      send({
        type: 'update_queue_vote',
        command_id: crypto.randomUUID(),
        queue_id,
        upvoted,
        revision: snapshotRef.current?.revision ?? 0,
      }),
    [send],
  )
  const leave = useCallback(() => {
    send({ type: 'leave' })
    closedRef.current = true
    socketRef.current?.close()
  }, [send])
  return { snapshot, status, sendMusicalState, sendProjection, sendGuestsAllowed, sendQueueVote, leave }
}

export function playerFromRoom(snapshot: RoomSnapshot): components['schemas']['Player'] { return { items: snapshot.content.items, toc: snapshot.content.toc, scroll_type: 'one_page', scroll_type_cache_other_orientation: 'book', orientation: 'portrait', between_items: false, index: snapshot.musical_state.item_index } }

export function participantModeLabel(
  participant: Pick<RoomParticipant, 'mode' | 'hide_chords'>,
  t: (key: string) => string,
): string {
  if (participant.mode === 'sheet') {
    return t(participant.hide_chords ? 'rooms.mode.text' : 'rooms.mode.chords')
  }
  return t(`rooms.mode.${participant.mode}`)
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
  sourceType: RoomSourceType | null,
  t: (key: string) => string,
): string {
  return sourceType ? t(`rooms.sourceType.${sourceType}`) : t('rooms.emptyRoom')
}

export function roomShortName(room: Pick<RoomSummary, 'name'>): string {
  return room.name
}
