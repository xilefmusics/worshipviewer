import { createFileRoute } from '@tanstack/react-router'

import { CollectionEditorScreen } from '@/components/collections/CollectionEditorScreen'

export const Route = createFileRoute('/_hub/collections/$collectionId')({
  component: CollectionEditorRoute,
})

function CollectionEditorRoute() {
  const { collectionId } = Route.useParams()
  return <CollectionEditorScreen collectionId={collectionId} />
}
