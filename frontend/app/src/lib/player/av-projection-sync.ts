import type { AvProjectionPayload } from '@/lib/player/av-preferences'
import { getLocalStorage, safeGetItem, safeSetItem } from '@/lib/browser-storage'

export const AV_PROJECTION_STORAGE_PREFIX = 'wvAvProjection:'

/** Single projection channel per browser profile — all AV players share one output. */
export const AV_PROJECTION_SHARED_SESSION_ID = 'shared'

const STORAGE_DEBOUNCE_MS = 75

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
  storage: Pick<Storage, 'getItem'> | null = getLocalStorage(),
): AvProjectionPayload | null {
  try {
    const raw = safeGetItem(storageKey(sessionId), storage)
    if (!raw) return null
    return JSON.parse(raw) as AvProjectionPayload
  } catch {
    return null
  }
}

export function writeAvProjectionSnapshot(
  sessionId: string,
  payload: AvProjectionPayload,
  storage: Pick<Storage, 'setItem'> | null = getLocalStorage(),
): void {
  safeSetItem(storageKey(sessionId), JSON.stringify(payload), storage)
}

export function createAvProjectionSync(
  sessionId: string,
  storage: Pick<Storage, 'getItem' | 'setItem'> | null = getLocalStorage(),
): AvProjectionSync {
  let channel: BroadcastChannel | null = null
  let storageTimer: ReturnType<typeof setTimeout> | null = null
  let pendingPayload: AvProjectionPayload | null = null
  try {
    channel = new BroadcastChannel(channelName(sessionId))
  } catch {
    channel = null
  }

  const flushStorage = () => {
    storageTimer = null
    if (!pendingPayload) return
    writeAvProjectionSnapshot(sessionId, pendingPayload, storage)
    pendingPayload = null
  }

  return {
    broadcast(payload) {
      pendingPayload = payload
      channel?.postMessage(payload)
      if (storageTimer != null) clearTimeout(storageTimer)
      storageTimer = setTimeout(flushStorage, STORAGE_DEBOUNCE_MS)
    },
    readLatest() {
      return readAvProjectionSnapshot(sessionId, storage)
    },
    close() {
      if (storageTimer != null) {
        clearTimeout(storageTimer)
        flushStorage()
      }
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
  storage: Pick<Storage, 'getItem'> | null = getLocalStorage(),
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

export function getAvProjectionSessionId(): string {
  return AV_PROJECTION_SHARED_SESSION_ID
}

/** @deprecated All players use {@link getAvProjectionSessionId}. */
export function createAvProjectionSessionId(): string {
  return getAvProjectionSessionId()
}
