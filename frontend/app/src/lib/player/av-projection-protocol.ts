import type { AvLyricLine } from '@/lib/player/av-lyric-slides'
import {
  effectiveAvTransition,
  type AvBackgroundLayer,
  type AvContentLayer,
  type AvProjectionPayload,
  type AvScreenState,
  type AvTransition,
} from '@/lib/player/av-preferences'

export const AV_PROJECTION_PROTOCOL_VERSION = 1 as const

export type AvProjectionCommandId = number

export type AvProjectionPlaybackAction =
  | 'play'
  | 'pause'
  | 'resume'
  | 'seek'
  | 'restart'
  | 'configure'

export type AvProjectionPlaybackIntent = {
  action: AvProjectionPlaybackAction
  volume: number
  muted: boolean
  loop: boolean
  positionMs?: number
  /** Timing anchor for future transport; not used for multi-output sync. */
  issuedAtMs?: number
}

export type AvPlaybackStatus = 'loading' | 'playing' | 'paused' | 'ended' | 'error'

export type AvProjectionPlaybackAck = {
  status: AvPlaybackStatus
  currentTimeMs: number
  durationMs: number | null
  seekableStartMs: number
  seekableEndMs: number
  volume: number
  muted: boolean
  loop: boolean
}

export type AvLivestreamStreamType = 'hls' | 'direct'

/** Timed projection payloads for uploaded and remote media. */
export type AvProjectionTimedContent =
  | { type: 'video'; mediaId: string; assetId: string; thumbnailAssetId?: string }
  | { type: 'audio'; mediaId: string; assetId: string }
  | { type: 'youtube'; videoId: string; canonicalUrl: string }
  | { type: 'livestream'; url: string; streamType: AvLivestreamStreamType }
  | { type: 'web_page'; url: string }

export type AvProjectionStaticContent =
  | { type: 'lyrics'; contentText: string; contentLines?: AvLyricLine[] }
  | { type: 'deck_page'; mediaId: string; assetId: string }
  | { type: 'empty' }

export type AvProjectionContent = AvProjectionStaticContent | AvProjectionTimedContent

export type AvProjectionCommand = {
  type: 'command'
  v: typeof AV_PROJECTION_PROTOCOL_VERSION
  sessionId: string
  commandId: AvProjectionCommandId
  intent: 'replace' | 'clear'
  screenState: AvScreenState
  backgroundLayer: AvBackgroundLayer
  contentLayer: AvContentLayer
  transition: AvTransition
  itemTitle: string
  nextPreview: string | null
  content: AvProjectionContent
  playback?: AvProjectionPlaybackIntent
}

export type AvProjectionAckCurrent = {
  screenState: AvScreenState
  content: AvProjectionContent
}

export type AvProjectionAckError = {
  code: string
  detail: string
}

export type AvProjectionAck = {
  type: 'ack'
  sessionId: string
  commandId: AvProjectionCommandId
  outputId: string
  applied: boolean
  current: AvProjectionAckCurrent
  error?: AvProjectionAckError
  playback?: AvProjectionPlaybackAck
}

export type AvProjectionPresence = {
  type: 'hello' | 'heartbeat' | 'goodbye'
  sessionId: string
  outputId: string
  ready: boolean
}

export type AvProjectionMessage = AvProjectionCommand | AvProjectionAck | AvProjectionPresence

export function avProjectionContentKey(content: AvProjectionContent): string {
  switch (content.type) {
    case 'lyrics':
      return `lyrics:${content.contentText}:${JSON.stringify(content.contentLines ?? null)}`
    case 'deck_page':
      return `deck_page:${content.mediaId}:${content.assetId}`
    case 'empty':
      return 'empty'
    case 'video':
      return `video:${content.mediaId}:${content.assetId}:${content.thumbnailAssetId ?? ''}`
    case 'audio':
      return `audio:${content.mediaId}:${content.assetId}`
    case 'youtube':
      return `youtube:${content.videoId}`
    case 'livestream':
      return `livestream:${content.streamType}:${content.url}`
    case 'web_page':
      return `web_page:${content.url}`
  }
}

export function sameAvProjectionContent(
  left: AvProjectionContent,
  right: AvProjectionContent,
): boolean {
  return avProjectionContentKey(left) === avProjectionContentKey(right)
}

export function isAvProjectionCommand(value: unknown): value is AvProjectionCommand {
  if (!value || typeof value !== 'object') return false
  const row = value as Partial<AvProjectionCommand>
  return row.type === 'command' && row.v === AV_PROJECTION_PROTOCOL_VERSION && typeof row.commandId === 'number'
}

export function isAvProjectionAck(value: unknown): value is AvProjectionAck {
  if (!value || typeof value !== 'object') return false
  const row = value as Partial<AvProjectionAck>
  return row.type === 'ack' && typeof row.commandId === 'number' && typeof row.outputId === 'string'
}

