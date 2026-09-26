import type { AvLyricLine } from '@/lib/player/av-lyric-slides'
import { getLocalStorage, safeGetItem, safeSetItem } from '@/lib/browser-storage'
import type { PlayerMode } from '@/lib/player/player-mode'

export type AvTextAlign = 'left' | 'center' | 'right'
export type AvVerticalAlign = 'top' | 'center' | 'bottom'
export type AvHorizontalAlign = 'left' | 'center' | 'right'
export type AvTextShadow = 'none' | 'subtle' | 'medium' | 'strong'
export type AvTextTransform = 'none' | 'uppercase' | 'lowercase' | 'capitalize'
/** Preset IDs retained for saved preference compatibility; Ray (2) is the only built-in choice. */
export type AvBackgroundPreset = 0 | 1 | 2 | 3 | 4
export type AvTransitionStyle = 'none' | 'fade' | 'slide'
export type AvScreenState = 'live' | 'blank' | 'blackout'

export const AV_BACKGROUND_PRESETS = [2] as const satisfies readonly AvBackgroundPreset[]
export const AV_TEXT_LIGHTNESS_MIN = 0
export const AV_TEXT_LIGHTNESS_MAX = 100
export const AV_TEXT_SHADOW_LIGHT_THRESHOLD = 50

export type AvContentLayer = {
  maxLinesPerSlide: number
  balanceSlideLines: boolean
  fontSize: number
  textAlign: AvTextAlign
  verticalAlign: AvVerticalAlign
  horizontalAlign: AvHorizontalAlign
  textShadow: AvTextShadow
  textTransform: AvTextTransform
  primaryTextLightness: number
  secondaryTextLightness: number
}

export type AvBackgroundLayer = {
  preset: AvBackgroundPreset
  image?: {
    mediaId: string
    assetId: string
  }
}

export type AvTransition = {
  style: AvTransitionStyle
  durationMs: number
}

export type AvProjectionPrefs = {
  outputFullscreenOnDblClick: boolean
}

export type AvLyricSplitPrefs = Pick<AvContentLayer, 'maxLinesPerSlide' | 'balanceSlideLines'> & {
  collapseLyricWhitespace: boolean
}

export type AvPreferences = {
  contentLayer: AvContentLayer
  backgroundLayer: AvBackgroundLayer
  transition: AvTransition
  projection: AvProjectionPrefs
}

export const AV_PREFERENCES_STORAGE_KEY = 'avPreferences'

export const DEFAULT_AV_PREFERENCES: AvPreferences = {
  contentLayer: {
    maxLinesPerSlide: 2,
    balanceSlideLines: true,
    fontSize: 60,
    textAlign: 'center',
    verticalAlign: 'center',
    horizontalAlign: 'center',
    textShadow: 'none',
    textTransform: 'uppercase',
    primaryTextLightness: 100,
    secondaryTextLightness: 65,
  },
  backgroundLayer: {
    preset: 2,
  },
  transition: {
    style: 'none',
    durationMs: 0,
  },
  projection: {
    outputFullscreenOnDblClick: true,
  },
}

function clampNumber(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(min, Math.trunc(value)))
}

export function resolveAvTextLightness(value: unknown, fallback: number): number {
  return clampNumber(value, fallback, AV_TEXT_LIGHTNESS_MIN, AV_TEXT_LIGHTNESS_MAX)
}

function parseEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T,
): T {
  return allowed.includes(value as T) ? (value as T) : fallback
}

export function normalizeAvBackgroundPreset(value: unknown): AvBackgroundPreset {
  const num = typeof value === 'number' ? value : Number.parseInt(String(value ?? ''), 10)
  return AV_BACKGROUND_PRESETS.find((preset) => preset === num)
    ?? DEFAULT_AV_PREFERENCES.backgroundLayer.preset
}

function mergeContentLayer(raw: Partial<AvContentLayer> | undefined): AvContentLayer {
  const defaults = DEFAULT_AV_PREFERENCES.contentLayer
  return {
    maxLinesPerSlide: clampNumber(raw?.maxLinesPerSlide, defaults.maxLinesPerSlide, 1, 10),
    balanceSlideLines: raw?.balanceSlideLines ?? defaults.balanceSlideLines,
    fontSize: clampNumber(raw?.fontSize, defaults.fontSize, 20, 120),
    textAlign: parseEnum(raw?.textAlign, ['left', 'center', 'right'], defaults.textAlign),
    verticalAlign: parseEnum(
      raw?.verticalAlign,
      ['top', 'center', 'bottom'],
      defaults.verticalAlign,
    ),
    horizontalAlign: parseEnum(
      raw?.horizontalAlign,
      ['left', 'center', 'right'],
      defaults.horizontalAlign,
    ),
    textShadow: parseEnum(
      raw?.textShadow,
      ['none', 'subtle', 'medium', 'strong'],
      defaults.textShadow,
    ),
    textTransform: parseEnum(
      raw?.textTransform,
      ['none', 'uppercase', 'lowercase', 'capitalize'],
      defaults.textTransform,
    ),
    primaryTextLightness: resolveAvTextLightness(
      raw?.primaryTextLightness,
      defaults.primaryTextLightness,
    ),
    secondaryTextLightness: resolveAvTextLightness(
      raw?.secondaryTextLightness,
      defaults.secondaryTextLightness,
    ),
  }
}

