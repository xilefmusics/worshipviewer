import { parseProblemResponse } from '@/api/problem'
import type { Media } from '@/api/media'

export type UploadMediaKind = 'video' | 'audio' | 'image' | 'pdf' | 'svg'

function apiBase(): string {
  return (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '')
}

function uploadUrl(mediaId: string, kind: UploadMediaKind, replacePage?: string): string {
  const base = apiBase()
  const params = new URLSearchParams({ kind })
  if (replacePage) params.set('replace_page', replacePage)
  const path = `/api/v1/media/${encodeURIComponent(mediaId)}/uploads?${params.toString()}`
  return base ? `${base}${path}` : path
}

export function mediaAssetDataUrl(mediaId: string, assetId: string): string {
  const base = apiBase()
  const path = `/api/v1/media/${encodeURIComponent(mediaId)}/assets/${encodeURIComponent(assetId)}/data`
  return base ? `${base}${path}` : path
}

export async function uploadMediaSource(args: {
  mediaId: string
  kind: UploadMediaKind
  file: Blob
  replacePage?: string
  onProgress?: (ratio: number) => void
  signal?: AbortSignal
}): Promise<Media> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', uploadUrl(args.mediaId, args.kind, args.replacePage))
    xhr.withCredentials = true
    xhr.responseType = 'text'
    xhr.setRequestHeader('Content-Type', args.file.type || 'application/octet-stream')
    if (args.signal) {
      if (args.signal.aborted) {
        reject(new DOMException('Aborted', 'AbortError'))
        return
      }
      args.signal.addEventListener('abort', () => xhr.abort())
    }
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && args.onProgress) {
        args.onProgress(event.loaded / event.total)
      }
    }
    xhr.onload = async () => {
      if (xhr.status === 200) {
        try {
          resolve(JSON.parse(xhr.responseText) as Media)
        } catch {
          reject(new Error('upload_failed'))
        }
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
    xhr.onerror = () => reject(new Error('upload_failed'))
    xhr.onabort = () => reject(new DOMException('Aborted', 'AbortError'))
    xhr.send(args.file)
  })
}

export async function createUploadedMedia(args: {
  kind: 'image' | 'video' | 'audio' | 'slide_deck'
  title: string
  owner?: string
  isBackground?: boolean
  files: Blob[]
  onProgress?: (ratio: number) => void
  signal?: AbortSignal
}): Promise<Media> {
  const base = apiBase()
  const path = `/api/v1/media/uploads?${new URLSearchParams({ kind: args.kind }).toString()}`
  const form = new FormData()
  const metadata = {
    title: args.title,
    owner: args.owner,
    ...(args.isBackground ? { is_background: true } : {}),
  }
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }))
  for (const file of args.files) form.append('file', file)
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', base ? `${base}${path}` : path)
    xhr.withCredentials = true
    xhr.responseType = 'text'
    if (args.signal) {
      if (args.signal.aborted) {
        reject(new DOMException('Aborted', 'AbortError'))
        return
      }
      args.signal.addEventListener('abort', () => xhr.abort())
    }
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) args.onProgress?.(event.loaded / event.total)
    }
    xhr.onload = async () => {
      if (xhr.status === 201) {
        try {
          resolve(JSON.parse(xhr.responseText) as Media)
        } catch {
          reject(new Error('upload_failed'))
        }
        return
      }
      if (xhr.status === 413) {
        reject(new Error('payload_too_large'))
        return
      }
      try {
        const problem = await parseProblemResponse(new Response(xhr.responseText, {
          status: xhr.status,
          headers: { 'Content-Type': 'application/problem+json' },
        }))
        reject(new Error(problem?.detail ?? problem?.title ?? 'upload_failed'))
      } catch {
        reject(new Error('upload_failed'))
      }
    }
    xhr.onerror = () => reject(new Error('upload_failed'))
    xhr.onabort = () => reject(new DOMException('Aborted', 'AbortError'))
    xhr.send(form)
  })
}