export function isAvProjectionPresence(value: unknown): value is AvProjectionPresence {
  if (!value || typeof value !== 'object') return false
  const row = value as Partial<AvProjectionPresence>
  return (
    (row.type === 'hello' || row.type === 'heartbeat' || row.type === 'goodbye') &&
    typeof row.outputId === 'string'
  )
}

export function parseAvProjectionMessage(value: unknown): AvProjectionMessage | null {
  if (isAvProjectionCommand(value) || isAvProjectionAck(value) || isAvProjectionPresence(value)) {
    return value
  }
  return null
}

function isLegacyProjectionPayload(value: unknown): value is AvProjectionPayload {
  if (!value || typeof value !== 'object') return false
  const row = value as Partial<AvProjectionPayload> & { type?: unknown }
  return typeof row.contentText === 'string' && row.type !== 'command' && row.type !== 'ack'
}

export function legacyPayloadToCommand(
  payload: AvProjectionPayload,
  sessionId: string,
  commandId: AvProjectionCommandId = 0,
): AvProjectionCommand {
  return {
    type: 'command',
    v: AV_PROJECTION_PROTOCOL_VERSION,
    sessionId,
    commandId,
    intent: 'replace',
    screenState: payload.screenState,
    backgroundLayer: payload.backgroundLayer,
    contentLayer: payload.contentLayer,
    transition: payload.transition,
    itemTitle: payload.itemTitle,
    nextPreview: payload.nextPreview,
    content: {
      type: 'lyrics',
      contentText: payload.contentText,
      ...(payload.contentLines && payload.contentLines.length > 0
        ? { contentLines: payload.contentLines }
        : {}),
    },
  }
}

export function parseAvProjectionCommandSnapshot(
  value: unknown,
  sessionId: string,
): AvProjectionCommand | null {
  if (isAvProjectionCommand(value)) return value
  if (isLegacyProjectionPayload(value)) return legacyPayloadToCommand(value, sessionId)
  return null
}

export function buildAvProjectionCommand(input: {
  sessionId: string
  commandId: AvProjectionCommandId
  intent?: 'replace' | 'clear'
  content: AvProjectionContent
  contentLayer: AvContentLayer
  backgroundLayer: AvBackgroundLayer
  transition: AvTransition
  screenState: AvScreenState
  itemTitle: string
  nextPreview: string | null
  prefersReducedMotion?: boolean
  playback?: AvProjectionPlaybackIntent
}): AvProjectionCommand {
  const content =
    input.intent === 'clear'
      ? ({ type: 'empty' } satisfies AvProjectionContent)
      : input.content
  return {
    type: 'command',
    v: AV_PROJECTION_PROTOCOL_VERSION,
    sessionId: input.sessionId,
    commandId: input.commandId,
    intent: input.intent ?? 'replace',
    screenState: input.screenState,
    backgroundLayer: input.backgroundLayer,
    contentLayer: input.contentLayer,
    transition: effectiveAvTransition(
      input.transition,
      input.prefersReducedMotion ?? false,
    ),
    itemTitle: input.itemTitle,
    nextPreview: input.nextPreview,
    content,
    ...(input.playback ? { playback: input.playback } : {}),
  }
}

export function lyricsPayloadFromCommand(
  command: AvProjectionCommand,
): AvProjectionPayload | null {
  if (command.content.type === 'deck_page' || isTimedProjectionContent(command.content)) {
    return null
  }
  const contentText = command.content.type === 'lyrics' ? command.content.contentText : ''
  const contentLines =
    command.screenState === 'live' && command.content.type === 'lyrics'
      ? command.content.contentLines
      : undefined
  return {
    contentText,
    ...(contentLines && contentLines.length > 0 ? { contentLines } : {}),
    contentLayer: command.contentLayer,
    backgroundLayer: command.backgroundLayer,
    transition: command.transition,
    screenState: command.screenState,
    itemTitle: command.itemTitle,
    nextPreview: command.nextPreview,
  }
}

export function isTimedProjectionContent(
  content: AvProjectionContent,
): content is AvProjectionTimedContent {
  return (
    content.type === 'video' ||
    content.type === 'audio' ||
    content.type === 'youtube' ||
    content.type === 'livestream' ||
    content.type === 'web_page'
  )
}

export type AvUploadedProjectionContent = Extract<
  AvProjectionTimedContent,
  { type: 'video' } | { type: 'audio' }
>

export function isUploadedProjectionContent(
  content: AvProjectionContent,
): content is AvUploadedProjectionContent {
  return content.type === 'video' || content.type === 'audio'
}

export function slideViewPropsFromCommand(command: AvProjectionCommand): {
  contentText?: string
  contentLines?: AvLyricLine[]
  deckPage?: { mediaId: string; assetId: string }
} {
  if (command.content.type === 'lyrics') {
    return {
      contentText: command.content.contentLines?.length ? undefined : command.content.contentText,
      contentLines: command.content.contentLines,
    }
  }
  if (command.content.type === 'deck_page') {
    return {
      deckPage: { mediaId: command.content.mediaId, assetId: command.content.assetId },
    }
  }
  return { contentText: '' }
}
