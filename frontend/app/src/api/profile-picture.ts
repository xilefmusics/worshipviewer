import { parseProblemResponse } from '@/api/problem'
import type { User } from '@/api/session'
import { imageContentTypeFromBytes } from '@/lib/image-content-type'

function profilePictureUrl(): string {
  const base = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '')
  const path = '/api/v1/users/me/profile-picture'
  return base ? `${base}${path}` : path
}

async function parseUserJson(res: Response): Promise<User> {
  const data = (await res.json()) as User
  return data
}

/** Replace the signed-in user’s uploaded profile picture; returns updated `User`. */
export async function putProfilePicture(file: File, signal?: AbortSignal): Promise<User> {
  const buf = await file.arrayBuffer()
  const contentType = imageContentTypeFromBytes(buf)
  if (!contentType) {
    throw new Error('unsupported_type')
  }

  const res = await fetch(profilePictureUrl(), {
    method: 'PUT',
    credentials: 'include',
    signal,
    headers: {
      'Content-Type': contentType,
    },
    body: buf,
  })

  if (res.ok) {
    try {
      return await parseUserJson(res)
    } catch {
      throw new Error('invalid_response')
    }
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

/** Clears an uploaded profile picture if any; returns updated `User`. */
export async function deleteUploadedProfilePicture(signal?: AbortSignal): Promise<User> {
  const res = await fetch(profilePictureUrl(), {
    method: 'DELETE',
    credentials: 'include',
    signal,
  })

  if (res.ok) {
    return parseUserJson(res)
  }

  const problem = await parseProblemResponse(res.clone())
  throw new Error(problem?.title ?? 'remove_failed')
}
