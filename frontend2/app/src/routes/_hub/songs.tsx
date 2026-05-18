import { createFileRoute } from '@tanstack/react-router'

import { EntityListView } from '@/components/hub/EntityListView'

export const Route = createFileRoute('/_hub/songs')({
  component: SongsRoute,
})

function SongsRoute() {
  return <EntityListView entity="songs" />
}
