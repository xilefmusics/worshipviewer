import type { components } from '@/api/schema'

import {
  DEFAULT_PLAYER_LAYOUT_PREFERENCE,
  layoutPreferenceToScrollType,
  normalizeScrollType,
  scrollTypeToLayoutPreference,
  type PlayerLayoutPreference,
  type PlayerScrollType,
} from '@/lib/player/effective-scroll-type'
import { isPlayerLayoutColumnCount } from '@/lib/player/player-column-count'

export type Orientation = components['schemas']['Orientation']
export type ScrollType = components['schemas']['ScrollType']

export const PLAYER_LAYOUT_PORTRAIT_KEY = 'wv_player_layout_portrait'
export const PLAYER_LAYOUT_LANDSCAPE_KEY = 'wv_player_layout_landscape'
/** When `"true"` (default), portrait and landscape share the same layout preference. */
export const PLAYER_LAYOUT_LINKED_KEY = 'wv_player_layout_linked'

/** @deprecated Legacy scroll-type keys — read once for migration. */
export const PLAYER_SCROLL_PORTRAIT_KEY = 'wv_player_scroll_portrait'
/** @deprecated Legacy scroll-type keys — read once for migration. */
export const PLAYER_SCROLL_LANDSCAPE_KEY = 'wv_player_scroll_landscape'

export const PLAYER_SCROLL_CHANGE_EVENT = 'wv-player-scroll-change'

export type PlayerLayoutPreferences = {
  /** Same settings for portrait and landscape when true (default). */
  linkedOrientations: boolean
  portrait: PlayerLayoutPreference
  landscape: PlayerLayoutPreference
}

/** @deprecated Use PlayerLayoutPreferences */
export type PlayerScrollPreferences = {
  portrait: PlayerScrollType
  landscape: PlayerScrollType
}

function normalizeLayoutPreference(raw: unknown): PlayerLayoutPreference {
  if (raw == null || typeof raw !== 'object') {
    return { ...DEFAULT_PLAYER_LAYOUT_PREFERENCE }
  }
  const value = raw as Partial<PlayerLayoutPreference>
  const mode = value.mode === 'free' ? 'free' : 'page'
  const pageCount = value.pageCount === 2 ? 2 : 1
  const columnCount = isPlayerLayoutColumnCount(value.columnCount)
    ? value.columnCount
    : DEFAULT_PLAYER_LAYOUT_PREFERENCE.columnCount
  const nextSongPreview = value.nextSongPreview === true
  const overflowStyle = value.overflowStyle === 'scroll' ? 'scroll' : 'cut'
  const expandSections = value.expandSections === true
  return { mode, pageCount, columnCount, nextSongPreview, overflowStyle, expandSections }
}

function parseLayoutJson(raw: string | null): PlayerLayoutPreference | null {
  if (raw == null || raw.trim() === '') return null
  try {
    return normalizeLayoutPreference(JSON.parse(raw))
  } catch {
    return null
  }
}

function readLayoutForOrientation(
  orientation: 'portrait' | 'landscape',
  storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>,
): PlayerLayoutPreference {
  const layoutKey =
    orientation === 'portrait' ? PLAYER_LAYOUT_PORTRAIT_KEY : PLAYER_LAYOUT_LANDSCAPE_KEY
  const legacyKey =
    orientation === 'portrait' ? PLAYER_SCROLL_PORTRAIT_KEY : PLAYER_SCROLL_LANDSCAPE_KEY

  const parsed = parseLayoutJson(storage.getItem(layoutKey))
  if (parsed) return parsed

  const legacyRaw = storage.getItem(legacyKey) as ScrollType | PlayerScrollType | null
  if (legacyRaw != null) {
    const migrated = scrollTypeToLayoutPreference(normalizeScrollType(legacyRaw))
    storage.setItem(layoutKey, JSON.stringify(migrated))
    storage.removeItem(legacyKey)
    if (orientation === 'portrait' && readLinkedOrientations(storage)) {
      storage.setItem(PLAYER_LAYOUT_LANDSCAPE_KEY, JSON.stringify(migrated))
      storage.removeItem(PLAYER_SCROLL_LANDSCAPE_KEY)
    }
    return migrated
  }

  return { ...DEFAULT_PLAYER_LAYOUT_PREFERENCE }
}

function readLinkedOrientations(
  storage: Pick<Storage, 'getItem'>,
): boolean {
  return storage.getItem(PLAYER_LAYOUT_LINKED_KEY) !== 'false'
}

