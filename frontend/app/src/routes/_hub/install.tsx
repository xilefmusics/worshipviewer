import { createFileRoute } from '@tanstack/react-router'

import { InstallView } from '@/components/install/InstallView'

export const Route = createFileRoute('/_hub/install')({
  component: InstallRoute,
})

function InstallRoute() {
  return <InstallView />
}
