import type { User } from '@/api/session'

export type AvatarPlan = { type: 'blob'; id: string } | { type: 'none' }

/** User-uploaded avatar blob id, else backend-cached OAuth avatar blob id. */
export function resolveAvatarPlan(user: User): AvatarPlan {
  const primary = user.avatar_blob_id?.trim()
  if (primary) return { type: 'blob', id: primary }
  const oauth = user.oauth_avatar_blob_id?.trim()
  if (oauth) return { type: 'blob', id: oauth }
  return { type: 'none' }
}

/** First two characters of the email (trimmed), uppercased; single char duplicated if length is 1. */
export function emailInitials(email: string): string {
  const s = email.trim()
  if (s.length === 0) return '?'
  if (s.length === 1) return s.toUpperCase()
  return s.slice(0, 2).toUpperCase()
}
