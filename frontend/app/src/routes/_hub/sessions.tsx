import { createFileRoute } from '@tanstack/react-router'

import { SessionsListView } from '@/components/sessions/SessionsListView'

export const Route = createFileRoute('/_hub/sessions')({
  component: SessionsRoute,
})

function SessionsRoute() {
  return <SessionsListView />
}
