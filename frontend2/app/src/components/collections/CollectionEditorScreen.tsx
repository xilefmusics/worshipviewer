import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import { restrictToParentElement, restrictToVerticalAxis } from '@dnd-kit/modifiers'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { ChangeEvent, CSSProperties } from 'react'
import { useQueries, useQueryClient, useInfiniteQuery } from '@tanstack/react-query'
import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { fetchSongForHubSlot } from '@/api/setlists-detail'
import { fetchTeamDetail, fetchTeamsPage } from '@/api/teams-sessions-fetch'
import type { Team } from '@/api/teams-sessions-fetch'
import { putCollectionCover } from '@/api/collection-cover-upload'
import { MoveSongToCollectionDialog } from '@/components/collections/MoveSongToCollectionDialog'
import { ArrowRightLeftIcon } from '@/components/icons/arrow-right-left-icon'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useCanEditCollection } from '@/hooks/useCanEditCollection'
import { useCollectionAutosave } from '@/hooks/useCollectionAutosave'
import { useCollectionDetailQuery } from '@/hooks/useCollectionDetailQuery'
import { useCoverImageSrc } from '@/hooks/useCoverImageSrc'
import { useOnline } from '@/hooks/use-online'
import { useSession } from '@/hooks/useSession'
import { useRegisterSetlistPaletteBridge } from '@/context/SetlistPaletteBridgeContext'
import { brokenSlotGate, type SongHydrationOutcome } from '@/lib/setlist-broken-rows'
import { makeSlotRow, slotsFromSongLinks, type SlotRow } from '@/lib/setlist-editor-slots'
import type { SetlistPaletteBridge } from '@/lib/setlist-palette-bridge'
import { hubListRootKey } from '@/lib/hub-list-keys'
import { collectionDetailKey, songDetailQueryKey } from '@/lib/setlist-detail-key'
import {
  coerceMusicalKeyString,
  normalizeSongLinkNr,
  normalizeSongLinksForCollectionEditor,
  removeAt,
  resolveSongDataKey,
  type SongLink,
} from '@/lib/setlist-song-links'
import { formattedTimeSignature, normalizedTempoBpm } from '@/lib/song-display-meta'
import { getTeamDisplayName } from '@/lib/team-display-name'
import { canEditTeamLibrary } from '@/lib/team-permissions'
import { getNextPageIndex } from '@/lib/list-pagination'
import { teamDetailKey, teamsListRootKey } from '@/lib/teams-sessions-keys'
import { cn } from '@/lib/utils'

const BRIDGE_KEYS: Pick<
  Required<SetlistPaletteBridge>,
  'cmdkInsertHeadingKey' | 'duplicateBadgeKey' | 'pickerExcludedKey'
> = {
  cmdkInsertHeadingKey: 'collections.editor.cmdkInsertHeading',
  duplicateBadgeKey: 'collections.editor.duplicateBadge',
  pickerExcludedKey: 'collections.editor.pickerExcluded',
}

