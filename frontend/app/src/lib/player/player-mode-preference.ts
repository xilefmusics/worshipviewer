import { getLocalStorage, safeGetItem, safeSetItem } from '@/lib/browser-storage'
import type { PlayerMode } from '@/lib/player/player-mode'

export const PLAYER_DEFAULT_MODE_STORAGE_KEY = 'playerDefaultMode'

export function readPlayerDefaultMode(
  storage: Pick<Storage, 'getItem'> | null = getLocalStorage(),
): PlayerMode {
  const raw = safeGetItem(PLAYER_DEFAULT_MODE_STORAGE_KEY, storage)
  return raw === 'av' ? 'av' : 'normal'
}

export function writePlayerDefaultMode(
  mode: PlayerMode,
  storage: Pick<Storage, 'setItem'> | null = getLocalStorage(),
): void {
  safeSetItem(PLAYER_DEFAULT_MODE_STORAGE_KEY, mode, storage)
}
