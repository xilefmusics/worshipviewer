import type { PlayerMode } from '@/lib/player/player-mode'

export type AvTextAlign = 'left' | 'center' | 'right'
export type AvVerticalAlign = 'top' | 'center' | 'bottom'
export type AvHorizontalAlign = 'left' | 'center' | 'right'
export type AvTextShadow = 'none' | 'subtle' | 'medium' | 'strong'
export type AvTextTransform = 'none' | 'uppercase' | 'lowercase' | 'capitalize'
/** Legacy presenter backgrounds: 0 = black, 1 = red gradient, 2 = ray image. */
export type AvBackgroundPreset = 0 | 1 | 2
export type AvTransitionStyle = 'none' | 'fade' | 'slide'

export const AV_BACKGROUND_PRESETS = [0, 1, 2] as const satisfies readonly AvBackgroundPreset[]

export type AvContentLayer = {
  maxLinesPerSlide: number
  balanceSlideLines: boolean
  fontSize: number
  textAlign: AvTextAlign
  verticalAlign: AvVerticalAlign
  horizontalAlign: AvHorizontalAlign
  textShadow: AvTextShadow
  textTransform: AvTextTransform
}

export type AvBackgroundLayer = {
  preset: AvBackgroundPreset
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
  },
  backgroundLayer: {
    preset: 2,
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

function parseBackgroundPreset(value: unknown, fallback: AvBackgroundPreset): AvBackgroundPreset {
  const num = typeof value === 'number' ? value : Number.parseInt(String(value ?? ''), 10)
  return num === 0 || num === 1 || num === 2 ? num : fallback
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
  }
}

function mergeBackgroundLayer(raw: Partial<AvBackgroundLayer> & Record<string, unknown> | undefined): AvBackgroundLayer {
  const defaults = DEFAULT_AV_PREFERENCES.backgroundLayer
  if (raw?.preset !== undefined) {
    return { preset: parseBackgroundPreset(raw.preset, defaults.preset) }
  }
  // Migrate earlier frontend2 free-form background settings.
  if (typeof raw?.kind === 'string') {
    if (raw.kind === 'gradient') return { preset: 1 }
    if (raw.kind === 'image' || raw.kind === 'video') return { preset: 2 }
    return { preset: 0 }
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
