import type { components } from '@/api/schema'

import { normalizeScrollType, type PlayerScrollType } from '@/lib/player/effective-scroll-type'

export type Orientation = components['schemas']['Orientation']
export type ScrollType = components['schemas']['ScrollType']

export const PLAYER_SCROLL_PORTRAIT_KEY = 'wv_player_scroll_portrait'
export const PLAYER_SCROLL_LANDSCAPE_KEY = 'wv_player_scroll_landscape'
export const PLAYER_SCROLL_CHANGE_EVENT = 'wv-player-scroll-change'

export type PlayerScrollPreferences = {
  portrait: PlayerScrollType
  landscape: PlayerScrollType
}

export function readPlayerScrollPreferences(
  storage: Pick<Storage, 'getItem'> = globalThis.localStorage,
): PlayerScrollPreferences {
  const portraitRaw = storage.getItem(PLAYER_SCROLL_PORTRAIT_KEY) as ScrollType | null
  const landscapeRaw = storage.getItem(PLAYER_SCROLL_LANDSCAPE_KEY) as ScrollType | null
  return {
    portrait: normalizeScrollType(portraitRaw ?? 'one_page'),
    landscape: normalizeScrollType(landscapeRaw ?? 'one_page'),
  }
}

function dispatchScrollChange(preferences: PlayerScrollPreferences): void {
  if (typeof globalThis.window !== 'undefined') {
    globalThis.window.dispatchEvent(
      new CustomEvent(PLAYER_SCROLL_CHANGE_EVENT, { detail: preferences }),
    )
  }
}

export function writePlayerScrollPortrait(
  scrollType: PlayerScrollType,
  storage: Pick<Storage, 'getItem' | 'setItem'> = globalThis.localStorage,
): void {
  storage.setItem(PLAYER_SCROLL_PORTRAIT_KEY, scrollType)
  dispatchScrollChange(readPlayerScrollPreferences(storage))
}

export function writePlayerScrollLandscape(
  scrollType: PlayerScrollType,
  storage: Pick<Storage, 'getItem' | 'setItem'> = globalThis.localStorage,
): void {
  storage.setItem(PLAYER_SCROLL_LANDSCAPE_KEY, scrollType)
  dispatchScrollChange(readPlayerScrollPreferences(storage))
}

export function scrollTypeForOrientation(
  orientation: Orientation,
  preferences: PlayerScrollPreferences,
): PlayerScrollType {
  return orientation === 'landscape' ? preferences.landscape : preferences.portrait
}
