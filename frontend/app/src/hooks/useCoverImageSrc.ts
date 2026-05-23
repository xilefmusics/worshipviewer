import { useEffect, useState } from 'react'

import { fetchBlobImageData } from '@/api/blob-data'

export function isHttpImageUrl(s: string): boolean {
  const t = s.trim()
  return t.startsWith('https://') || t.startsWith('http://')
}

/**
 * `cover` from API: full URL, or blob id → fetch `/api/v1/blobs/{id}/data` and `createObjectURL`.
 */
export function useCoverImageSrc(cover: string) {
  const trimmed = cover.trim()
  const [objectUrl, setObjectUrl] = useState<string | null>(null)
  const [failedHttpSrc, setFailedHttpSrc] = useState<string | null>(null)

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setFailedHttpSrc(null)

    if (!trimmed || isHttpImageUrl(trimmed)) {
      setObjectUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev)
        return null
      })
      return
    }

    const ac = new AbortController()

    void (async () => {
      try {
        const blob = await fetchBlobImageData(trimmed, ac.signal)
        if (ac.signal.aborted || !blob) return
        const url = URL.createObjectURL(blob)
        setObjectUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev)
          return url
        })
      } catch {
        // abort / network
      }
    })()

    return () => {
      ac.abort()
      setObjectUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev)
        return null
      })
    }
  }, [trimmed])
  /* eslint-enable react-hooks/set-state-in-effect */

  const httpSrc = isHttpImageUrl(trimmed) && failedHttpSrc !== trimmed ? trimmed : null
  const src = httpSrc ?? objectUrl

  return {
    src,
    onImageError: () => {
      if (isHttpImageUrl(trimmed)) setFailedHttpSrc(trimmed)
    },
  }
}
