import { createFileRoute } from '@tanstack/react-router'

import { SongEditorScreen } from '@/components/songs/SongEditorScreen'
import { parsePlayerEditorReturnSearch } from '@/lib/player/player-editor-return'

export const Route = createFileRoute('/_hub/songs/$songId')({
  validateSearch: (search: Record<string, unknown>) => {
    const returnToPlayer = parsePlayerEditorReturnSearch(search)
    return {
      playerType: returnToPlayer?.playerType,
      playerId: returnToPlayer?.playerId,
      playerIndex: returnToPlayer?.playerIndex,
    }
  },
  component: SongEditorRoute,
})

function SongEditorRoute() {
  const { songId } = Route.useParams()
  return <SongEditorScreen songId={songId} />
}
