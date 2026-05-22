import type { PlayerEntityType } from '@/lib/player-route'

export type PlayerEditorReturnContext = {
  playerType: PlayerEntityType
  playerId: string
  playerIndex: number
}

function parsePlayerType(raw: unknown): PlayerEntityType | undefined {
  if (raw === 'song' || raw === 'setlist' || raw === 'collection') return raw
  return undefined
}

export function parseOptionalPlayerIndex(raw: unknown): number | undefined {
  if (typeof raw === 'number' && Number.isFinite(raw) && raw >= 0) {
    return Math.trunc(raw)
  }
  if (typeof raw === 'string' && raw !== '') {
    const parsed = Number.parseInt(raw, 10)
    if (Number.isFinite(parsed) && parsed >= 0) return parsed
  }
  return undefined
}

export function parsePlayerEditorReturnSearch(
  search: Record<string, unknown>,
): PlayerEditorReturnContext | null {
  const playerType = parsePlayerType(search.playerType)
  const playerId = typeof search.playerId === 'string' ? search.playerId : ''
  const playerIndex = parseOptionalPlayerIndex(search.playerIndex)
  if (!playerType || !playerId || playerIndex == null) return null
  return { playerType, playerId, playerIndex }
}

export function buildSongEditorReturnSearch(
  context: PlayerEditorReturnContext,
): Record<string, string | number> {
  return {
    playerType: context.playerType,
    playerId: context.playerId,
    playerIndex: context.playerIndex,
  }
}

export function buildPlayerReturnSearch(
  context: PlayerEditorReturnContext,
): Record<string, string | number> {
  return {
    type: context.playerType,
    id: context.playerId,
    index: context.playerIndex,
  }
}
