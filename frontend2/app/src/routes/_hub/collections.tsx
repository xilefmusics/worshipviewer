import { createFileRoute, Outlet, useLocation, useNavigate, useRouterState } from '@tanstack/react-router'
import { useEffect, useState } from 'react'

import { CreateCollectionDialog } from '@/components/collections/CreateCollectionDialog'
import { EntityListView } from '@/components/hub/EntityListView'

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
    const p = new URLSearchParams(location.search)
    if (p.get('new') !== '1') return
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
          void navigate({ to: '/collections/$collectionId', params: { collectionId: id } })
        }}
      />
    </>
  )
}
