import {
  buildSongEditorReturnSearch,
  type PlayerEditorReturnContext,
} from '@/lib/player/player-editor-return'

export type SettingsTab = 'general' | 'player'

export function parseSettingsTab(raw: unknown): SettingsTab {
  return raw === 'player' ? 'player' : 'general'
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
