import {
  buildSongEditorReturnSearch,
  type PlayerEditorReturnContext,
} from '@/lib/player/player-editor-return'

export type SettingsTab = 'general' | 'player' | 'playerRoles'

export function parseSettingsTab(raw: unknown): SettingsTab {
  if (raw === 'player') return 'player'
  if (raw === 'playerRoles') return 'playerRoles'
  return 'general'
}

export function buildSettingsSearch(
  tab: SettingsTab,
  playerReturn?: PlayerEditorReturnContext | null,
) {
  return {
    tab,
    ...(playerReturn ? buildSongEditorReturnSearch(playerReturn) : {}),
  }
}
