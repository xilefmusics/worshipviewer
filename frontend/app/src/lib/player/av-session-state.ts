import { getLocalStorage, safeGetItem, safeSetItem } from '@/lib/browser-storage'
import type { PlayerEntityType } from '@/lib/player-route'
import type { AvScreenState } from '@/lib/player/av-preferences'
import { parseOptionalPlayerIndex } from '@/lib/player/player-editor-return'

export type AvSessionState = {
  itemIndex: number
  slideIndex: number
  screenState: AvScreenState
}

export function avSessionStorageKey(type: PlayerEntityType, id: string): string {
  return `playerAvSession:${type}:${id}`
}

function parseScreenState(parsed: Partial<AvSessionState> & { blackout?: boolean }): AvScreenState {
  if (parsed.screenState === 'live' || parsed.screenState === 'blank' || parsed.screenState === 'blackout') {
    return parsed.screenState
  }
  if (parsed.blackout) return 'blackout'
  return 'live'
}

export function readAvSessionState(
  type: PlayerEntityType,
  id: string,
  storage: Pick<Storage, 'getItem'> | null = getLocalStorage(),
): AvSessionState {
  try {
    const raw = safeGetItem(avSessionStorageKey(type, id), storage)
    if (!raw) {
      return { itemIndex: 0, slideIndex: 0, screenState: 'live' }
    }
    const parsed = JSON.parse(raw) as Partial<AvSessionState> & { blackout?: boolean }
    const itemIndex = parseOptionalPlayerIndex(parsed.itemIndex) ?? 0
    const slideIndex = parseOptionalPlayerIndex(parsed.slideIndex) ?? 0
    return {
      itemIndex,
      slideIndex,
      screenState: parseScreenState(parsed),
    }
  } catch {
    return { itemIndex: 0, slideIndex: 0, screenState: 'live' }
  }
}

export function writeAvSessionState(
  type: PlayerEntityType,
  id: string,
  state: AvSessionState,
  storage: Pick<Storage, 'setItem'> | null = getLocalStorage(),
): void {
  safeSetItem(avSessionStorageKey(type, id), JSON.stringify(state), storage)
}