export function CollectionEditorScreen({ collectionId }: { collectionId: string }) {
  const { t } = useTranslation()
  const { data: user } = useSession()
  const queryClient = useQueryClient()
  const online = useOnline()

  const { data: detail, isPending, error, refetch } = useCollectionDetailQuery(collectionId)
  const { canEdit, team: owningTeamDetail } = useCanEditCollection(detail?.owner)

  const [slotRows, setSlotRows] = useState<SlotRow[]>([])
  const [titleDraft, setTitleDraft] = useState('')
  const [coverDraft, setCoverDraft] = useState('')
  const [ownerDraft, setOwnerDraft] = useState('')
  const [coverUploading, setCoverUploading] = useState(false)
  const coverFileInputRef = useRef<HTMLInputElement>(null)
  const lastLoadedCollectionRef = useRef<string>('')

  useEffect(() => {
    lastLoadedCollectionRef.current = ''
  }, [collectionId])

  const offlineFrozen = !online && canEdit
  const [resumePrompt, setResumePrompt] = useState(false)
  const wentOfflineEditing = useRef(false)

  useEffect(() => {
    if (!online && canEdit) wentOfflineEditing.current = true
    if (online && wentOfflineEditing.current) {
      setResumePrompt(true)
      wentOfflineEditing.current = false
    }
  }, [online, canEdit])

  useLayoutEffect(() => {
    if (!detail || detail.id !== collectionId) return
    if (lastLoadedCollectionRef.current === collectionId) return
    lastLoadedCollectionRef.current = collectionId
    setTitleDraft(detail.title)
    setCoverDraft(detail.cover ?? '')
    setOwnerDraft(detail.owner)
    setSlotRows(slotsFromSongLinks(normalizeSongLinksForCollectionEditor(detail.songs)))
  }, [detail, collectionId])

  const draftLinks = useMemo(() => slotRows.map((s) => s.link), [slotRows])

  const baseline = useMemo(
    () =>
      detail
        ? {
            title: detail.title,
            songs: normalizeSongLinksForCollectionEditor(detail.songs),
            cover: detail.cover ?? '',
            owner: detail.owner,
          }
        : null,
    [detail],
  )

  const teamsQ = useInfiniteQuery({
    queryKey: [...teamsListRootKey, 'collectionEditor', collectionId] as const,
    initialPageParam: 0,
    enabled: Boolean(detail?.id === collectionId && canEdit && user?.id),
    queryFn: async ({ pageParam, signal }: { pageParam: unknown; signal?: AbortSignal }) => {
      const page = pageParam as number
      return fetchTeamsPage(queryClient, { page, q: '', signal })
    },
    getNextPageParam: (_last, all) => getNextPageIndex(all),
  })

  const allTeams = useMemo(() => {
    const pages = teamsQ.data?.pages ?? []
    return pages.flatMap((p) => p.items) as Team[]
  }, [teamsQ.data?.pages])

  const writableTeams = useMemo(() => {
    if (!user?.id) return []
    return allTeams.filter((tm) => canEditTeamLibrary(tm, user.id))
  }, [allTeams, user])

  const teamPickerChoices = useMemo(() => {
    const byId = new Map<string, Team>()
    for (const tm of writableTeams) {
      byId.set(tm.id, tm)
    }
    const oid = detail?.owner
    if (
      oid &&
      owningTeamDetail?.id === oid &&
      user?.id &&
      canEditTeamLibrary(owningTeamDetail, user.id) &&
      !byId.has(oid)
    ) {
      byId.set(oid, owningTeamDetail)
    }
    return [...byId.values()]
  }, [detail?.owner, owningTeamDetail, user, writableTeams])

  const showTeamPicker = canEdit && teamPickerChoices.length > 1

  const { src: coverPreviewSrc, onImageError: onCoverPreviewError } = useCoverImageSrc(coverDraft)

  const hydrationQueries = useQueries({
    queries: slotRows.map((row) => ({
      queryKey: songDetailQueryKey(row.link.id),
      enabled: Boolean(detail && row.link.id),
      staleTime: 5 * 60_000,
      queryFn: ({ signal }: { signal?: AbortSignal }) =>
        fetchSongForHubSlot(queryClient, { id: row.link.id, signal }),
    })),
  })

  const hydrationOutcomes: SongHydrationOutcome[] = useMemo(
    () =>
      hydrationQueries.map((q) => {
        if (q.isPending) return { kind: 'loading' as const }
        if (q.isError) return { kind: 'broken' as const }
        if (q.data === null) return { kind: 'broken' as const }
        return { kind: 'ok' as const, notASong: q.data.not_a_song }
      }),
    [hydrationQueries],
  )

  const songOwnerIds = useMemo(() => {
    const ids = new Set<string>()
    for (const q of hydrationQueries) {
      if (q.data?.owner) ids.add(q.data.owner)
    }
    return [...ids]
  }, [hydrationQueries])

  const ownerTeamQueries = useQueries({
    queries: songOwnerIds.map((ownerId) => ({
      queryKey: teamDetailKey(ownerId),
      queryFn: ({ signal }: { signal?: AbortSignal }) =>
        fetchTeamDetail(queryClient, { id: ownerId, signal }),
      staleTime: 5 * 60_000,
    })),
  })

  const { saveBlocked: brokenGate } = brokenSlotGate(hydrationOutcomes)

  const canAutosavePatch = Boolean(canEdit && !offlineFrozen && !brokenGate && baseline && detail && !resumePrompt)

  const {
    notifyDraftEdited,
    flushNow,
    patchInFlight,
    saveIcon,
    saveFailure,
    retrySave,
    discardFailedSave,
  } = useCollectionAutosave({
    collectionId,
    baseline,
    draftTitle: titleDraft,
    draftSongs: draftLinks,
    draftCover: coverDraft,
    draftOwner: ownerDraft,
    canAutosavePatch,
  })

  const blockingAll = patchInFlight || !!saveFailure || offlineFrozen || !canEdit || resumePrompt
  const dndBlocked = blockingAll || !canEdit
  const isUsersDefaultCollection = Boolean(
    user?.default_collection != null && user.default_collection !== '' && user.default_collection === collectionId,
  )
  const titleAndTeamDisabled = blockingAll || isUsersDefaultCollection
  const announcingRef = useRef<HTMLParagraphElement>(null)
  type MoveDialogSlot = { index: number; titlePreview: string }
  const [moveDialogSlot, setMoveDialogSlot] = useState<MoveDialogSlot | null>(null)
  const moveUiReady = canAutosavePatch && !patchInFlight && !saveFailure

  const bridge: SetlistPaletteBridge | null = useMemo(() => {
    if (!detail || !canEdit || offlineFrozen || resumePrompt) return null
    return {
      songLinks: draftLinks,
      canInsert: !patchInFlight,
      flushBeforeInsert: flushNow,
      insertSongLink: (link: SongLink) => {
        setSlotRows((prev) => [...prev, makeSlotRow({ ...link, nr: normalizeSongLinkNr(link.nr) })])
        queueMicrotask(() => notifyDraftEdited())
      },
      ...BRIDGE_KEYS,
    }
  }, [
    canEdit,
    detail,
    draftLinks,
    flushNow,
    notifyDraftEdited,
    offlineFrozen,
    patchInFlight,
    resumePrompt,
  ])

  useRegisterSetlistPaletteBridge(bridge)

  const retryAfterUntil = saveFailure?.retryAfterUntil
  const [retrySec, setRetrySec] = useState(0)
  useEffect(() => {
    if (!retryAfterUntil) {
      const resetId = window.setTimeout(() => setRetrySec(0), 0)
      return () => window.clearTimeout(resetId)
    }
    const compute = () => Math.max(0, Math.ceil((retryAfterUntil - Date.now()) / 1000))
    const id = window.setInterval(() => {
      setRetrySec(compute())
    }, 400)
    const raf = requestAnimationFrame(() => setRetrySec(compute()))
    return () => {
      cancelAnimationFrame(raf)
      window.clearInterval(id)
    }
  }, [retryAfterUntil])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  function onDragEnd(evt: DragEndEvent) {
    if (dndBlocked) return
    const { active, over } = evt
    if (!over || active.id === over.id) return
    setSlotRows((rows) => {
      const oldIndex = rows.findIndex((r) => r.slotId === active.id)
      const newIndex = rows.findIndex((r) => r.slotId === over.id)
      if (oldIndex < 0 || newIndex < 0) return rows
      return arrayMove(rows, oldIndex, newIndex)
    })
    notifyingLive(t('collections.editor.a11yMoved', { position: '' }))
    notifyDraftEdited()
  }

  function notifyingLive(msg: string) {
    const el = announcingRef.current
    if (el) el.textContent = msg
  }

  async function onCoverFilePicked(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || blockingAll || !canEdit) return
    setCoverUploading(true)
    try {
      const updated = await putCollectionCover(collectionId, file)
      queryClient.setQueryData(collectionDetailKey(collectionId), updated)
      setCoverDraft(updated.cover ?? '')
      void queryClient.invalidateQueries({
        queryKey: [...hubListRootKey, 'collections'],
        refetchType: 'none',
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : ''
      if (msg === 'unsupported_type') toast.error(t('collections.editor.coverUnsupportedType'))
      else if (msg === 'payload_too_large') toast.error(t('collections.editor.coverTooLarge'))
      else toast.error(t('collections.editor.coverUploadFailed'))
    } finally {
      setCoverUploading(false)
    }
  }

  const discardBrokenToBaseline = () => {
    if (!detail) return
    setTitleDraft(detail.title)
    setCoverDraft(detail.cover ?? '')
    setOwnerDraft(detail.owner)
    setSlotRows(slotsFromSongLinks(normalizeSongLinksForCollectionEditor(detail.songs)))
    notifyDraftEdited()
  }

  async function discardResumeReload() {
    setResumePrompt(false)
    wentOfflineEditing.current = false
    await queryClient.invalidateQueries({ queryKey: collectionDetailKey(collectionId) })
    const r = await refetch()
    if (r.data) {
      setTitleDraft(r.data.title)
      setCoverDraft(r.data.cover ?? '')
      setOwnerDraft(r.data.owner)
      setSlotRows(slotsFromSongLinks(normalizeSongLinksForCollectionEditor(r.data.songs)))
    }
  }

  const saveAria = useMemo(() => {
    if (offlineFrozen) return t('collections.editor.bannerOfflineEditing')
    if (brokenGate && !saveFailure) return t('collections.editor.brokenAutosavePaused')
    if (patchInFlight) return t('collections.editor.saveStatusSaving')
    if (saveFailure) return t('collections.editor.saveFailedShort')
    if (saveIcon === 'pending') return t('collections.editor.saveStatusPending')
    return t('collections.editor.saveStatusIdle')
  }, [offlineFrozen, brokenGate, patchInFlight, saveFailure, saveIcon, t])

  if (isPending || !detail) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-[var(--color-muted-foreground)]">
        {error ? String((error as Error).message) : t('common.load')}
      </div>
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-4 pb-10">
      <p ref={announcingRef} className="sr-only" aria-live="polite" />

      {!canEdit ? (
        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-muted)]/40 px-3 py-2 text-sm">
          {t('collections.editor.readOnlyBanner')}
        </div>
      ) : null}
      {offlineFrozen ? (
        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-muted)]/40 px-3 py-2 text-sm">
          {t('collections.editor.bannerOfflineEditing')}
        </div>
      ) : null}
      {brokenGate && !saveFailure ? (
        <div className="rounded-lg border border-[var(--color-danger)]/50 bg-[var(--color-danger)]/10 px-3 py-2 text-sm text-[var(--color-foreground)]">
          <p>{t('collections.editor.removeBrokenToSave')}</p>
          <div className="mt-2">
            <Button type="button" variant="outline" size="sm" onClick={() => discardBrokenToBaseline()}>
              {t('collections.editor.discardToServer')}
            </Button>
          </div>
        </div>
      ) : null}
      {saveFailure ? (
        <div className="rounded-lg border border-[var(--color-danger)]/50 bg-[var(--color-danger)]/10 px-3 py-2 text-sm">
          <p className="font-medium">{saveFailure.message}</p>
          <div className="mt-3 flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={retrySec > 0}
              onClick={() => void retrySave()}
            >
              {retrySec > 0 ? t('collections.editor.retryIn', { seconds: retrySec }) : t('collections.editor.retry')}
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => {
                const rolled = discardFailedSave()
                if (rolled) {
                  setTitleDraft(rolled.title)
                  setCoverDraft(rolled.cover)
                  setOwnerDraft(rolled.owner)
                  setSlotRows(slotsFromSongLinks(rolled.songs))
                }
              }}
            >
              {t('collections.editor.discardLocal')}
            </Button>
          </div>
        </div>
      ) : null}
      {resumePrompt ? (
        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm shadow-sm">
          <p className="font-medium">{t('collections.editor.resumePrompt')}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              onClick={async () => {
                await flushNow()
                setResumePrompt(false)
              }}
            >
              {t('collections.editor.resumeRetry')}
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => void discardResumeReload()}>
              {t('collections.editor.resumeDiscard')}
            </Button>
          </div>
        </div>
      ) : null}

      <div className="flex flex-col gap-2 bg-[var(--color-background)]/90 py-3 backdrop-blur">
        <div className="grid gap-1.5">
          <label className="text-sm font-medium" htmlFor={`collection-editor-title-${collectionId}`}>
            {t('collections.create.titleLabel')}
          </label>
          <div className="relative">
            <Input
              id={`collection-editor-title-${collectionId}`}
              className="min-h-12 w-full pr-11 text-base font-semibold"
              value={titleDraft}
              disabled={titleAndTeamDisabled}
              autoComplete="off"
              onChange={(e) => {
                if (titleAndTeamDisabled) return
                setTitleDraft(e.target.value)
              }}
              onBlur={() => {
                if (titleAndTeamDisabled) return
                void flushNow()
              }}
              maxLength={200}
            />
            <div
              role="status"
              aria-live="polite"
              className="pointer-events-none absolute right-2.5 top-1/2 flex -translate-y-1/2 flex-col items-center gap-0.5 text-xs"
            >
              <span
                aria-hidden
                className={cn(
                  saveIcon === 'saving' &&
                    'inline-flex size-5 animate-spin rounded-full border-2 border-[var(--color-muted)] border-t-[var(--color-primary)]',
                )}
              >
                {saveIcon === 'pending' ? <span className="size-2 rounded-full bg-[var(--color-primary)]" /> : null}
                {saveIcon === 'idle' ? <span className="size-2 rounded-full opacity-35" /> : null}
                {saveIcon === 'error' ? <span aria-hidden className="text-[var(--color-danger)]">!</span> : null}
              </span>
              <span className="sr-only">{saveAria}</span>
            </div>
          </div>
        </div>
        {showTeamPicker ? (
          <div className="grid gap-1.5">
            <label className="text-sm font-medium" htmlFor={`collection-editor-owner-${collectionId}`}>
              {t('collections.create.teamLabel')}
            </label>
            <Select
              value={ownerDraft}
              onValueChange={(v) => {
                if (titleAndTeamDisabled) return
                setOwnerDraft(v)
                notifyDraftEdited()
              }}
              disabled={titleAndTeamDisabled}
            >
              <SelectTrigger
                id={`collection-editor-owner-${collectionId}`}
                aria-label={t('collections.create.teamLabel')}
                className={cn('font-normal shadow-sm', titleAndTeamDisabled && 'opacity-95')}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {teamPickerChoices.map((tm) => (
                  <SelectItem key={tm.id} value={tm.id}>
                    {getTeamDisplayName(tm, user?.id, t)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}
        <div className="grid gap-1.5">
          <label
            className="text-sm font-medium"
            htmlFor={`collection-editor-cover-file-${collectionId}`}
          >
            {t('collections.editor.coverLabel')}
          </label>
          <div className="flex gap-3">
            <div
              className="relative size-20 shrink-0 overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-muted)]"
              aria-hidden={!coverPreviewSrc}
            >
              {coverPreviewSrc ? (
                <img
                  src={coverPreviewSrc}
                  alt=""
                  draggable={false}
                  className="pointer-events-none size-full object-cover"
                  onError={onCoverPreviewError}
                />
              ) : null}
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <input
                ref={coverFileInputRef}
                id={`collection-editor-cover-file-${collectionId}`}
                type="file"
                accept="image/png,image/jpeg,image/jpg,.png,.jpg,.jpeg"
                className="sr-only"
                onChange={(ev) => void onCoverFilePicked(ev)}
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={blockingAll || !canEdit || coverUploading}
                  onClick={() => coverFileInputRef.current?.click()}
                >
                  {coverUploading ? t('collections.editor.coverUploading') : t('collections.editor.coverChange')}
                </Button>
                {coverDraft.trim() ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-[var(--color-muted-foreground)]"
                    disabled={blockingAll || !canEdit || coverUploading}
                    onClick={() => {
                      if (blockingAll || !canEdit) return
                      setCoverDraft('')
                      notifyDraftEdited()
                    }}
                  >
                    {t('collections.editor.coverRemove')}
                  </Button>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-1.5">
        <h2 className="m-0 text-sm font-medium" id={`collection-editor-songs-${collectionId}`}>
          {t('collections.editor.songsSectionLabel')}
        </h2>
        {!slotRows.length ? (
          <p className="text-center text-sm text-[var(--color-muted-foreground)]">
            {t('collections.editor.emptyHint')}
          </p>
        ) : null}

        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          modifiers={[restrictToVerticalAxis, restrictToParentElement]}
          onDragEnd={(e: DragEndEvent) => onDragEnd(e)}
        >
          <SortableContext items={slotRows.map((s) => s.slotId)} strategy={verticalListSortingStrategy}>
            <ul className="flex flex-col gap-1" aria-labelledby={`collection-editor-songs-${collectionId}`}>
              {slotRows.map((row, idx) => {
                const hydrated = hydrationQueries[idx]?.data
                const hydrationPendingRow = hydrationQueries[idx]?.isPending ?? false
                const brokenHydration =
                  hydrationOutcomes[idx]?.kind === 'broken' ||
                  (hydrationOutcomes[idx]?.kind === 'ok' && hydrationOutcomes[idx].notASong)

                let songOwnerTeamLine: string | null | undefined
                if (hydrated?.owner && !brokenHydration && !hydrationPendingRow) {
                  const oi = songOwnerIds.indexOf(hydrated.owner)
                  if (oi >= 0) {
                    const tq = ownerTeamQueries[oi]
                    if (tq?.isPending) songOwnerTeamLine = null
                    else if (tq?.data) songOwnerTeamLine = getTeamDisplayName(tq.data, user?.id, t)
                    else songOwnerTeamLine = t('setlists.editor.teamUnavailable')
                  }
                }

                return (
                  <CollectionSortableRow
                    key={row.slotId}
                    row={row}
                    draftLinks={draftLinks}
                    hydratedSong={hydrated ?? undefined}
                    hydrationPending={hydrationPendingRow}
                    brokenHydration={brokenHydration}
                    songOwnerTeamLine={songOwnerTeamLine}
                    canEditUi={canEdit && !blockingAll && !offlineFrozen && !resumePrompt}
                    blockingAll={blockingAll || !canEdit}
                    patchInFlight={patchInFlight}
                    duplicateBadgeKey="collections.editor.duplicateBadge"
                    moveUiReady={moveUiReady}
                    onOpenMoveSheet={(songTitlePreview) =>
                      setMoveDialogSlot({ index: idx, titlePreview: songTitlePreview })
                    }
                  />
                )
              })}
            </ul>
          </SortableContext>
        </DndContext>
      </div>

      {moveDialogSlot !== null && slotRows[moveDialogSlot.index] ? (
        <MoveSongToCollectionDialog
          open
          onOpenChange={(open) => {
            if (!open) setMoveDialogSlot(null)
          }}
          sourceCollectionId={collectionId}
          songLink={slotRows[moveDialogSlot.index].link}
          songTitleLine={moveDialogSlot.titlePreview}
          flushBeforeMove={flushNow}
          onMoveComplete={() => {
            const i = moveDialogSlot.index
            setMoveDialogSlot(null)
            setSlotRows((rows) => removeAt(rows, i))
          }}
        />
      ) : null}
    </div>
  )
}

type CollectionSortProps = {
  row: SlotRow
  draftLinks: SongLink[]
  hydratedSong?: import('@/api/setlists-detail').Song
  hydrationPending: boolean
  brokenHydration: boolean
  songOwnerTeamLine?: string | null
  canEditUi: boolean
  blockingAll: boolean
  patchInFlight: boolean
  duplicateBadgeKey: string
  moveUiReady: boolean
  onOpenMoveSheet: (songTitlePreview: string) => void
}

const CollectionSortableRow = memo(function CollectionSortableRow(props: CollectionSortProps) {
  const { t } = useTranslation()
  const {
    row,
    hydratedSong,
    hydrationPending,
    brokenHydration,
    songOwnerTeamLine,
    canEditUi,
    blockingAll,
    draftLinks,
    duplicateBadgeKey,
    moveUiReady,
    onOpenMoveSheet,
  } = props
  const touchStartX = useRef<number | null>(null)

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: row.slotId,
    disabled: blockingAll || !canEditUi,
  })

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.85 : undefined,
    zIndex: isDragging ? 20 : undefined,
  }

  const dup = draftLinks.reduce((acc, l) => acc + (l.id === row.link.id ? 1 : 0), 0)
  const pinned = coerceMusicalKeyString(row.link.key)

  let titleLabel = hydratedSong?.data.titles[0]?.trim() || ''
  const artistsLine = (hydratedSong?.data.artists.filter(Boolean).join(', ') || '').trim()
  if (brokenHydration) titleLabel = t('setlists.editor.unavailable')
  if (!titleLabel && !hydrationPending && !brokenHydration) titleLabel = '…'
  const defaultKey = resolveSongDataKey(hydratedSong?.data)
  const displayChip = pinned ?? defaultKey
  const showKeyOverrideCaption =
    pinned != null && defaultKey != null && defaultKey !== pinned && !hydrationPending && !brokenHydration

  const bpm = !hydrationPending && !brokenHydration ? normalizedTempoBpm(hydratedSong?.data.tempo) : null
  const meter = !hydrationPending && !brokenHydration ? formattedTimeSignature(hydratedSong?.data.time) : null
  let tempoMeterLine: string | null = null
  if (bpm != null && meter) tempoMeterLine = t('setlists.editor.songTempoAndMeter', { bpm, meter })
  else if (bpm != null) tempoMeterLine = t('setlists.editor.songTempoOnly', { bpm })
  else if (meter) tempoMeterLine = t('setlists.editor.songMeterOnly', { meter })

  return (
    <li
      ref={setNodeRef}
      style={style}
      className="relative flex rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)]"
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        className={cn(
          'flex w-10 shrink-0 cursor-grab touch-none items-center justify-center self-stretch rounded-l-lg border-0 border-r border-[var(--color-border)] bg-transparent text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)]/40 active:cursor-grabbing',
          (blockingAll || !canEditUi) && 'pointer-events-none opacity-35',
        )}
        aria-label={t('collections.editor.dragHandleAria')}
      >
        ::
      </button>
      <div
        className="flex min-w-0 flex-1 items-start gap-2 py-3 pr-2 pl-2"
        style={{ touchAction: 'pan-y' }}
        onTouchStart={(e) => {
          touchStartX.current = e.changedTouches[0].clientX
        }}
        onTouchEnd={(e) => {
          if (blockingAll || !canEditUi) return
          if (touchStartX.current === null) return
          const dx = e.changedTouches[0].clientX - touchStartX.current
          touchStartX.current = null
          if (dx < -72 && moveUiReady) onOpenMoveSheet(titleLabel)
        }}
      >
        <div className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_auto] items-start gap-x-2 gap-y-1">
          {hydrationPending && !brokenHydration ? (
            <div className="col-span-2 h-4 w-2/3 max-w-full animate-pulse rounded bg-[var(--color-muted)]" />
          ) : (
            <>
              <p className={cn('min-w-0 line-clamp-2 font-medium leading-snug', brokenHydration && 'text-[var(--color-danger)]')}>
                {titleLabel || '—'}
              </p>
              <div className="inline-flex max-w-[11rem] min-w-0 shrink-0 justify-self-end" aria-hidden />

              <div className="min-w-0">
                {!brokenHydration && artistsLine ? (
                  <p className="truncate text-xs text-[var(--color-muted-foreground)]">{artistsLine}</p>
                ) : null}
              </div>
              <div className="inline-flex max-w-[11rem] min-w-0 flex-col gap-1 justify-self-end">
                {!brokenHydration && hydratedSong ? (
                  <p
                    className={cn(
                      'w-full truncate text-xs',
                      pinned == null && defaultKey != null
                        ? 'text-[var(--color-muted-foreground)]'
                        : 'text-[var(--color-foreground)]',
                    )}
                  >
                    {t('setlists.editor.keyChip', { symbol: displayChip ?? '—' })}
                  </p>
                ) : null}
                {showKeyOverrideCaption ? (
                  <p className="w-full truncate text-xs text-[var(--color-muted-foreground)]">
                    {t('setlists.editor.songOriginalKey', { symbol: defaultKey ?? '—' })}
                  </p>
                ) : null}
              </div>

              <div className="min-w-0">
                {songOwnerTeamLine === null ? (
                  <div className="h-3 w-28 max-w-full animate-pulse rounded bg-[var(--color-muted)]" aria-hidden />
                ) : songOwnerTeamLine ? (
                  <p className="truncate text-xs text-[var(--color-muted-foreground)]">{songOwnerTeamLine}</p>
                ) : null}
              </div>
              <div className="inline-flex max-w-[11rem] min-w-0 flex-col justify-self-end">
                {tempoMeterLine ? (
                  <p className="w-full truncate text-xs text-[var(--color-muted-foreground)]">{tempoMeterLine}</p>
                ) : null}
              </div>
            </>
          )}
          {dup > 1 ? (
            <p className="col-span-2 mt-0.5 text-[0.65rem] uppercase text-[var(--color-muted-foreground)]">
              {t(duplicateBadgeKey, { count: dup })}
            </p>
          ) : null}
        </div>
        {canEditUi && !blockingAll ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="hidden shrink-0 sm:flex"
            aria-label={t('collections.editor.moveAria')}
            onClick={() => onOpenMoveSheet(titleLabel)}
            disabled={blockingAll || !canEditUi || !moveUiReady}
          >
            <ArrowRightLeftIcon size={18} className="shrink-0" />
          </Button>
        ) : null}
      </div>
    </li>
  )
})
