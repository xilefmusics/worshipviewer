import type { PlayerEntityType } from '@/lib/player-route'
import { parseOptionalPlayerIndex } from '@/lib/player/player-editor-return'

export type AvSessionState = {
  itemIndex: number
  slideIndex: number
  blackout: boolean
}

export function avSessionStorageKey(type: PlayerEntityType, id: string): string {
  return `playerAvSession:${type}:${id}`
}

export function readAvSessionState(
  type: PlayerEntityType,
  id: string,
  storage: Pick<Storage, 'getItem'> = globalThis.localStorage,
): AvSessionState {
  try {
    const raw = storage.getItem(avSessionStorageKey(type, id))
    if (!raw) {
      return { itemIndex: 0, slideIndex: 0, blackout: false }
    }
    const parsed = JSON.parse(raw) as Partial<AvSessionState>
    const itemIndex = parseOptionalPlayerIndex(parsed.itemIndex) ?? 0
    const slideIndex = parseOptionalPlayerIndex(parsed.slideIndex) ?? 0
    return {
      itemIndex,
      slideIndex,
      blackout: Boolean(parsed.blackout),
    }
  } catch {
    return { itemIndex: 0, slideIndex: 0, blackout: false }
  }
}

export function writeAvSessionState(
  type: PlayerEntityType,
  id: string,
  state: AvSessionState,
  storage: Pick<Storage, 'setItem'> = globalThis.localStorage,
): void {
  storage.setItem(avSessionStorageKey(type, id), JSON.stringify(state))
}
