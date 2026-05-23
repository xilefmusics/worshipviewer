import { parseProblemResponse } from '@/api/problem'
import type { components } from '@/api/schema'
import { imageContentTypeFromBytes } from '@/lib/image-content-type'

type Collection = components['schemas']['Collection']

function collectionCoverUrl(collectionId: string): string {
  const base = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '')
  const path = `/api/v1/collections/${encodeURIComponent(collectionId)}/cover`
  return base ? `${base}${path}` : path
}

/**
 * Upload a collection cover image. Creates a blob, sets `cover`, and returns the updated collection.
 */
export async function putCollectionCover(
  collectionId: string,
  file: File,
  signal?: AbortSignal,
): Promise<Collection> {
  const buf = await file.arrayBuffer()
  const contentType = imageContentTypeFromBytes(buf)
  if (!contentType) {
    throw new Error('unsupported_type')
  }

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
