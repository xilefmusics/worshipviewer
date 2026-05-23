import { createFileRoute, useLocation } from '@tanstack/react-router'

import { SettingsView } from '@/components/settings/SettingsView'
import { parseSettingsTab } from '@/lib/settings-route'
import {
  parsePlayerEditorReturnSearch,
} from '@/lib/player/player-editor-return'

export const Route = createFileRoute('/_hub/settings')({
  component: SettingsRoute,
})

function SettingsRoute() {
  const location = useLocation()
  const search = location.search as Record<string, unknown>
  const tab = parseSettingsTab(search.tab)
  const playerReturn = parsePlayerEditorReturnSearch(search)
  return <SettingsView activeTab={tab} playerReturn={playerReturn} />
}