export function readPlayerLayoutPreferences(
  storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> = globalThis.localStorage,
): PlayerLayoutPreferences {
  const portrait = readLayoutForOrientation('portrait', storage)
  const linkedOrientations = readLinkedOrientations(storage)
  const landscape = linkedOrientations
    ? portrait
    : readLayoutForOrientation('landscape', storage)
  return { linkedOrientations, portrait, landscape }
}

/** @deprecated Use readPlayerLayoutPreferences */
export function readPlayerScrollPreferences(
  storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> = globalThis.localStorage,
): PlayerScrollPreferences {
  const layout = readPlayerLayoutPreferences(storage)
  return {
    portrait: layoutPreferenceToScrollType(layout.portrait),
    landscape: layoutPreferenceToScrollType(layout.landscape),
  }
}

function dispatchLayoutChange(preferences: PlayerLayoutPreferences): void {
  if (typeof globalThis.window !== 'undefined') {
    globalThis.window.dispatchEvent(
      new CustomEvent(PLAYER_SCROLL_CHANGE_EVENT, { detail: preferences }),
    )
  }
}

export function writePlayerLayoutLinkedOrientations(
  linked: boolean,
  storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> = globalThis.localStorage,
): void {
  storage.setItem(PLAYER_LAYOUT_LINKED_KEY, linked ? 'true' : 'false')
  if (linked) {
    const portrait = readLayoutForOrientation('portrait', storage)
    storage.setItem(PLAYER_LAYOUT_LANDSCAPE_KEY, JSON.stringify(normalizeLayoutPreference(portrait)))
  }
  dispatchLayoutChange(readPlayerLayoutPreferences(storage))
}

export function writePlayerLayoutPortrait(
  preference: PlayerLayoutPreference,
  storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> = globalThis.localStorage,
): void {
  const normalized = normalizeLayoutPreference(preference)
  storage.setItem(PLAYER_LAYOUT_PORTRAIT_KEY, JSON.stringify(normalized))
  if (readLinkedOrientations(storage)) {
    storage.setItem(PLAYER_LAYOUT_LANDSCAPE_KEY, JSON.stringify(normalized))
  }
  dispatchLayoutChange(readPlayerLayoutPreferences(storage))
}

export function writePlayerLayoutLandscape(
  preference: PlayerLayoutPreference,
  storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> = globalThis.localStorage,
): void {
  storage.setItem(
    PLAYER_LAYOUT_LANDSCAPE_KEY,
    JSON.stringify(normalizeLayoutPreference(preference)),
  )
  dispatchLayoutChange(readPlayerLayoutPreferences(storage))
}

/** Update the shared layout when orientations are linked, or portrait only otherwise. */
export function writePlayerLayoutUnified(
  preference: PlayerLayoutPreference,
  storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> = globalThis.localStorage,
): void {
  writePlayerLayoutPortrait(preference, storage)
}

/** @deprecated Use writePlayerLayoutPortrait */
export function writePlayerScrollPortrait(
  scrollType: PlayerScrollType,
  storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> = globalThis.localStorage,
): void {
  writePlayerLayoutPortrait(scrollTypeToLayoutPreference(scrollType), storage)
}

/** @deprecated Use writePlayerLayoutLandscape */
export function writePlayerScrollLandscape(
  scrollType: PlayerScrollType,
  storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> = globalThis.localStorage,
): void {
  writePlayerLayoutLandscape(scrollTypeToLayoutPreference(scrollType), storage)
}

export function layoutPreferenceForOrientation(
  orientation: Orientation,
  preferences: PlayerLayoutPreferences,
): PlayerLayoutPreference {
  if (preferences.linkedOrientations) return preferences.portrait
  return orientation === 'landscape' ? preferences.landscape : preferences.portrait
}

export function scrollTypeForOrientation(
  orientation: Orientation,
  preferences: PlayerLayoutPreferences | PlayerScrollPreferences,
): PlayerScrollType {
  if ('portrait' in preferences && typeof preferences.portrait === 'object') {
    return layoutPreferenceToScrollType(
      layoutPreferenceForOrientation(orientation, preferences as PlayerLayoutPreferences),
    )
  }
  const scrollPrefs = preferences as PlayerScrollPreferences
  return orientation === 'landscape' ? scrollPrefs.landscape : scrollPrefs.portrait
}
