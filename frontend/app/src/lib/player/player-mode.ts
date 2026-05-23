export type PlayerMode = 'normal' | 'av'

export type PlayerModeDefinition = {
  id: PlayerMode
  labelKey: `player.mode.${PlayerMode}`
}

/** Extension contract for future role variants (click/pad/service-operator). */
export const PLAYER_MODES: readonly PlayerModeDefinition[] = [
  { id: 'normal', labelKey: 'player.mode.normal' },
  { id: 'av', labelKey: 'player.mode.av' },
] as const

export function isPlayerMode(raw: unknown): raw is PlayerMode {
  return raw === 'normal' || raw === 'av'
}

export function parsePlayerMode(raw: unknown): PlayerMode | undefined {
  return isPlayerMode(raw) ? raw : undefined
}

export function resolvePlayerMode(
  searchMode: unknown,
  globalDefault: PlayerMode,
): PlayerMode {
  const parsed = parsePlayerMode(searchMode)
  return parsed ?? globalDefault
}