function mergeBackgroundLayer(raw: Partial<AvBackgroundLayer> & Record<string, unknown> | undefined): AvBackgroundLayer {
  const defaults = DEFAULT_AV_PREFERENCES.backgroundLayer
  if (raw?.preset !== undefined) {
    const preset = normalizeAvBackgroundPreset(raw.preset)
    const image = raw.image as { mediaId?: unknown; assetId?: unknown } | undefined
    if (
      image &&
      typeof image.mediaId === 'string' &&
      image.mediaId.trim() &&
      typeof image.assetId === 'string' &&
      image.assetId.trim()
    ) {
      return { preset, image: { mediaId: image.mediaId, assetId: image.assetId } }
    }
    return { preset }
  }
  // Migrate earlier free-form background settings.
  if (typeof raw?.kind === 'string') {
    return { preset: 2 }
  }
  return defaults
}

function mergeTransition(raw: Partial<AvTransition> | undefined): AvTransition {
  const defaults = DEFAULT_AV_PREFERENCES.transition
  return {
    style: parseEnum(raw?.style, ['none', 'fade', 'slide'], defaults.style),
    durationMs: clampNumber(raw?.durationMs, defaults.durationMs, 0, 2000),
  }
}

function mergeProjection(raw: Partial<AvProjectionPrefs> | undefined): AvProjectionPrefs {
  const defaults = DEFAULT_AV_PREFERENCES.projection
  return {
    outputFullscreenOnDblClick:
      raw?.outputFullscreenOnDblClick ?? defaults.outputFullscreenOnDblClick,
  }
}

export function readAvPreferences(
  storage: Pick<Storage, 'getItem'> | null = getLocalStorage(),
): AvPreferences {
  try {
    const raw = safeGetItem(AV_PREFERENCES_STORAGE_KEY, storage)
    if (!raw) return DEFAULT_AV_PREFERENCES
    const parsed = JSON.parse(raw) as Partial<AvPreferences>
    return {
      contentLayer: mergeContentLayer(parsed.contentLayer),
      backgroundLayer: mergeBackgroundLayer(parsed.backgroundLayer),
      transition: mergeTransition(parsed.transition),
      projection: mergeProjection(parsed.projection),
    }
  } catch {
    return DEFAULT_AV_PREFERENCES
  }
}

export function writeAvPreferences(
  prefs: AvPreferences,
  storage: Pick<Storage, 'setItem'> | null = getLocalStorage(),
): void {
  safeSetItem(AV_PREFERENCES_STORAGE_KEY, JSON.stringify(prefs), storage)
}

export function effectiveAvTransition(
  transition: AvTransition,
  prefersReducedMotion: boolean,
): AvTransition {
  if (!prefersReducedMotion) return transition
  return { ...transition, style: 'none', durationMs: 0 }
}

export type AvProjectionPayload = {
  contentText: string
  contentLines?: AvLyricLine[]
  contentLayer: AvContentLayer
  backgroundLayer: AvBackgroundLayer
  transition: AvTransition
  screenState: AvScreenState
  itemTitle: string
  nextPreview: string | null
}

export function buildAvProjectionPayload(input: {
  contentText: string
  contentLines?: AvLyricLine[]
  contentLayer: AvContentLayer
  backgroundLayer: AvBackgroundLayer
  transition: AvTransition
  screenState?: AvScreenState
  /** @deprecated Use screenState instead. */
  blackout?: boolean
  itemTitle: string
  nextPreview: string | null
  prefersReducedMotion?: boolean
}): AvProjectionPayload {
  const screenState =
    input.screenState ?? (input.blackout ? 'blackout' : 'live')
  const contentLines =
    screenState === 'live' && input.contentLines && input.contentLines.length > 0
      ? input.contentLines
      : undefined
  return {
    contentText: input.contentText,
    ...(contentLines ? { contentLines } : {}),
    contentLayer: input.contentLayer,
    backgroundLayer: input.backgroundLayer,
    transition: effectiveAvTransition(
      input.transition,
      input.prefersReducedMotion ?? false,
    ),
    screenState,
    itemTitle: input.itemTitle,
    nextPreview: input.nextPreview,
  }
}

/** Settings tab writes the default Sheet/AV selection via player-mode-preference; re-export for convenience. */
export type { PlayerMode }
