import type {
  AvPlaybackStatus,
  AvProjectionAckError,
  AvProjectionCommand,
  AvProjectionPlaybackAck,
  AvProjectionPlaybackAction,
  AvProjectionPlaybackIntent,
  AvProjectionTimedContent,
  AvUploadedProjectionContent,
} from '@/lib/player/av-projection-protocol'
import {
  isTimedProjectionContent,
  isUploadedProjectionContent,
} from '@/lib/player/av-projection-protocol'
import {
  sanitizeLivestreamStreamType,
  sanitizeLivestreamUrl,
  sanitizeWebPageUrl,
  sanitizeYoutubeVideoId,
} from '@/lib/player/av-remote-url'

export const DEFAULT_AV_PLAYBACK_VOLUME = 1
export const DEFAULT_AV_PLAYBACK_MUTED = false
export const DEFAULT_AV_PLAYBACK_LOOP = false
export const AV_PLAYBACK_ACK_MIN_INTERVAL_MS = 250

export const AV_PLAYBACK_ERROR_AUTOPLAY = 'autoplay_blocked'
export const AV_PLAYBACK_ERROR_MEDIA = 'media_error'
export const AV_PLAYBACK_ERROR_LOAD = 'load_failed'
export const AV_PLAYBACK_ERROR_DECODE = 'decode_error'
export const AV_PLAYBACK_ERROR_RANGE = 'range_failed'
export const AV_PLAYBACK_ERROR_PROVIDER_UNAVAILABLE = 'provider_unavailable'
export const AV_PLAYBACK_ERROR_PROVIDER = 'provider_error'
export const AV_PLAYBACK_ERROR_EMBED = 'embed_blocked'
export const AV_PLAYBACK_ERROR_UNSUPPORTED = 'unsupported_source'

export const AV_PLAYBACK_SEEKABLE_EPSILON_MS = 1000

export type AvTimedKind = 'video' | 'audio' | 'youtube' | 'livestream' | 'web_page'

export type AvTransportCapabilities = {
  play: boolean
  pause: boolean
  resume: boolean
  seek: boolean
  volume: boolean
  mute: boolean
  restart: boolean
  loop: boolean
}

export function formatAvClock(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

export type AvPlaybackIntentInput = {
  action: AvProjectionPlaybackAction
  volume?: number
  muted?: boolean
  loop?: boolean
  positionMs?: number
  issuedAtMs?: number
}

export function clampAvVolume(value: unknown, fallback = DEFAULT_AV_PLAYBACK_VOLUME): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.min(1, Math.max(0, value))
}

export function clampAvPositionMs(
  value: unknown,
  seekableStartMs = 0,
  seekableEndMs: number | null = null,
): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined
  const start = Number.isFinite(seekableStartMs) ? Math.max(0, seekableStartMs) : 0
  const unclamped = Math.max(0, value)
  if (seekableEndMs == null || !Number.isFinite(seekableEndMs)) {
    return Math.max(start, unclamped)
  }
  const end = Math.max(start, seekableEndMs)
  return Math.min(end, Math.max(start, unclamped))
}

export function buildAvPlaybackIntent(
  input: AvPlaybackIntentInput,
  seekable?: { startMs: number; endMs: number | null },
): AvProjectionPlaybackIntent {
  const positionMs =
    input.action === 'seek' || input.action === 'restart' || input.positionMs != null
      ? clampAvPositionMs(
          input.action === 'restart' ? 0 : input.positionMs,
          seekable?.startMs ?? 0,
          seekable?.endMs ?? null,
        )
      : undefined
  return {
    action: input.action,
    volume: clampAvVolume(input.volume),
    muted: Boolean(input.muted),
    loop: Boolean(input.loop),
    ...(positionMs != null ? { positionMs } : {}),
    ...(typeof input.issuedAtMs === 'number' && Number.isFinite(input.issuedAtMs)
      ? { issuedAtMs: input.issuedAtMs }
      : {}),
  }
}

export function normalizeAvPlaybackIntent(
  value: AvProjectionPlaybackIntent | undefined,
  seekable?: { startMs: number; endMs: number | null },
): AvProjectionPlaybackIntent | undefined {
  if (!value) return undefined
  return buildAvPlaybackIntent(value, seekable)
}

export function isUploadedAvKind(kind: string | undefined): kind is 'video' | 'audio' {
  return kind === 'video' || kind === 'audio'
}

export function isTimedAvKind(kind: string | undefined): kind is AvTimedKind {
  return (
    kind === 'video' ||
    kind === 'audio' ||
    kind === 'youtube' ||
    kind === 'livestream' ||
    kind === 'web_page'
  )
}

export function isWebPageAvKind(kind: string | undefined): kind is 'web_page' {
  return kind === 'web_page'
}

