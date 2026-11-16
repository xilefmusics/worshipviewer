import { parseProblemResponse } from '@/api/problem'
import type { Media } from '@/api/media'

export type UploadMediaKind = 'video' | 'audio' | 'image' | 'pdf' | 'svg'
type CreateUploadedMediaKind = 'image' | 'video' | 'audio' | 'slide_deck'

interface UploadSession {
  id: string
  chunk_size_bytes: number
}

interface UploadSource {
  file: Blob
  contentType: string
}

function apiBase(): string {
  return (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '')
}

function apiUrl(path: string): string {
  const base = apiBase()
  return base ? `${base}${path}` : path
}

export function mediaAssetDataUrl(mediaId: string, assetId: string): string {
  return apiUrl(`/api/v1/media/${encodeURIComponent(mediaId)}/assets/${encodeURIComponent(assetId)}/data`)
}

function xhrRequest(
  method: string,
  path: string,
  body: XMLHttpRequestBodyInit | null,
  signal?: AbortSignal,
  onProgress?: (loaded: number, total: number) => void,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    const cleanup = () => signal?.removeEventListener('abort', abort)
    const abort = () => xhr.abort()

    xhr.open(method, apiUrl(path))
    xhr.withCredentials = true
    xhr.responseType = 'text'
    if (body instanceof Blob) xhr.setRequestHeader('Content-Type', 'application/octet-stream')
    else if (typeof body === 'string') xhr.setRequestHeader('Content-Type', 'application/json')
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'))
      return
    }
    signal?.addEventListener('abort', abort, { once: true })
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress?.(event.loaded, event.total)
    }
    xhr.onload = async () => {
      cleanup()
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(xhr.responseText)
        return
      }
      if (xhr.status === 413) {
        reject(new Error('payload_too_large'))
        return
      }
      try {
        const problem = await parseProblemResponse(
          new Response(xhr.responseText, {
            status: xhr.status,
            headers: { 'Content-Type': 'application/problem+json' },
          }),
        )
        reject(new Error(problem?.detail ?? problem?.title ?? 'upload_failed'))
      } catch {
        reject(new Error('upload_failed'))
      }
    }
    xhr.onerror = () => {
      cleanup()
      reject(new Error('upload_failed'))
    }
    xhr.onabort = () => {
      cleanup()
      reject(new DOMException('Aborted', 'AbortError'))
    }
    xhr.send(body)
  })
}

async function startUpload(target: unknown, sources: UploadSource[], signal?: AbortSignal): Promise<UploadSession> {
  const response = await xhrRequest(
    'POST',
    '/api/v1/media/upload-sessions',
    JSON.stringify({
      target,
      sources: sources.map(({ file, contentType }) => ({
        byte_length: file.size,
        content_type: contentType,
      })),
    }),
    signal,
  )
  return JSON.parse(response) as UploadSession
}

async function abortUpload(sessionId: string): Promise<void> {
  try {
    await xhrRequest('DELETE', `/api/v1/media/upload-sessions/${encodeURIComponent(sessionId)}`, null)
  } catch {
    // The session also expires on the server if the best-effort abort cannot reach it.
  }
}

async function uploadSession(args: {
  target: unknown
  sources: UploadSource[]
  onProgress?: (ratio: number) => void
  signal?: AbortSignal
}): Promise<Media> {
  if (args.sources.length === 0 || args.sources.some(({ file }) => file.size === 0)) {
    throw new Error('upload_failed')
  }
  const session = await startUpload(args.target, args.sources, args.signal)
  const totalBytes = args.sources.reduce((sum, source) => sum + source.file.size, 0)
  let completedBytes = 0
  try {
    if (!Number.isSafeInteger(session.chunk_size_bytes) || session.chunk_size_bytes <= 0) {
      throw new Error('upload_failed')
    }
    for (const [sourceIndex, source] of args.sources.entries()) {
      for (let start = 0, chunkIndex = 0; start < source.file.size; start += session.chunk_size_bytes, chunkIndex += 1) {
        const chunk = source.file.slice(start, Math.min(start + session.chunk_size_bytes, source.file.size))
        await xhrRequest(
          'PUT',
          `/api/v1/media/upload-sessions/${encodeURIComponent(session.id)}/sources/${sourceIndex}/chunks/${chunkIndex}`,
          chunk,
          args.signal,
          (loaded) => args.onProgress?.((completedBytes + loaded) / totalBytes),
        )
        completedBytes += chunk.size
        args.onProgress?.(completedBytes / totalBytes)
      }
    }
    const response = await xhrRequest(
      'POST',
      `/api/v1/media/upload-sessions/${encodeURIComponent(session.id)}/complete`,
      null,
      args.signal,
    )
    return JSON.parse(response) as Media
  } catch (error) {
    await abortUpload(session.id)
    throw error
  }
}

export async function uploadMediaSource(args: {
  mediaId: string
  kind: UploadMediaKind
  file: Blob
  replacePage?: string
  role?: 'thumbnail'
  onProgress?: (ratio: number) => void
  signal?: AbortSignal
}): Promise<Media> {
  const target = {
    type: 'asset',
    media_id: args.mediaId,
    kind: args.kind,
    ...(args.replacePage ? { replace_page: args.replacePage } : {}),
    ...(args.role ? { role: args.role } : {}),
  }
  return uploadSession({
    target,
    sources: [{ file: args.file, contentType: args.file.type || 'application/octet-stream' }],
    onProgress: args.onProgress,
    signal: args.signal,
  })
}

export async function createUploadedMedia(args: {
  kind: CreateUploadedMediaKind
  title: string
  owner?: string
  isBackground?: boolean
  files: Blob[]
  onProgress?: (ratio: number) => void
  signal?: AbortSignal
}): Promise<Media> {
  const metadata = {
    title: args.title,
    ...(args.owner ? { owner: args.owner } : {}),
    ...(args.isBackground ? { is_background: true } : {}),
  }
  return uploadSession({
    target: { type: 'create', kind: args.kind, metadata },
    sources: args.files.map((file) => ({
      file,
      contentType: file.type || 'application/octet-stream',
    })),
    onProgress: args.onProgress,
    signal: args.signal,
  })
}
