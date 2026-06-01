import { parseProblemResponse } from '@/api/problem'
import type { components } from '@/api/schema'
import { imageContentTypeFromBytes } from '@/lib/image-content-type'

type Team = components['schemas']['Team']

function teamCoverUrl(teamId: string): string {
  const base = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '')
  const path = `/api/v1/teams/${encodeURIComponent(teamId)}/cover`
  return base ? `${base}${path}` : path
}

/**
 * Upload a team cover image. Creates a blob, sets `cover`, and returns the updated team.
 */
export async function putTeamCover(
  teamId: string,
  file: File,
  signal?: AbortSignal,
): Promise<Team> {
  const buf = await file.arrayBuffer()
  const contentType = imageContentTypeFromBytes(buf)
  if (!contentType) {
    throw new Error('unsupported_type')
  }

  const res = await fetch(teamCoverUrl(teamId), {
    method: 'PUT',
    credentials: 'include',
    signal,
    headers: {
      'Content-Type': contentType,
    },
    body: buf,
  })

  if (res.ok) {
    return (await res.json()) as Team
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
