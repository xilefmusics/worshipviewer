/**
 * Raw binary fetch for blob image bytes. Uses `fetch` directly so the body is not parsed as JSON
 * and openapi-fetch empty-body heuristics cannot drop the payload.
 */
const imageAccept =
  'image/avif,image/webp,image/apng,image/*,*/*;q=0.8'

export function blobDataUrl(blobId: string): string {
  const base = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '')
  const path = `/api/v1/blobs/${encodeURIComponent(blobId)}/data`
  return base ? `${base}${path}` : path
}

async function fetchBinaryWithCredentials(url: string, signal?: AbortSignal): Promise<Blob | null> {
  try {
    const res = await fetch(url, {
      method: 'GET',
      credentials: 'include',
      signal,
      headers: {
        Accept: imageAccept,
      },
    })
    if (!res.ok) return null
    const blob = await res.blob()
    return blob.size > 0 ? blob : null
  } catch {
    return null
  }
}

/** `GET` an API path on the configured base (or same-origin when base is empty), with session cookies. */
export async function fetchApiPathImage(path: string, signal?: AbortSignal): Promise<Blob | null> {
  const p = path.trim()
  if (!p.startsWith('/')) return null
  const base = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '')
  const url = base ? `${base}${p}` : p
  return fetchBinaryWithCredentials(url, signal)
}

export async function fetchBlobImageData(blobId: string, signal?: AbortSignal): Promise<Blob | null> {
  return fetchBinaryWithCredentials(blobDataUrl(blobId), signal)
}

/** Same as image fetch but accepts any content type (scores, PDFs, etc.) for offline mirror. */
export async function fetchBlobBinary(
  blobId: string,
  signal?: AbortSignal,
): Promise<ArrayBuffer | null> {
  const meta = await fetchBlobBinaryWithMime(blobId, signal)
  return meta?.buffer ?? null
}

/** Binary blob + optional MIME from `Content-Type` (for object URLs in the player). */
export async function fetchBlobBinaryWithMime(
  blobId: string,
  signal?: AbortSignal,
): Promise<{ buffer: ArrayBuffer; mime: string | null } | null> {
  const url = blobDataUrl(blobId)
  try {
    const { fetchPlayerRoomMedia } = await import('@/lib/player-room-media')
    const roomResponse = await fetchPlayerRoomMedia(blobId, signal)
    const res = roomResponse ?? await fetch(url, {
      method: 'GET',
      credentials: 'include',
      signal,
      headers: {
        Accept: '*/*',
      },
    })
    if (!res.ok) return null
    const buf = await res.arrayBuffer()
    if (buf.byteLength === 0) return null
    const ct = res.headers.get('content-type')
    const mime =
      ct && !/^application\/octet-stream/i.test(ct) ? ct.split(';')[0]?.trim() ?? null : null
    return { buffer: buf, mime }
  } catch {
    return null
  }
}

/** PUT raw bytes for `PUT /api/v1/blobs/{id}/data` (same rationale as GET: not JSON). */
export async function uploadBlobImageData(
  blobId: string,
  bytes: ArrayBuffer | Blob,
  signal?: AbortSignal,
): Promise<boolean> {
  const url = blobDataUrl(blobId)
  try {
    const res = await fetch(url, {
      method: 'PUT',
      credentials: 'include',
      signal,
      headers: {
        'Content-Type': 'application/octet-stream',
      },
      body: bytes,
    })
    return res.ok
  } catch {
    return false
  }
}
