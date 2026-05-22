import type { components } from '@/api/schema'

export type PlayerEntityType = 'collection' | 'song' | 'setlist'
export type Orientation = components['schemas']['Orientation']
export type ScrollType = components['schemas']['ScrollType']

export type PlayerViewState = {
  scrollType: ScrollType
  orientation: Orientation
  scrollTypeCacheOtherOrientation: ScrollType
  transposeByItem: Record<number, string | null>
  chordFormat?: 'letters' | 'nashville'
}

export function playerViewStorageKey(type: PlayerEntityType, id: string): string {
  return `playerView:${type}:${id}`
}

export function readPlayerViewState(
  type: PlayerEntityType,
  id: string,
  defaults: Pick<PlayerViewState, 'scrollType' | 'orientation' | 'scrollTypeCacheOtherOrientation'>,
  storage: Pick<Storage, 'getItem'> = globalThis.localStorage,
): PlayerViewState {
  try {
    const raw = storage.getItem(playerViewStorageKey(type, id))
    if (!raw) {
      return { ...defaults, transposeByItem: {} }
    }
    const parsed = JSON.parse(raw) as Partial<PlayerViewState>
    return {
      scrollType: parsed.scrollType ?? defaults.scrollType,
      orientation: parsed.orientation ?? defaults.orientation,
      scrollTypeCacheOtherOrientation:
        parsed.scrollTypeCacheOtherOrientation ?? defaults.scrollTypeCacheOtherOrientation,
      transposeByItem: parsed.transposeByItem ?? {},
      chordFormat: parsed.chordFormat,
    }
  } catch {
    return { ...defaults, transposeByItem: {} }
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

/** Swap orientation and round-trip scroll types via the cache slot. */
export function toggleOrientationViewState(state: PlayerViewState): PlayerViewState {
  const outgoingOrientation = state.orientation
  const incomingOrientation: Orientation = outgoingOrientation === 'portrait' ? 'landscape' : 'portrait'
  return {
    ...state,
    orientation: incomingOrientation,
    scrollTypeCacheOtherOrientation: state.scrollType,
    scrollType: state.scrollTypeCacheOtherOrientation,
  }
}

export function setScrollTypeViewState(state: PlayerViewState, scrollType: ScrollType): PlayerViewState {
  return { ...state, scrollType }
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

export function setChordFormatViewState(
  state: PlayerViewState,
  chordFormat: 'letters' | 'nashville',
): PlayerViewState {
  return { ...state, chordFormat }
}
