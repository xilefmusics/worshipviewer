import type { CreateMediaContent, Media } from '@/api/media'

export type UrlMediaKind = 'youtube' | 'spotify'
export type UploadMediaKind = 'image' | 'video' | 'audio' | 'slide_deck'
export type CreateMediaKind = UrlMediaKind | UploadMediaKind
export type MediaDisplayKind = CreateMediaKind | 'livestream' | 'web_page' | 'unknown'
export type AssetUploadKind = 'video' | 'audio' | 'image' | 'pdf' | 'svg'

const URL_KINDS = new Set<UrlMediaKind>(['youtube', 'spotify'])
const UPLOAD_KINDS = new Set<UploadMediaKind>(['image', 'video', 'audio', 'slide_deck'])

export function isUrlMediaKind(value: string): value is UrlMediaKind {
  return URL_KINDS.has(value as UrlMediaKind)
}

export function isUploadMediaKind(value: string): value is UploadMediaKind {
  return UPLOAD_KINDS.has(value as UploadMediaKind)
}

export function isCreateMediaKind(value: string): value is CreateMediaKind {
  return isUrlMediaKind(value) || isUploadMediaKind(value)
}

export function mediaDisplayKind(media: Media): MediaDisplayKind {
  const type = media.content.type
  switch (type) {
    case 'youtube':
    case 'spotify':
    case 'livestream':
    case 'web_page':
    case 'slide_deck':
    case 'image':
    case 'video':
    case 'audio':
      return type
    default:
      return 'unknown'
  }
}

export function isUploadedDisplayKind(kind: MediaDisplayKind): boolean {
  return kind === 'image' || kind === 'video' || kind === 'audio' || kind === 'slide_deck'
}

export function mediaCanonicalUrl(media: Media): string | null {
  const content = media.content
  switch (content.type) {
    case 'youtube':
    case 'spotify':
      return content.canonical_url
    case 'livestream':
    case 'web_page':
      return content.url
    default:
      return null
  }
}

export function urlContent(kind: UrlMediaKind, url: string): CreateMediaContent {
  return { type: kind, url }
}

export function isValidUrlMediaInput(kind: UrlMediaKind, rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl.trim())
    if (url.protocol !== 'https:' || url.username || url.password) return false
    if (!url.hostname) return false
    const host = url.hostname.toLowerCase().replace(/^www\./, '')
    if (kind === 'spotify') return host === 'open.spotify.com'
    return host === 'youtube.com' || host === 'm.youtube.com' || host === 'youtu.be'
  } catch {
    return false
  }
}

export function sniffAssetUploadKind(file: { type?: string; name?: string }): AssetUploadKind | null {
  const type = (file.type ?? '').toLowerCase()
  const name = (file.name ?? '').toLowerCase()
  if (type === 'application/pdf' || name.endsWith('.pdf')) return 'pdf'
  if (type === 'image/svg+xml' || name.endsWith('.svg')) return 'svg'
  if (type === 'image/png' || type === 'image/jpeg' || type === 'image/jpg' || name.endsWith('.png') || name.endsWith('.jpg') || name.endsWith('.jpeg')) {
    return 'image'
  }
  if (type.startsWith('video/')) return 'video'
  if (type.startsWith('audio/')) return 'audio'
  return null
}

export function formatMediaDuration(durationMs: number): string {
  const totalSeconds = Math.max(0, Math.round(durationMs / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}
