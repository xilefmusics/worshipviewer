import { createFileRoute, Outlet, useLocation, useNavigate, useRouterState } from '@tanstack/react-router'
import { useEffect, useState } from 'react'

import { CreateCollectionDialog } from '@/components/collections/CreateCollectionDialog'
import { EntityListView } from '@/components/hub/EntityListView'
import { emptyEditorReturnSearch } from '@/lib/player/player-editor-return'

export const Route = createFileRoute('/_hub/collections')({
  component: CollectionsRoute,
})

function CollectionsRoute() {
  const location = useLocation()
  const navigate = useNavigate()
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const isCollectionEditor = /^\/collections\/[^/]+$/.test(pathname)
  const [createOpen, setCreateOpen] = useState(false)

  useEffect(() => {
    if (isCollectionEditor) return
    const raw = (location.search as Record<string, unknown>).new
    if (raw !== '1' && raw !== 1) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- latch from `?new=1` like `/setlists`
    setCreateOpen(true)
    void navigate({ to: '/collections', replace: true })
  }, [isCollectionEditor, location.search, navigate])

  if (isCollectionEditor) {
    return <Outlet />
  }

  return (
    <>
      <EntityListView entity="collections" />
      <CreateCollectionDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={(id) => {
          setCreateOpen(false)
          void navigate({
            to: '/collections/$collectionId',
            params: { collectionId: id },
            search: emptyEditorReturnSearch(),
          })
        }}
      />
    </>
  )
}
