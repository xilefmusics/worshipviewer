let active: { roomId: string; credential: string; blobIds: Set<string> } | null = null

export function registerPlayerRoomMedia(roomId: string, credential: string, blobIds: string[]): () => void {
  const registration = { roomId, credential, blobIds: new Set(blobIds) }; active = registration
  return () => { if (active === registration) active = null }
}

export async function fetchPlayerRoomMedia(blobId: string, signal?: AbortSignal): Promise<Response | null> {
  if (!active?.blobIds.has(blobId)) return null
  const base = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '')
  return fetch(`${base}/api/v1/player-rooms/${encodeURIComponent(active.roomId)}/media/${encodeURIComponent(blobId)}`, { signal, headers: { Accept: '*/*', Authorization: `PlayerRoom ${active.credential}` } })
}
