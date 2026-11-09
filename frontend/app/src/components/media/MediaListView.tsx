import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import {
  deleteMedia,
  duplicateMedia,
  fetchMediaPage,
  mediaDetailKey,
  mediaListKey,
  mediaListRootKey,
  moveMedia,
  updateMedia,
  type Media,
} from '@/api/media'
import { mediaAssetDataUrl } from '@/api/media-upload'
import { ArrowRightLeftIcon } from '@/components/icons/arrow-right-left-icon'
import { CopyIcon } from '@/components/icons/lucide-animated/copy-icon'
import { LayersIcon } from '@/components/icons/lucide-animated/layers-icon'
import { PencilIcon } from '@/components/icons/lucide-animated/pencil-icon'
import { TrashIcon } from '@/components/icons/lucide-animated/trash-icon'
import { DeckPagePreview } from '@/components/media/DeckPagePreview'
import {
  HUB_ACTION_ICON_CLASS,
  HubActionItem,
  HubActionSeparator,
  HubActionsDrawer,
} from '@/components/hub/HubActionsDrawer'
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useHubSearch } from '@/hooks/useHubSearch'
import { useSession } from '@/hooks/useSession'
import { useTeamDetail } from '@/hooks/useTeamDetail'
import { useWritableTeams } from '@/hooks/useWritableTeams'
import { useOnline } from '@/hooks/use-online'
import { getNextPageIndex } from '@/lib/list-pagination'
import { mediaDisplayKind } from '@/lib/media-display'
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
      {!query.isError && items.map((media) => (
        <MediaRow
          key={media.id}
          media={media}
          canMove={writableTeams.some((team) => team.id !== media.owner)}
          onPlay={() =>
            void navigate({ to: '/player/media/$mediaId', params: { mediaId: media.id } })
          }
          onEdit={() =>
            void navigate({
              to: '/media/$mediaId',
              params: { mediaId: media.id },
              search: emptyEditorReturnSearch(),
            })
          }
          onMove={() => setMoveTarget(media)}
          onDelete={() => setDeleteTarget(media)}
        />
      ))}
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

function MediaRowPreview({ media }: { media: Media }) {
  const previewBlobId = media.content.type === 'image'
    ? media.content.blob_id
    : media.content.type === 'video' ? media.content.thumbnail_blob_id : null
  const imageUrl = previewBlobId ? mediaAssetDataUrl(media.id, previewBlobId) : null
  const firstDeckPage = media.content.type === 'slide_deck' ? media.content.pages[0] : undefined
  const [failedImageUrl, setFailedImageUrl] = useState<string | null>(null)

  return (
    <span
      className="flex h-12 w-16 shrink-0 items-center justify-center overflow-hidden rounded-md border border-[var(--color-border)] bg-[var(--color-muted)]/30 text-[var(--color-muted-foreground)]"
      aria-hidden="true"
    >
      {imageUrl && failedImageUrl !== imageUrl ? (
        <img
          src={imageUrl}
          alt=""
          loading="lazy"
          crossOrigin="use-credentials"
          draggable={false}
          className="size-full object-cover"
          onError={() => setFailedImageUrl(imageUrl)}
        />
      ) : firstDeckPage ? (
        <DeckPagePreview
          mediaId={media.id}
          blobId={firstDeckPage.blob_id}
          label={media.title}
          className="!aspect-auto !h-full !w-full"
        />
      ) : (
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <path d="M14 2v6h6" />
          <path d="M8 13h8M8 17h8" />
        </svg>
      )}
    </span>
  )
}

type MediaRowProps = {
  media: Media
  canMove: boolean
  onPlay: () => void
  onEdit: () => void
  onMove: () => void
  onDelete: () => void
}

