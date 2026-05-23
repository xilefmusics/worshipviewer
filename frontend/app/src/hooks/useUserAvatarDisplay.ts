import { useEffect, useState } from 'react'

import { resolveProfileAvatar } from '@/api/resolve-profile-avatar'
import type { User } from '@/api/session'
import { emailInitials } from '@/lib/user-avatar'

/**
 * Profile image: fetches `avatar_blob_id` then `oauth_avatar_blob_id` via blob data endpoint; falls back to two-letter initials from email.
 */
export function useUserAvatarDisplay(user: User) {
  const [resolved, setResolved] = useState<{
    src: string
    revoke: (() => void) | null
  } | null>(null)
  const [failedSrc, setFailedSrc] = useState<string | null>(null)

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const ac = new AbortController()

    setResolved((prev) => {
      if (prev?.revoke) prev.revoke()
      return null
    })
    setFailedSrc(null)

    const fields = {
      avatar_blob_id: user.avatar_blob_id,
      oauth_avatar_blob_id: user.oauth_avatar_blob_id,
    }

    void (async () => {
      try {
        const r = await resolveProfileAvatar(fields, ac.signal)
        if (ac.signal.aborted) {
          if (r?.revoke) r.revoke()
          return
        }
        if (!r) {
          setResolved(null)
          return
        }
        setResolved({ src: r.src, revoke: r.revoke })
      } catch {
        // network / abort
      }
    })()

    return () => {
      ac.abort()
      setResolved((prev) => {
        if (prev?.revoke) prev.revoke()
        return null
      })
    }
  }, [user.avatar_blob_id, user.oauth_avatar_blob_id])
  /* eslint-enable react-hooks/set-state-in-effect */

  const imageSrc = resolved && failedSrc !== resolved.src ? resolved.src : null

  return {
    imageSrc,
    onImageError: () => {
      if (resolved?.src) setFailedSrc(resolved.src)
    },
    initials: emailInitials(user.email),
  }
}
