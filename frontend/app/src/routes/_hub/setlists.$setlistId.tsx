import { createFileRoute } from '@tanstack/react-router'

import { SetlistEditorScreen } from '@/components/setlists/SetlistEditorScreen'
import { parsePlayerEditorReturnSearch } from '@/lib/player/player-editor-return'

export const Route = createFileRoute('/_hub/setlists/$setlistId')({
  validateSearch: (search: Record<string, unknown>) => {
    const returnToPlayer = parsePlayerEditorReturnSearch(search)
    return {
      playerType: returnToPlayer?.playerType,
      playerId: returnToPlayer?.playerId,
      playerIndex: returnToPlayer?.playerIndex,
    }
  },
  component: SetlistEditorRoute,
})

function SetlistEditorRoute() {
  const { setlistId } = Route.useParams()
  return <SetlistEditorScreen setlistId={setlistId} />
}