function MediaRow({ media, canMove, onPlay, onEdit, onMove, onDelete }: MediaRowProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const { data: user } = useSession()
  const { data: ownerTeam, isPending: ownerTeamPending, isError: ownerTeamError } = useTeamDetail(media.owner)
  const online = useOnline()
  const [itemHot, setItemHot] = useState<string | null>(null)
  const canEdit = Boolean(ownerTeam && user?.id && canEditTeamLibrary(ownerTeam, user.id))
  const kind = mediaDisplayKind(media)
  const teamLabel = useMemo(() => {
    if (ownerTeamPending) return null
    if (ownerTeamError || !ownerTeam) return t('setlists.editor.teamUnavailable')
    return getTeamDisplayName(ownerTeam, user?.id, t)
  }, [ownerTeam, ownerTeamError, ownerTeamPending, t, user?.id])
  const duplicateMutation = useMutation({
    mutationFn: () => duplicateMedia(queryClient, media.id, t('media.duplicate.title', { title: media.title })),
    onSuccess: (created) => {
      void queryClient.invalidateQueries({ queryKey: mediaListRootKey })
      toast.success(t('media.actions.duplicated', { title: created.title }))
    },
    onError: (cause: Error) => toast.error(t('media.actions.duplicateFailed'), { description: cause.message }),
  })
  const backgroundMutation = useMutation({
    mutationFn: (isBackground: boolean) =>
      updateMedia(queryClient, media.id, { title: media.title, is_background: isBackground }),
    onSuccess: (updated) => {
      queryClient.setQueryData(mediaDetailKey(media.id), updated)
      void queryClient.invalidateQueries({ queryKey: mediaListRootKey })
    },
    onError: (cause: Error) =>
      toast.error(t('media.actions.backgroundFailed'), { description: cause.message }),
  })
  return (
    <div className="flex min-h-16 items-center gap-3 border-b border-[var(--color-border)] py-2 last:border-b-0">
      <button
        type="button"
        onClick={onPlay}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-md px-1 py-1 text-left outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-primary)]"
        aria-label={t('media.row.openAria', {
          title: media.title,
          kind: t(`media.kinds.${kind}`),
        })}
      >
        <MediaRowPreview media={media} />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{media.title}</span>
          <span className="flex min-w-0 items-center gap-2 text-sm text-[var(--color-muted-foreground)]">
            <span>{t(`media.kinds.${kind}`)}</span>
            {teamLabel ? (
              <>
                <span aria-hidden>·</span>
                <span className="min-w-0 truncate">{teamLabel}</span>
              </>
            ) : null}
          </span>
        </span>
      </button>
      {canEdit ? (
        <HubActionsDrawer
          title={media.title}
          triggerAriaLabel={t('media.row.actionsAria', { title: media.title })}
        >
          <div role="group" aria-label={t('hub.actions.general')}>
            <div className="px-2 pb-1 text-xs font-semibold text-[var(--color-muted-foreground)]">
              {t('hub.actions.general')}
            </div>
            <HubActionItem onSelect={onEdit} onHoverChange={(hot) => setItemHot(hot ? 'edit' : null)}>
              <PencilIcon isHovered={itemHot === 'edit'} size={16} className={HUB_ACTION_ICON_CLASS} />
              {t('media.actions.edit')}
            </HubActionItem>
            {media.content.type === 'image' || media.content.type === 'video' ? (
              <HubActionItem
                disabled={!online || backgroundMutation.isPending}
                title={!online ? t('hub.createOfflineHint') : undefined}
                onSelect={() => backgroundMutation.mutate(media.is_background !== true)}
                onHoverChange={(hot) => setItemHot(hot ? 'background' : null)}
              >
                <LayersIcon isHovered={itemHot === 'background'} size={16} className={HUB_ACTION_ICON_CLASS} />
                {media.is_background === true
                  ? t('media.actions.removeBackground')
                  : t('media.actions.setBackground')}
              </HubActionItem>
            ) : null}
            <HubActionItem
              disabled={duplicateMutation.isPending}
              onSelect={() => duplicateMutation.mutate()}
              onHoverChange={(hot) => setItemHot(hot ? 'duplicate' : null)}
            >
              <CopyIcon isHovered={itemHot === 'duplicate'} size={16} className={HUB_ACTION_ICON_CLASS} />
              {t('media.actions.duplicate')}
            </HubActionItem>
            {canMove ? (
              <HubActionItem onSelect={onMove} onHoverChange={(hot) => setItemHot(hot ? 'move' : null)}>
                <ArrowRightLeftIcon size={16} className={HUB_ACTION_ICON_CLASS} />
                {t('media.actions.move')}
              </HubActionItem>
            ) : null}
          </div>
          <HubActionSeparator />
          <HubActionItem
            destructive
            onSelect={onDelete}
            onHoverChange={(hot) => setItemHot(hot ? 'delete' : null)}
          >
            <TrashIcon isHovered={itemHot === 'delete'} size={16} className="shrink-0" />
            {t('media.actions.delete')}
          </HubActionItem>
        </HubActionsDrawer>
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
