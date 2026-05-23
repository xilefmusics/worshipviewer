import { useCallback, useEffect, useRef, useState } from 'react'

import { resolveBlobObjectUrl, type BlobUrlStatus } from '@/lib/player/resolve-blob-url'

export type UseBlobUrlOptions = {
  allowNetworkFetch: boolean
}

export type UseBlobUrlResult = {
  url: string | null
  mime: string | null
  status: BlobUrlStatus
  retry: () => void
  cancel: () => void
}

export function useBlobUrl(blobId: string, { allowNetworkFetch }: UseBlobUrlOptions): UseBlobUrlResult {
  const [url, setUrl] = useState<string | null>(null)
  const [mime, setMime] = useState<string | null>(null)
  const [status, setStatus] = useState<BlobUrlStatus>('loading')
  const [pass, setPass] = useState(0)
  const abortRef = useRef<AbortController | null>(null)

  const cancel = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
  }, [])

  const retry = useCallback(() => {
    cancel()
    setPass((n) => n + 1)
  }, [cancel])

  useEffect(() => {
    let revoked: string | null = null
    let cancelled = false
    const controller = new AbortController()
    abortRef.current = controller

    void (async () => {
      setStatus('loading')
      setUrl(null)
      setMime(null)

      const result = await resolveBlobObjectUrl(blobId, allowNetworkFetch, controller.signal)
      if (cancelled) return

      if (result.status === 'ready') {
        revoked = result.objectUrl
        setMime(result.mime)
        setUrl(result.objectUrl)
        setStatus('ready')
        return
      }

      setStatus(result.status)
    })()

    return () => {
      cancelled = true
      controller.abort()
      if (revoked) URL.revokeObjectURL(revoked)
    }
  }, [blobId, allowNetworkFetch, pass])

  return { url, mime, status, retry, cancel }
}
