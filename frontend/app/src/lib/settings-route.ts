import {
  buildSongEditorReturnSearch,
  type PlayerEditorReturnContext,
} from '@/lib/player/player-editor-return'
import type { RoomDisplayMode } from '@/lib/room-message-api'

export type SettingsTab = 'general' | 'player' | 'playerRoles'

export type RoomSettingsReturnContext = {
  roomId: string
  mode: RoomDisplayMode
}

export function parseSettingsTab(raw: unknown): SettingsTab {
  if (raw === 'player') return 'player'
  if (raw === 'playerRoles') return 'playerRoles'
  return 'general'
}

export function buildSettingsSearch(
  tab: SettingsTab,
  playerReturn?: PlayerEditorReturnContext | null,
  roomReturn?: RoomSettingsReturnContext | null,
) {
  return {
    tab,
    ...(playerReturn ? buildSongEditorReturnSearch(playerReturn) : {}),
    ...(roomReturn
      ? { roomReturnId: roomReturn.roomId, roomReturnMode: roomReturn.mode }
      : {}),
  }
}

export function parseRoomSettingsReturnSearch(
  search: Record<string, unknown>,
): RoomSettingsReturnContext | null {
  const roomId = search.roomReturnId
  const mode = search.roomReturnMode
  if (
    typeof roomId !== 'string' ||
    roomId.trim() === '' ||
    (mode !== 'sheet' && mode !== 'av' && mode !== 'slide')
  ) {
    return null
  }
  return { roomId, mode }
}

export function buildRoomSettingsReturnNavigation(context: RoomSettingsReturnContext) {
  return {
    to: '/rooms/$roomId' as const,
    params: { roomId: context.roomId },
    search: { mode: context.mode },
  }
}
