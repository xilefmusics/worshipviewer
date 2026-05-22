export type PlayerEntityType = 'collection' | 'song' | 'setlist'

export type PlayerViewState = {
  transposeByItem: Record<number, string | null>
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
    return {
      transposeByItem: parsed.transposeByItem ?? {},
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