export type AvTimedItemFields = {
  kind?: string
  mediaId?: string
  assetId?: string
  thumbnailAssetId?: string
  videoId?: string
  canonicalUrl?: string
  url?: string
  streamType?: string
}

export function timedProjectionContentFromItem(
  item: AvTimedItemFields,
): AvProjectionTimedContent | null {
  if (isUploadedAvKind(item.kind) && item.mediaId && item.assetId) {
    return {
      type: item.kind,
      mediaId: item.mediaId,
      assetId: item.assetId,
      ...(item.kind === 'video' && item.thumbnailAssetId
        ? { thumbnailAssetId: item.thumbnailAssetId }
        : {}),
    }
  }
  if (item.kind === 'youtube') {
    const videoId = sanitizeYoutubeVideoId(item.videoId)
    const canonicalUrl = sanitizeAvCanonicalYoutubeUrl(item.canonicalUrl, videoId)
    if (!videoId || !canonicalUrl) return null
    return { type: 'youtube', videoId, canonicalUrl }
  }
  if (item.kind === 'livestream') {
    const url = sanitizeLivestreamUrl(item.url)
    const streamType = sanitizeLivestreamStreamType(item.streamType)
    if (!url || !streamType) return null
    return { type: 'livestream', url, streamType }
  }
  if (item.kind === 'web_page') {
    const url = sanitizeWebPageUrl(item.url)
    if (!url) return null
    return { type: 'web_page', url }
  }
  return null
}

function sanitizeAvCanonicalYoutubeUrl(value: unknown, videoId: string | null): string | null {
  if (!videoId) return null
  if (typeof value === 'string' && value.trim() === `https://www.youtube.com/watch?v=${videoId}`) {
    return value.trim()
  }
  return `https://www.youtube.com/watch?v=${videoId}`
}

export function playbackRangeIsSeekable(input: {
  seekableStartMs?: number
  seekableEndMs?: number
  durationMs?: number | null
} | null | undefined): boolean {
  if (!input) return false
  const start = input.seekableStartMs ?? 0
  const end = input.seekableEndMs ?? input.durationMs ?? 0
  if (!Number.isFinite(start) || !Number.isFinite(end)) return false
  return end - start >= AV_PLAYBACK_SEEKABLE_EPSILON_MS
}

export function transportCapabilitiesFromAck(
  kind: string | undefined,
  playback: {
    seekableStartMs?: number
    seekableEndMs?: number
    durationMs?: number | null
  } | null | undefined,
  projected = false,
): AvTransportCapabilities {
  const seekable = projected && playbackRangeIsSeekable(playback)
  if (kind === 'web_page') {
    return {
      play: true,
      pause: true,
      resume: false,
      seek: false,
      volume: false,
      mute: false,
      restart: projected,
      loop: false,
    }
  }
  if (kind === 'livestream') {
    return {
      play: true,
      pause: true,
      resume: true,
      seek: seekable,
      volume: true,
      mute: true,
      restart: seekable,
      loop: seekable,
    }
  }
  if (isTimedAvKind(kind)) {
    return {
      play: true,
      pause: true,
      resume: true,
      seek: seekable,
      volume: true,
      mute: true,
      restart: projected,
      loop: true,
    }
  }
  return {
    play: false,
    pause: false,
    resume: false,
    seek: false,
    volume: false,
    mute: false,
    restart: false,
    loop: false,
  }
}

export type AvOutputMediaActions = {
  play: boolean
  pause: boolean
  seekMs: number | null
  volume: number
  muted: boolean
  loop: boolean
  hide: boolean
  release: boolean
}

export function mediaActionsForCommand(
  command: AvProjectionCommand,
  durationMs: number | null = null,
  seekableEndMs: number | null = durationMs,
): AvOutputMediaActions | null {
  if (command.intent === 'clear' || !isTimedProjectionContent(command.content)) {
    return {
      play: false,
      pause: true,
      seekMs: null,
      volume: DEFAULT_AV_PLAYBACK_VOLUME,
      muted: DEFAULT_AV_PLAYBACK_MUTED,
      loop: DEFAULT_AV_PLAYBACK_LOOP,
      hide: true,
      release: true,
    }
  }
  const intent = normalizeAvPlaybackIntent(command.playback, {
    startMs: 0,
    endMs: seekableEndMs,
  })
  const hidden = command.screenState !== 'live'
  const volume = intent?.volume ?? DEFAULT_AV_PLAYBACK_VOLUME
  const muted = intent?.muted ?? DEFAULT_AV_PLAYBACK_MUTED
  const loop = intent?.loop ?? DEFAULT_AV_PLAYBACK_LOOP
  const restart = intent?.action === 'restart'
  const seekMs =
    restart
      ? 0
      : intent?.action === 'seek'
        ? (intent.positionMs ?? 0)
        : intent?.action === 'play' && intent.positionMs != null
          ? intent.positionMs
          : null
  const wantsPlay =
    !hidden &&
    (intent?.action === 'play' || intent?.action === 'resume' || restart)
  const wantsPause =
    hidden ||
    intent?.action === 'pause' ||
    !intent ||
    (!wantsPlay && intent.action !== 'seek' && intent.action !== 'configure')
  return {
    play: wantsPlay,
    pause: hidden || (wantsPause && !wantsPlay),
    seekMs,
    volume,
    muted,
    loop,
    hide: hidden,
    release: false,
  }
}

