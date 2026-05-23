import type { PlayerMode } from '@/lib/player/player-mode'

export const PLAYER_DEFAULT_MODE_STORAGE_KEY = 'playerDefaultMode'

export function readPlayerDefaultMode(
  storage: Pick<Storage, 'getItem'> = globalThis.localStorage,
): PlayerMode {
  const raw = storage.getItem(PLAYER_DEFAULT_MODE_STORAGE_KEY)
  return raw === 'av' ? 'av' : 'normal'
}

export function writePlayerDefaultMode(
  mode: PlayerMode,
  storage: Pick<Storage, 'setItem'> = globalThis.localStorage,
): void {
  storage.setItem(PLAYER_DEFAULT_MODE_STORAGE_KEY, mode)
}
