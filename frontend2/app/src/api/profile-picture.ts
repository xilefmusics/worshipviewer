import { parseProblemResponse } from '@/api/problem'
import type { User } from '@/api/session'

function profilePictureUrl(): string {
  const base = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '')
  const path = '/api/v1/users/me/profile-picture'
  return base ? `${base}${path}` : path
}

/** Content-Type for `PUT /api/v1/users/me/profile-picture` (JPEG or PNG body). */
function profilePictureContentType(file: File): 'image/jpeg' | 'image/png' | null {
  const mime = file.type.toLowerCase().split(';')[0]?.trim() ?? ''
  if (mime === 'image/jpeg' || mime === 'image/jpg') return 'image/jpeg'
  if (mime === 'image/png') return 'image/png'
  const lower = file.name.toLowerCase()
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg'
  if (lower.endsWith('.png')) return 'image/png'
  return null
}

async function parseUserJson(res: Response): Promise<User> {
  const data = (await res.json()) as User
  return data
}

/** Replace the signed-in user’s uploaded profile picture; returns updated `User`. */
export async function putProfilePicture(file: File, signal?: AbortSignal): Promise<User> {
  const contentType = profilePictureContentType(file)
  if (!contentType) {
    throw new Error('unsupported_type')
  }

  const buf = await file.arrayBuffer()
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
    return parseUserJson(res)
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
