import { createFileRoute, Outlet, useLocation, useNavigate, useRouterState } from '@tanstack/react-router'
import { useEffect, useState } from 'react'

import { CreateSongDialog } from '@/components/songs/CreateSongDialog'
import { EntityListView } from '@/components/hub/EntityListView'

export const Route = createFileRoute('/_hub/songs')({
  component: SongsRoute,
})

function SongsRoute() {
  const location = useLocation()
  const navigate = useNavigate()
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const isSongEditor = /^\/songs\/[^/]+$/.test(pathname)
  const [createOpen, setCreateOpen] = useState(false)

  useEffect(() => {
    if (isSongEditor) return
    const p = new URLSearchParams(location.search)
    if (p.get('new') !== '1') return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- latch from `?new=1` like `/setlists`
    setCreateOpen(true)
    void navigate({ to: '/songs', replace: true })
  }, [isSongEditor, location.search, navigate])

  if (isSongEditor) {
    return <Outlet />
  }

  return (
    <>
      <EntityListView entity="songs" />
      <CreateSongDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={(id) => {
          setCreateOpen(false)
          void navigate({ to: '/songs/$songId', params: { songId: id } })
        }}
      />
    </>
  )
}
