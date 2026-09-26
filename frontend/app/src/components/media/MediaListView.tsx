import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import {
  deleteMedia,
  duplicateMedia,
  fetchMediaPage,
  mediaListKey,
  mediaListRootKey,
  moveMedia,
  type Media,
} from '@/api/media'
import { Button } from '@/components/ui/button'
import { emptyEditorReturnSearch } from '@/lib/player/player-editor-return'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useHubSearch } from '@/hooks/useHubSearch'
import { useSession } from '@/hooks/useSession'
import { useTeamDetail } from '@/hooks/useTeamDetail'
import { useWritableTeams } from '@/hooks/useWritableTeams'
import { getNextPageIndex } from '@/lib/list-pagination'
import {
  mediaCanonicalUrl,
  mediaDisplayKind,
} from '@/lib/media-display'
import { getTeamDisplayName } from '@/lib/team-display-name'
import { canEditTeamLibrary } from '@/lib/team-permissions'
import { cn } from '@/lib/utils'

export function MediaListView({ backgroundOnly = false }: { backgroundOnly?: boolean }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { debouncedQ, selectedTeamId, setQInput } = useHubSearch()
  const { teams: writableTeams } = useWritableTeams('mediaMove')
  const query = useInfiniteQuery({
    queryKey: mediaListKey(debouncedQ, selectedTeamId, backgroundOnly ? true : undefined),
    initialPageParam: 0,
    queryFn: ({ pageParam, signal }) => fetchMediaPage(queryClient, { page: pageParam as number, q: debouncedQ, teamId: selectedTeamId, isBackground: backgroundOnly ? true : undefined, signal }),
    getNextPageParam: (_last, all) => getNextPageIndex(all),
  })
  const items = useMemo(() => query.data?.pages.flatMap((page) => page.items) ?? [], [query.data?.pages])
  const [deleteTarget, setDeleteTarget] = useState<Media | null>(null)
  const [moveTarget, setMoveTarget] = useState<Media | null>(null)
  const activeTab = backgroundOnly ? 'backgrounds' : 'all'

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteMedia(queryClient, id),
    onSuccess: () => {
      setDeleteTarget(null)
      void queryClient.invalidateQueries({ queryKey: mediaListRootKey })
      toast.success(t('media.actions.deleted'))
    },
    onError: (cause: Error) => toast.error(t('media.actions.deleteFailed'), { description: cause.message }),
  })

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col pb-4">
      <nav
        role="tablist"
        aria-label={t('media.list.tabsAria')}
        className="flex items-stretch gap-1 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] p-[0.18rem] shadow-[var(--shadow-elevated)]"
      >
        {(['all', 'backgrounds'] as const).map((tab) => {
          const selected = activeTab === tab
          return (
            <button
              key={tab}
              type="button"
              role="tab"
              id={`media-library-tab-${tab}`}
              aria-selected={selected}
              aria-controls="media-library-panel"
              tabIndex={selected ? 0 : -1}
              onClick={() =>
                void navigate({
                  to: '/media',
                  search: { is_background: tab === 'backgrounds' ? 'true' : undefined },
                })
              }
              className={cn(
                'min-w-0 flex-1 rounded-full px-3 py-2.5 text-sm font-medium transition-colors',
                selected
                  ? 'bg-[var(--color-primary)] text-[var(--color-primary-foreground)]'
                  : 'text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)]',
              )}
            >
              {t(tab === 'all' ? 'media.list.allItems' : 'media.list.backgroundItems')}
            </button>
          )
        })}
      </nav>
      <div
        role="tabpanel"
        id="media-library-panel"
        aria-labelledby={`media-library-tab-${activeTab}`}
        className="min-h-0"
      >
      {query.isPending ? <MediaSkeleton /> : null}
      {query.isError ? <div className="flex flex-col items-center gap-3 py-12 text-center"><p className="text-sm text-[var(--color-muted-foreground)]">{t('media.list.error')}</p><Button variant="outline" onClick={() => void query.refetch()}>{t('hub.error.retry')}</Button></div> : null}
      {!query.isPending && !query.isError && items.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <p className="text-sm text-[var(--color-muted-foreground)]">{debouncedQ.trim() ? t('media.list.noResults') : backgroundOnly ? t('media.list.noBackgrounds') : selectedTeamId ? t('media.list.filteredEmpty') : t('media.list.empty')}</p>
          {debouncedQ.trim() ? <Button size="sm" variant="outline" onClick={() => setQInput('')}>{t('hub.empty.clearSearch')}</Button> : null}
        </div>
      ) : null}
      {!query.isError && items.map((media) => <MediaRow key={media.id} media={media} canMove={writableTeams.some((team) => team.id !== media.owner)} onOpen={() => void navigate({ to: '/media/$mediaId', params: { mediaId: media.id }, search: emptyEditorReturnSearch() })} onMove={() => setMoveTarget(media)} onDelete={() => setDeleteTarget(media)} />)}
      {query.hasNextPage ? <div className="flex justify-center py-4"><Button variant="outline" size="sm" disabled={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>{query.isFetchingNextPage ? t('common.load') : t('hub.loadMore')}</Button></div> : null}
      </div>

      <AlertDialog open={deleteTarget != null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>{t('media.delete.title')}</AlertDialogTitle><AlertDialogDescription>{t('media.delete.body', { name: deleteTarget?.title ?? '' })}</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel><Button variant="destructive" disabled={deleteMutation.isPending} onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}>{t('media.actions.delete')}</Button></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <MoveMediaDialog media={moveTarget} onClose={() => setMoveTarget(null)} />
    </div>
  )
}

