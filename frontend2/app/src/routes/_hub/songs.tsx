import { createFileRoute, Outlet, useLocation, useNavigate, useRouterState } from '@tanstack/react-router'
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'

import { fetchTeamsPage } from '@/api/teams-sessions-fetch'
import { CreateSongDialog } from '@/components/songs/CreateSongDialog'
import { ImportSongsDialog } from '@/components/songs/ImportSongsDialog'
import { SongCreateChooserSheet } from '@/components/songs/SongCreateChooserSheet'
import { EntityListView } from '@/components/hub/EntityListView'
import { useOnline } from '@/hooks/use-online'
import { useSession } from '@/hooks/useSession'
import { getNextPageIndex } from '@/lib/list-pagination'
import { canEditTeamLibrary } from '@/lib/team-permissions'
import { teamsListRootKey } from '@/lib/teams-sessions-keys'

export const Route = createFileRoute('/_hub/songs')({
  component: SongsRoute,
})

function SongsRoute() {
  const location = useLocation()
  const navigate = useNavigate()
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const online = useOnline()
  const { data: user } = useSession()
  const queryClient = useQueryClient()
  const isSongEditor = /^\/songs\/[^/]+$/.test(pathname)
  const [chooserOpen, setChooserOpen] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)

  const teamsQ = useInfiniteQuery({
    queryKey: [...teamsListRootKey, 'songCreateChooser', ''] as const,
    initialPageParam: 0,
    enabled: chooserOpen || createOpen || importOpen,
    queryFn: async ({ pageParam, signal }) => {
      return fetchTeamsPage(queryClient, { page: pageParam as number, q: '', signal })
    },
    getNextPageParam: (_last, all) => getNextPageIndex(all),
  })

  const canImport = useMemo(() => {
    if (!user?.id) return false
    const pages = teamsQ.data?.pages ?? []
    const teams = pages.flatMap((p) => p.items)
    return teams.some((tm) => canEditTeamLibrary(tm, user.id))
  }, [teamsQ.data?.pages, user?.id])

  useEffect(() => {
    if (isSongEditor) return
    const p = new URLSearchParams(location.search)
    if (p.get('new') !== '1') return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- latch from `?new=1` like `/setlists`
    setChooserOpen(true)
    void navigate({ to: '/songs', replace: true })
  }, [isSongEditor, location.search, navigate])

  if (isSongEditor) {
    return <Outlet />
  }

  return (
    <>
      <EntityListView entity="songs" />
      <SongCreateChooserSheet
        open={chooserOpen}
        onOpenChange={setChooserOpen}
        online={online}
        canImport={canImport}
        onNewSong={() => setCreateOpen(true)}
        onImport={() => setImportOpen(true)}
      />
      <CreateSongDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={(id) => {
          setCreateOpen(false)
          void navigate({ to: '/songs/$songId', params: { songId: id } })
        }}
      />
      <ImportSongsDialog open={importOpen} onOpenChange={setImportOpen} online={online} />
    </>
  )
}
