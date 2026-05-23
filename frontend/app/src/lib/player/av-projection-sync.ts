import type { AvProjectionPayload } from '@/lib/player/av-preferences'

export const AV_PROJECTION_STORAGE_PREFIX = 'wvAvProjection:'

function storageKey(sessionId: string): string {
  return `${AV_PROJECTION_STORAGE_PREFIX}${sessionId}`
}

function channelName(sessionId: string): string {
  return `wv-av-${sessionId}`
}

export type AvProjectionSync = {
  broadcast: (payload: AvProjectionPayload) => void
  readLatest: () => AvProjectionPayload | null
  close: () => void
}

export function readAvProjectionSnapshot(
  sessionId: string,
  storage: Pick<Storage, 'getItem'> = globalThis.localStorage,
): AvProjectionPayload | null {
  try {
    const raw = storage.getItem(storageKey(sessionId))
    if (!raw) return null
    return JSON.parse(raw) as AvProjectionPayload
  } catch {
    return null
  }
}

export function writeAvProjectionSnapshot(
  sessionId: string,
  payload: AvProjectionPayload,
  storage: Pick<Storage, 'setItem'> = globalThis.localStorage,
): void {
  storage.setItem(storageKey(sessionId), JSON.stringify(payload))
}

export function createAvProjectionSync(
  sessionId: string,
  storage: Pick<Storage, 'getItem' | 'setItem'> = globalThis.localStorage,
): AvProjectionSync {
  let channel: BroadcastChannel | null = null
  try {
    channel = new BroadcastChannel(channelName(sessionId))
  } catch {
    channel = null
  }

  return {
    broadcast(payload) {
      writeAvProjectionSnapshot(sessionId, payload, storage)
      channel?.postMessage(payload)
    },
    readLatest() {
      return readAvProjectionSnapshot(sessionId, storage)
    },
    close() {
      channel?.close()
      channel = null
    },
  }
}

export type AvProjectionListener = {
  close: () => void
}

export function subscribeAvProjectionSync(
  sessionId: string,
  onPayload: (payload: AvProjectionPayload) => void,
  storage: Pick<Storage, 'getItem'> = globalThis.localStorage,
): AvProjectionListener {
  const latest = readAvProjectionSnapshot(sessionId, storage)
  if (latest) onPayload(latest)

  let channel: BroadcastChannel | null = null
  const onStorage = (event: StorageEvent) => {
    if (event.key !== storageKey(sessionId) || !event.newValue) return
    try {
      onPayload(JSON.parse(event.newValue) as AvProjectionPayload)
    } catch {
      /* ignore malformed payload */
    }
  }

  try {
    channel = new BroadcastChannel(channelName(sessionId))
    channel.onmessage = (event: MessageEvent<AvProjectionPayload>) => {
      if (event.data) onPayload(event.data)
    }
  } catch {
    channel = null
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('storage', onStorage)
  }

  return {
    close() {
      channel?.close()
      channel = null
      if (typeof window !== 'undefined') {
        window.removeEventListener('storage', onStorage)
      }
    },
  }
}

export function createAvProjectionSessionId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `av-${Date.now()}-${Math.random().toString(36).slice(2)}`
}
