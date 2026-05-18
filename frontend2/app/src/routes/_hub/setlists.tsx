import { createFileRoute, Outlet, useLocation, useNavigate, useRouterState } from '@tanstack/react-router'
import { useEffect, useState } from 'react'

import { EntityListView } from '@/components/hub/EntityListView'
import { CreateSetlistDialog } from '@/components/setlists/CreateSetlistDialog'

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
    const p = new URLSearchParams(location.search)
    if (p.get('new') !== '1') return
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
          void navigate({ to: '/setlists/$setlistId', params: { setlistId: id } })
        }}
      />
    </>
  )
}
