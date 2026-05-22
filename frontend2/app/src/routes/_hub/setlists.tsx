import { createFileRoute, Outlet, useLocation, useNavigate, useRouterState } from '@tanstack/react-router'
import { useEffect, useState } from 'react'

import { EntityListView } from '@/components/hub/EntityListView'
import { CreateSetlistDialog } from '@/components/setlists/CreateSetlistDialog'
import { emptyEditorReturnSearch } from '@/lib/player/player-editor-return'

export const Route = createFileRoute('/_hub/setlists')({
  component: SetlistsRoute,
})

function SetlistsRoute() {
  const location = useLocation()
  const navigate = useNavigate()
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const isSetlistEditor = /^\/setlists\/[^/]+$/.test(pathname)
  const [createOpen, setCreateOpen] = useState(false)

  useEffect(() => {
    if (isSetlistEditor) return
    const raw = (location.search as Record<string, unknown>).new
    if (raw !== '1' && raw !== 1) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- latch from `?new=1` like `/teams`
    setCreateOpen(true)
    void navigate({ to: '/setlists', replace: true })
  }, [isSetlistEditor, location.search, navigate])

  if (isSetlistEditor) {
    return <Outlet />
  }

  return (
    <>
      <EntityListView entity="setlists" />
      <CreateSetlistDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={(id) => {
          setCreateOpen(false)
          void navigate({
            to: '/setlists/$setlistId',
            params: { setlistId: id },
            search: emptyEditorReturnSearch(),
          })
        }}
      />
    </>
  )
}