export function playbackAckFromElement(input: {
  status: AvPlaybackStatus
  currentTimeMs: number
  durationMs: number | null
  seekableStartMs?: number
  seekableEndMs?: number | null
  volume: number
  muted: boolean
  loop: boolean
}): AvProjectionPlaybackAck {
  const durationMs =
    typeof input.durationMs === 'number' && Number.isFinite(input.durationMs) && input.durationMs >= 0
      ? input.durationMs
      : null
  const seekableStartMs = clampAvPositionMs(input.seekableStartMs ?? 0, 0, durationMs) ?? 0
  const seekableEndMs =
    clampAvPositionMs(input.seekableEndMs ?? durationMs, seekableStartMs, durationMs) ??
    durationMs ??
    seekableStartMs
  return {
    status: input.status,
    currentTimeMs: clampAvPositionMs(input.currentTimeMs, seekableStartMs, seekableEndMs) ?? 0,
    durationMs,
    seekableStartMs,
    seekableEndMs,
    volume: clampAvVolume(input.volume),
    muted: Boolean(input.muted),
    loop: Boolean(input.loop),
  }
}

export function playbackAckChangedMaterially(
  previous: AvProjectionPlaybackAck | null | undefined,
  next: AvProjectionPlaybackAck,
): boolean {
  if (!previous) return true
  return (
    previous.status !== next.status ||
    previous.volume !== next.volume ||
    previous.muted !== next.muted ||
    previous.loop !== next.loop ||
    previous.durationMs !== next.durationMs ||
    previous.seekableStartMs !== next.seekableStartMs ||
    previous.seekableEndMs !== next.seekableEndMs
  )
}

export function shouldEmitPlaybackAck(
  previous: { at: number; ack: AvProjectionPlaybackAck } | null,
  next: AvProjectionPlaybackAck,
  now: number,
  force = false,
): boolean {
  if (force || !previous) return true
  if (playbackAckChangedMaterially(previous.ack, next)) return true
  return now - previous.at >= AV_PLAYBACK_ACK_MIN_INTERVAL_MS
}

export function playbackError(
  code: string,
  detail: string,
): AvProjectionAckError {
  return { code, detail }
}

export function uploadedContentFromCommand(
  command: AvProjectionCommand | null,
): AvUploadedProjectionContent | null {
  if (!command || !isUploadedProjectionContent(command.content)) return null
  return command.content
}

export function releaseMediaElement(el: HTMLMediaElement | null | undefined): void {
  if (!el) return
  el.pause()
  el.removeAttribute('src')
  el.load()
}

export function mediaErrorCode(el: HTMLMediaElement): string {
  const code = el.error?.code
  if (code === 3) return AV_PLAYBACK_ERROR_DECODE
  if (code === 2) return AV_PLAYBACK_ERROR_RANGE
  if (code === 4) return AV_PLAYBACK_ERROR_LOAD
  return AV_PLAYBACK_ERROR_MEDIA
}

export function youtubeProviderErrorCode(youtubeError: number): string {
  if (youtubeError === 101 || youtubeError === 150) return AV_PLAYBACK_ERROR_EMBED
  return AV_PLAYBACK_ERROR_PROVIDER
}

export const AV_PLAYBACK_ERROR_DETAIL: Record<string, string> = {
  [AV_PLAYBACK_ERROR_AUTOPLAY]: 'The browser blocked playback.',
  [AV_PLAYBACK_ERROR_MEDIA]: 'The media could not be played.',
  [AV_PLAYBACK_ERROR_LOAD]: 'The media could not be loaded.',
  [AV_PLAYBACK_ERROR_DECODE]: 'The media could not be decoded.',
  [AV_PLAYBACK_ERROR_RANGE]: 'The media range could not be read.',
  [AV_PLAYBACK_ERROR_PROVIDER_UNAVAILABLE]: 'The playback provider is unavailable.',
  [AV_PLAYBACK_ERROR_PROVIDER]: 'The playback provider reported an error.',
  [AV_PLAYBACK_ERROR_EMBED]: 'This source cannot be embedded.',
  [AV_PLAYBACK_ERROR_UNSUPPORTED]: 'This source is not supported in this browser.',
}

export function safePlaybackError(code: string): AvProjectionAckError {
  return playbackError(code, AV_PLAYBACK_ERROR_DETAIL[code] ?? AV_PLAYBACK_ERROR_DETAIL[AV_PLAYBACK_ERROR_MEDIA])
}
