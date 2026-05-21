import { parseProblemResponse } from '@/api/problem'
import type { components } from '@/api/schema'

type Collection = components['schemas']['Collection']

function collectionCoverUrl(collectionId: string): string {
  const base = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '')
  const path = `/api/v1/collections/${encodeURIComponent(collectionId)}/cover`
  return base ? `${base}${path}` : path
}

/** Content-Type for `PUT /api/v1/collections/{id}/cover` (JPEG or PNG body). */
export function collectionCoverContentType(file: File): 'image/jpeg' | 'image/png' | null {
  const mime = file.type.toLowerCase().split(';')[0]?.trim() ?? ''
  if (mime === 'image/jpeg' || mime === 'image/jpg') return 'image/jpeg'
  if (mime === 'image/png') return 'image/png'
  const lower = file.name.toLowerCase()
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg'
  if (lower.endsWith('.png')) return 'image/png'
  return null
}

/**
 * Upload a collection cover image. Creates a blob, sets `cover`, and returns the updated collection.
 */
export async function putCollectionCover(
  collectionId: string,
  file: File,
  signal?: AbortSignal,
): Promise<Collection> {
  const contentType = collectionCoverContentType(file)
  if (!contentType) {
    throw new Error('unsupported_type')
  }

  const buf = await file.arrayBuffer()
  const res = await fetch(collectionCoverUrl(collectionId), {
    method: 'PUT',
    credentials: 'include',
    signal,
    headers: {
      'Content-Type': contentType,
    },
    body: buf,
  })

  if (res.ok) {
    return (await res.json()) as Collection
  }

  if (res.status === 413) {
    throw new Error('payload_too_large')
  }
  if (res.status === 400) {
    throw new Error('invalid_image')
  }

  const problem = await parseProblemResponse(res.clone())
  throw new Error(problem?.title ?? 'upload_failed')
}
