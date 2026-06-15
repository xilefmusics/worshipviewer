import { getLocalStorage, safeGetItem, safeRemoveItem, safeSetItem } from '@/lib/browser-storage'
import type { PlayerEntityType } from '@/lib/player-route'
import { parseOptionalPlayerIndex } from '@/lib/player/player-editor-return'

export type PlayerViewState = {
  transposeByItem: Record<number, string | null>
  languageByItem?: Record<number, number>
  itemIndex?: number
  /** Intra-item page when scroll mode supports paging within an item. */
  pageOffset?: number
}

export function playerViewStorageKey(type: PlayerEntityType, id: string): string {
  return `playerView:${type}:${id}`
}

export function readPlayerViewState(
  type: PlayerEntityType,
  id: string,
  storage: Pick<Storage, 'getItem'> | null = getLocalStorage(),
): PlayerViewState {
  try {
    const raw = safeGetItem(playerViewStorageKey(type, id), storage)
    if (!raw) {
      return { transposeByItem: {}, languageByItem: {} }
    }
    const parsed = JSON.parse(raw) as Partial<PlayerViewState>
    const itemIndex = parseOptionalPlayerIndex(parsed.itemIndex)
    const pageOffset = parseOptionalPlayerIndex(parsed.pageOffset)
    return {
      transposeByItem: parsed.transposeByItem ?? {},
      languageByItem: parsed.languageByItem ?? {},
      ...(itemIndex != null ? { itemIndex } : {}),
      ...(pageOffset != null ? { pageOffset } : {}),
    }
  } catch {
    return { transposeByItem: {}, languageByItem: {} }
  }
}

export function writePlayerViewState(
  type: PlayerEntityType,
  id: string,
  state: PlayerViewState,
  storage: Pick<Storage, 'setItem'> | null = getLocalStorage(),
): void {
  safeSetItem(playerViewStorageKey(type, id), JSON.stringify(state), storage)
}

export function clearPlayerViewStateForResource(
  type: PlayerEntityType,
  id: string,
  storage: Pick<Storage, 'removeItem'> | null = getLocalStorage(),
): void {
  safeRemoveItem(playerViewStorageKey(type, id), storage)
}

export function setTransposeForItem(
  state: PlayerViewState,
  itemIndex: number,
  key: string,
): PlayerViewState {
  return {
    ...state,
    transposeByItem: { ...state.transposeByItem, [itemIndex]: key },
  }
}

export function clearTransposeForItem(state: PlayerViewState, itemIndex: number): PlayerViewState {
  const next = { ...state.transposeByItem }
  delete next[itemIndex]
  return { ...state, transposeByItem: next }
}

export function setLanguageForItem(
  state: PlayerViewState,
  itemIndex: number,
  languageIndex: number,
): PlayerViewState {
  return {
    ...state,
    languageByItem: { ...(state.languageByItem ?? {}), [itemIndex]: languageIndex },
  }
}

export function clearLanguageForItem(state: PlayerViewState, itemIndex: number): PlayerViewState {
  const next = { ...(state.languageByItem ?? {}) }
  delete next[itemIndex]
  return { ...state, languageByItem: next }
}

export function setPlayerItemIndex(state: PlayerViewState, itemIndex: number): PlayerViewState {
  return { ...state, itemIndex }
}

export function setPlayerNavPosition(
  state: PlayerViewState,
  itemIndex: number,
  pageOffset: number,
): PlayerViewState {
  return { ...state, itemIndex, pageOffset }
}