function MediaSkeleton() {
  const { t } = useTranslation()
  return <div className="flex flex-col" aria-label={t('media.list.loadingAria')}><div className="h-16 animate-pulse border-b border-[var(--color-border)] bg-[var(--color-muted)]/30" /><div className="h-16 animate-pulse border-b border-[var(--color-border)] bg-[var(--color-muted)]/20" /><div className="h-16 animate-pulse border-b border-[var(--color-border)] bg-[var(--color-muted)]/10" /></div>
}

function MediaRow({ media, canMove, onOpen, onMove, onDelete }: { media: Media; canMove: boolean; onOpen: () => void; onMove: () => void; onDelete: () => void }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const { data: user } = useSession()
  const ownerTeam = useTeamDetail(media.owner)
  const canEdit = Boolean(ownerTeam.data && user?.id && canEditTeamLibrary(ownerTeam.data, user.id))
  const kind = mediaDisplayKind(media)
  const duplicateMutation = useMutation({
    mutationFn: () => duplicateMedia(queryClient, media.id, t('media.duplicate.title', { title: media.title })),
    onSuccess: (created) => {
      void queryClient.invalidateQueries({ queryKey: mediaListRootKey })
      toast.success(t('media.actions.duplicated', { title: created.title }))
    },
    onError: (cause: Error) => toast.error(t('media.actions.duplicateFailed'), { description: cause.message }),
  })
  const identity = mediaCanonicalUrl(media)
  return (
    <div className="flex min-h-16 items-center gap-3 border-b border-[var(--color-border)] py-2 last:border-b-0">
      <button type="button" onClick={onOpen} className="min-w-0 flex-1 rounded-md px-1 py-1 text-left outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-primary)]" aria-label={t('media.row.openAria', { title: media.title, kind: t(`media.kinds.${kind}`) })}>
        <span className="block truncate font-medium">{media.title}</span>
        <span className="flex min-w-0 items-center gap-2 text-sm text-[var(--color-muted-foreground)]"><span>{t(`media.kinds.${kind}`)}</span>{identity ? <><span aria-hidden>·</span><span className="truncate">{identity}</span></> : null}</span>
      </button>
      {canEdit ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild><Button type="button" variant="ghost" size="icon" aria-label={t('media.row.actionsAria', { title: media.title })}>•••</Button></DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={onOpen}>{t('media.actions.edit')}</DropdownMenuItem>
            <DropdownMenuItem disabled={duplicateMutation.isPending} onSelect={() => duplicateMutation.mutate()}>{t('media.actions.duplicate')}</DropdownMenuItem>
            {canMove ? <DropdownMenuItem onSelect={onMove}>{t('media.actions.move')}</DropdownMenuItem> : null}
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-[var(--color-destructive)]" onSelect={onDelete}>{t('media.actions.delete')}</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </div>
  )
}

function MoveMediaDialog({ media, onClose }: { media: Media | null; onClose: () => void }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const { teams, user } = useWritableTeams('mediaMove', media != null)
  const choices = teams.filter((team) => team.id !== media?.owner)
  const [owner, setOwner] = useState('')
  const mutation = useMutation({
    mutationFn: () => {
      if (!media || !owner) throw new Error(t('media.validation.destinationRequired'))
      return moveMedia(queryClient, media.id, owner)
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: mediaListRootKey })
      toast.success(t('media.actions.moved'))
      setOwner('')
      onClose()
    },
    onError: (cause: Error) => toast.error(t('media.actions.moveFailed'), { description: cause.message }),
  })
  return (
    <AlertDialog open={media != null} onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader><AlertDialogTitle>{t('media.move.title')}</AlertDialogTitle><AlertDialogDescription>{t('media.move.body', { name: media?.title ?? '' })}</AlertDialogDescription></AlertDialogHeader>
        {choices.length ? <Select value={owner} onValueChange={setOwner}><SelectTrigger aria-label={t('media.move.teamAria')}><SelectValue placeholder={t('media.move.teamPlaceholder')} /></SelectTrigger><SelectContent>{choices.map((team) => <SelectItem key={team.id} value={team.id}>{getTeamDisplayName(team, user?.id, t)}</SelectItem>)}</SelectContent></Select> : <p className="text-sm text-[var(--color-muted-foreground)]">{t('media.move.noTeams')}</p>}
        <AlertDialogFooter><AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel><Button disabled={!owner || mutation.isPending} onClick={() => mutation.mutate()}>{t('media.actions.move')}</Button></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
