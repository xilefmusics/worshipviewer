import { createFileRoute } from '@tanstack/react-router'

import { CollectionEditorScreen } from '@/components/collections/CollectionEditorScreen'
import { parsePlayerEditorReturnSearch } from '@/lib/player/player-editor-return'

export const Route = createFileRoute('/_hub/collections/$collectionId')({
  validateSearch: (search: Record<string, unknown>) => {
    const returnToPlayer = parsePlayerEditorReturnSearch(search)
    return {
      playerType: returnToPlayer?.playerType,
      playerId: returnToPlayer?.playerId,
      playerIndex: returnToPlayer?.playerIndex,
    }
  },
  component: CollectionEditorRoute,
})

function CollectionEditorRoute() {
  const { collectionId } = Route.useParams()
  return <CollectionEditorScreen collectionId={collectionId} />
}
