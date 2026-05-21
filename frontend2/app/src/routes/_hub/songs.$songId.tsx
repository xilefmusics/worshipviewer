import { createFileRoute } from '@tanstack/react-router'

import { SongEditorScreen } from '@/components/songs/SongEditorScreen'

export const Route = createFileRoute('/_hub/songs/$songId')({
  component: SongEditorRoute,
})

function SongEditorRoute() {
  const { songId } = Route.useParams()
  return <SongEditorScreen songId={songId} />
}
