import { fetchBlobBinaryWithMime } from '@/api/blob-data'

export type BlobUrlStatus = 'loading' | 'ready' | 'error' | 'offline-unavailable'

export type ResolvedBlobUrl =
  | { status: 'ready'; objectUrl: string; mime: string | null }
  | { status: 'error' }
  | { status: 'offline-unavailable' }

export async function resolveBlobObjectUrl(
  blobId: string,
  allowNetworkFetch: boolean,
  signal?: AbortSignal,
): Promise<ResolvedBlobUrl> {
  if (!allowNetworkFetch) {
    return { status: 'offline-unavailable' }
  }

  const meta = await fetchBlobBinaryWithMime(blobId, signal)
  if (!meta) {
    return { status: 'error' }
  }

  const blob = new Blob([meta.buffer], { type: meta.mime ?? 'application/octet-stream' })
  return { status: 'ready', objectUrl: URL.createObjectURL(blob), mime: meta.mime }
}
