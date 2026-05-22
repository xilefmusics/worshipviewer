import type { PlayerEntityType } from '@/lib/player-route'
import { parseOptionalPlayerIndex } from '@/lib/player/player-editor-return'

export type PlayerViewState = {
  transposeByItem: Record<number, string | null>
  itemIndex?: number
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
    return {
      transposeByItem: parsed.transposeByItem ?? {},
      ...(itemIndex != null ? { itemIndex } : {}),
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
