import { createFileRoute, useLocation } from '@tanstack/react-router'

import { SettingsView } from '@/components/settings/SettingsView'
import { parseSettingsTab } from '@/lib/settings-route'

export const Route = createFileRoute('/_hub/settings')({
  component: SettingsRoute,
})

function SettingsRoute() {
  const location = useLocation()
  const search = location.search as Record<string, unknown>
  const tab = parseSettingsTab(search.tab)
  return <SettingsView activeTab={tab} />
}
