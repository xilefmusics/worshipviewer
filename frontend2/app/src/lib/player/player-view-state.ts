import type { PlayerEntityType } from '@/lib/player-route'
import { parseOptionalPlayerIndex } from '@/lib/player/player-editor-return'

export type PlayerViewState = {
  transposeByItem: Record<number, string | null>
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
  storage: Pick<Storage, 'getItem'> = globalThis.localStorage,
): PlayerViewState {
  try {
    const raw = storage.getItem(playerViewStorageKey(type, id))
    if (!raw) {
      return { transposeByItem: {} }
    }
    const parsed = JSON.parse(raw) as Partial<PlayerViewState>
    const itemIndex = parseOptionalPlayerIndex(parsed.itemIndex)
    const pageOffset = parseOptionalPlayerIndex(parsed.pageOffset)
    return {
      transposeByItem: parsed.transposeByItem ?? {},
      ...(itemIndex != null ? { itemIndex } : {}),
      ...(pageOffset != null ? { pageOffset } : {}),
    }
  } catch {
    return { transposeByItem: {} }
  }
}

export function writePlayerViewState(
  type: PlayerEntityType,
  id: string,
  state: PlayerViewState,
  storage: Pick<Storage, 'setItem'> = globalThis.localStorage,
): void {
  storage.setItem(playerViewStorageKey(type, id), JSON.stringify(state))
}

export function clearPlayerViewStateForResource(
  type: PlayerEntityType,
  id: string,
  storage: Pick<Storage, 'removeItem'> = globalThis.localStorage,
): void {
  storage.removeItem(playerViewStorageKey(type, id))
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
