import type { PlayerMode } from '@/lib/player/player-mode'

export type AvTextAlign = 'left' | 'center' | 'right'
export type AvVerticalAlign = 'top' | 'center' | 'bottom'
export type AvHorizontalAlign = 'left' | 'center' | 'right'
export type AvTextShadow = 'none' | 'subtle' | 'medium' | 'strong'
export type AvTextTransform = 'none' | 'uppercase' | 'lowercase' | 'capitalize'
export type AvBackgroundKind = 'color' | 'gradient' | 'image' | 'video'
export type AvTransitionStyle = 'none' | 'fade' | 'slide'

export type AvContentLayer = {
  maxLinesPerSlide: number
  fontSize: number
  textAlign: AvTextAlign
  verticalAlign: AvVerticalAlign
  horizontalAlign: AvHorizontalAlign
  textShadow: AvTextShadow
  textTransform: AvTextTransform
}

export type AvBackgroundLayer = {
  kind: AvBackgroundKind
  color: string
  gradientFrom: string
  gradientTo: string
  gradientAngle: number
  mediaUrl: string
  brightness: number
}

export type AvTransition = {
  style: AvTransitionStyle
  durationMs: number
}

export type AvProjectionPrefs = {
  outputFullscreenOnDblClick: boolean
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
    fontSize: 60,
    textAlign: 'center',
    verticalAlign: 'center',
    horizontalAlign: 'center',
    textShadow: 'none',
    textTransform: 'uppercase',
  },
  backgroundLayer: {
    kind: 'color',
    color: '#000000',
    gradientFrom: '#1a1a2e',
    gradientTo: '#16213e',
    gradientAngle: 135,
    mediaUrl: '',
    brightness: 100,
  },
  transition: {
    style: 'fade',
    durationMs: 250,
  },
  projection: {
    outputFullscreenOnDblClick: true,
  },
}

function clampNumber(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(min, Math.trunc(value)))
}

function parseEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T,
): T {
  return allowed.includes(value as T) ? (value as T) : fallback
}

function mergeContentLayer(raw: Partial<AvContentLayer> | undefined): AvContentLayer {
  const defaults = DEFAULT_AV_PREFERENCES.contentLayer
  return {
    maxLinesPerSlide: clampNumber(raw?.maxLinesPerSlide, defaults.maxLinesPerSlide, 1, 10),
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
  }
}

function mergeBackgroundLayer(raw: Partial<AvBackgroundLayer> | undefined): AvBackgroundLayer {
  const defaults = DEFAULT_AV_PREFERENCES.backgroundLayer
  return {
    kind: parseEnum(
      raw?.kind,
      ['color', 'gradient', 'image', 'video'],
      defaults.kind,
    ),
    color: typeof raw?.color === 'string' && raw.color ? raw.color : defaults.color,
    gradientFrom:
      typeof raw?.gradientFrom === 'string' && raw.gradientFrom
        ? raw.gradientFrom
        : defaults.gradientFrom,
    gradientTo:
      typeof raw?.gradientTo === 'string' && raw.gradientTo ? raw.gradientTo : defaults.gradientTo,
    gradientAngle: clampNumber(raw?.gradientAngle, defaults.gradientAngle, 0, 360),
    mediaUrl: typeof raw?.mediaUrl === 'string' ? raw.mediaUrl : defaults.mediaUrl,
    brightness: clampNumber(raw?.brightness, defaults.brightness, 0, 200),
  }
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
  storage: Pick<Storage, 'getItem'> = globalThis.localStorage,
): AvPreferences {
  try {
    const raw = storage.getItem(AV_PREFERENCES_STORAGE_KEY)
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
  storage: Pick<Storage, 'setItem'> = globalThis.localStorage,
): void {
  storage.setItem(AV_PREFERENCES_STORAGE_KEY, JSON.stringify(prefs))
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
  contentLayer: AvContentLayer
  backgroundLayer: AvBackgroundLayer
  transition: AvTransition
  blackout: boolean
  itemTitle: string
  nextPreview: string | null
}

export function buildAvProjectionPayload(input: {
  contentText: string
  contentLayer: AvContentLayer
  backgroundLayer: AvBackgroundLayer
  transition: AvTransition
  blackout: boolean
  itemTitle: string
  nextPreview: string | null
  prefersReducedMotion?: boolean
}): AvProjectionPayload {
  return {
    contentText: input.contentText,
    contentLayer: input.contentLayer,
    backgroundLayer: input.backgroundLayer,
    transition: effectiveAvTransition(
      input.transition,
      input.prefersReducedMotion ?? false,
    ),
    blackout: input.blackout,
    itemTitle: input.itemTitle,
    nextPreview: input.nextPreview,
  }
}

/** Settings tab writes default player mode via player-mode-preference; re-export for convenience. */
export type { PlayerMode }
