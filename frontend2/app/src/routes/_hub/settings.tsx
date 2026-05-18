import { createFileRoute } from '@tanstack/react-router'

import { SettingsView } from '@/components/settings/SettingsView'

export const Route = createFileRoute('/_hub/settings')({
  component: SettingsRoute,
})

function SettingsRoute() {
  return <SettingsView />
}
