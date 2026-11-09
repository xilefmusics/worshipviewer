import type { components } from '@/api/schema'

export type RoomDisplayMode = 'sheet' | 'av' | 'slide'
export type RoomSourceType = 'song' | 'collection' | 'setlist'
export type MessageRoomSummary = {
  id: string
  name: string
  team_id: string
  song_count: number
  can_delete: boolean
  created_at: string
}
export type MessageRoomCredentials = {
  room_id: string
  visit_id: string
  resume_credential: string
  connection_ticket: string
  mode: RoomDisplayMode
}
export type MessageRoomOrder = { epoch: number; sequence: number }
export type RoomBackground = {
  preset: number
  image?: { media_id: string; asset_id: string } | null
  video?: { media_id: string; asset_id: string; thumbnail_asset_id?: string } | null
}
export type RoomAvConfiguration = components['schemas']['RoomAvConfiguration']
export type RoomMessage = {
  id: string
  room_id: string
  visit_id: string
  order: MessageRoomOrder
  change:
    | { type: 'selection'; song: number; section?: number; slide: number; activate: boolean }
    | { type: 'vote'; song: number; voted: boolean }
    | { type: 'set_background'; background: RoomBackground }
    | { type: 'set_av_configuration'; configuration: RoomAvConfiguration }
}
export type RoomMember = { visit_id: string; display_name: string; joined_at?: string }
export type RoomContent = components['schemas']['RoomContent']
export type RoomReplayResponse = {
  room: RoomContent
  room_name: string
  created_at?: string
  history: RoomMessage[]
  boundary: MessageRoomOrder
}

export type StoredCredentials = Omit<MessageRoomCredentials, 'connection_ticket'> & {
  connection_ticket?: string
}

const apiBase = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '')
const credentialKey = (roomId: string) => `message-room:${roomId}:credentials`

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBase}${path}`, {
    credentials: 'include',
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  })
  if (!response.ok) {
    const problem = await response.json().catch(() => null) as { code?: string; detail?: string } | null
    throw new Error(problem?.code ?? (response.status === 401 ? 'unauthorized' : response.status === 404 ? 'room_deleted' : 'room_unavailable'))
  }
  return response.json() as Promise<T>
}

export function readMessageRoomCredentials(roomId: string): StoredCredentials | null {
  try {
    const raw = sessionStorage.getItem(credentialKey(roomId))
    if (!raw) return null
    const value = JSON.parse(raw) as Partial<StoredCredentials>
    if (
      value.room_id !== roomId ||
      typeof value.visit_id !== 'string' ||
      typeof value.resume_credential !== 'string' ||
      (value.mode !== 'sheet' && value.mode !== 'av' && value.mode !== 'slide')
    ) return null
    return value as StoredCredentials
  } catch {
    return null
  }
}

export function clearMessageRoomCredentials(roomId: string): void {
  try { sessionStorage.removeItem(credentialKey(roomId)) } catch { /* optional session storage */ }
}

export function saveMessageRoomCredentials(credentials: MessageRoomCredentials): void {
  const stored: StoredCredentials = {
    room_id: credentials.room_id,
    visit_id: credentials.visit_id,
    resume_credential: credentials.resume_credential,
    mode: credentials.mode,
  }
  try { sessionStorage.setItem(credentialKey(credentials.room_id), JSON.stringify(stored)) } catch { /* optional reconnect persistence */ }
}

export async function joinMessageRoom(
  roomId: string,
  mode: RoomDisplayMode = 'sheet',
  newVisit = false,
  resumeCredential?: string,
): Promise<MessageRoomCredentials> {
  const previous = newVisit ? null : readMessageRoomCredentials(roomId)
  const credentials = await requestJson<Omit<MessageRoomCredentials, 'mode'>>(
    `/api/v1/rooms/${encodeURIComponent(roomId)}/join`,
    {
      method: 'POST',
      body: JSON.stringify({ resume_credential: resumeCredential ?? previous?.resume_credential ?? null }),
    },
  )
  const result = { ...credentials, mode }
  saveMessageRoomCredentials(result)
  return result
}

export async function createMessageRoom(input: {
  team_id: string
  name?: string
  source_type?: RoomSourceType
  source_id?: string
}): Promise<{ room: MessageRoomSummary }> {
  const room = await requestJson<MessageRoomSummary>('/api/v1/rooms', {
    method: 'POST',
    body: JSON.stringify(input),
  })
  return { room }
}

export async function listMessageRooms(params: {
  page: number
  q?: string
  team?: string
}): Promise<{ items: MessageRoomSummary[]; total: number }> {
  const search = new URLSearchParams({ page: String(params.page), page_size: '50' })
  if (params.q) search.set('q', params.q)
  if (params.team) search.set('team', params.team)
  const response = await fetch(`${apiBase}/api/v1/rooms?${search}`, { credentials: 'include' })
  if (!response.ok) throw new Error(response.status === 401 ? 'unauthorized' : 'room_unavailable')
  return {
    items: await response.json() as MessageRoomSummary[],
    total: Number(response.headers.get('x-total-count') ?? 0),
  }
}

export async function deleteMessageRoom(roomId: string): Promise<void> {
  const response = await fetch(`${apiBase}/api/v1/rooms/${encodeURIComponent(roomId)}`, {
    method: 'DELETE',
    credentials: 'include',
  })
  if (!response.ok) throw new Error(response.status === 404 ? 'room_unavailable' : 'room_delete_failed')
}

export async function fetchMessageRoomReplay(
  roomId: string,
  credentials: MessageRoomCredentials,
  boundary: MessageRoomOrder,
): Promise<RoomReplayResponse> {
  return requestJson<RoomReplayResponse>(
    `/api/v1/rooms/${encodeURIComponent(roomId)}/history?epoch=${boundary.epoch}&sequence=${boundary.sequence}`,
    { headers: { 'x-room-resume': credentials.resume_credential } },
  )
}
