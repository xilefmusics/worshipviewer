import { createFileRoute } from '@tanstack/react-router'

import { TeamDetailView } from '@/components/teams/TeamDetailView'

export const Route = createFileRoute('/_hub/teams/$teamId')({
  component: TeamDetailRoute,
})

function TeamDetailRoute() {
  const { teamId } = Route.useParams()
  return <TeamDetailView teamId={teamId} />
}
