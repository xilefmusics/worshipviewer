import { fetchBlobImageData } from '@/api/blob-data'
import type { User } from '@/api/session'

export type ProfileAvatarFields = Pick<User, 'avatar_blob_id' | 'oauth_avatar_blob_id'>

export type ResolvedProfileAvatar =
  | { kind: 'src'; src: string; revoke: (() => void) | null }
  | null

function objectUrlFromBlob(blob: Blob): ResolvedProfileAvatar {
  const src = URL.createObjectURL(blob)
  return { kind: 'src', src, revoke: () => URL.revokeObjectURL(src) }
}

async function loadStoredAvatarBlob(
  id: string | null | undefined,
  signal?: AbortSignal,
): Promise<ResolvedProfileAvatar> {
  const t = typeof id === 'string' ? id.trim() : ''
  if (!t) return null
  const blob = await fetchBlobImageData(t, signal)
  if (signal?.aborted) return null
  return blob ? objectUrlFromBlob(blob) : null
}

/**
 * Profile avatars: `GET /api/v1/blobs/{id}/data` for `avatar_blob_id`, then `oauth_avatar_blob_id`.
 * (Same binary fetch path as collection covers for non-URL refs.)
 */
export async function resolveProfileAvatar(
  fields: ProfileAvatarFields,
  signal?: AbortSignal,
): Promise<ResolvedProfileAvatar> {
  const primary = await loadStoredAvatarBlob(fields.avatar_blob_id, signal)
  if (primary) return primary

  return loadStoredAvatarBlob(fields.oauth_avatar_blob_id, signal)
}
