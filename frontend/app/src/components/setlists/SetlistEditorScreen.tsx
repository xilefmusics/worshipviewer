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
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { CSSProperties } from 'react'
import { useQueries, useQueryClient, useInfiniteQuery } from '@tanstack/react-query'
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { fetchSongForHubSlot } from '@/api/setlists-detail'
import { fetchTeamDetail, fetchTeamsPage } from '@/api/teams-sessions-fetch'
import type { Team } from '@/api/teams-sessions-fetch'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { PopoverContent, PopoverRoot, PopoverTrigger } from '@/components/ui/popover'
import { TrashIcon } from '@/components/icons/lucide-animated/trash-icon'
import { SetlistSongPickerSheet } from '@/components/setlists/SetlistSongPickerSheet'
import { EditorPlayButton } from '@/components/player/EditorPlayButton'
import { useCanEditSetlist } from '@/hooks/useCanEditSetlist'
import { useSession } from '@/hooks/useSession'
import { useRegisterSetlistPaletteBridge } from '@/context/SetlistPaletteBridgeContext'
import { useOnline } from '@/hooks/use-online'
import { useSetlistAutosave } from '@/hooks/useSetlistAutosave'
import { useSetlistDetailQuery } from '@/hooks/useSetlistDetailQuery'
import { brokenSlotGate, type SongHydrationOutcome } from '@/lib/setlist-broken-rows'
import { MUSICAL_KEYS } from '@/lib/setlist-editor-constants'
import { makeSlotRow, slotsFromSongLinks, type SlotRow } from '@/lib/setlist-editor-slots'
import type { SetlistPaletteBridge } from '@/lib/setlist-palette-bridge'
import {
  coerceMusicalKeyString,
  normalizeSongLinksForEditor,
  removeAt,
  resolveSongDataKey,
  type EditorSongLink,
} from '@/lib/setlist-song-links'
import { setlistDetailKey, songDetailQueryKey } from '@/lib/setlist-detail-key'
import { formattedTimeSignature, normalizedTempoBpm } from '@/lib/song-display-meta'
import { getTeamDisplayName } from '@/lib/team-display-name'
import { canEditTeamLibrary } from '@/lib/team-permissions'
import { getNextPageIndex } from '@/lib/list-pagination'
import { teamDetailKey, teamsListRootKey } from '@/lib/teams-sessions-keys'
import { cn } from '@/lib/utils'

export function SetlistEditorScreen({ setlistId }: { setlistId: string }) {
  const { t } = useTranslation()
  const { data: user } = useSession()
  const queryClient = useQueryClient()
  const online = useOnline()
  const [pickerOpen, setPickerOpen] = useState(false)

  const { data: detail, isPending, error, refetch } = useSetlistDetailQuery(setlistId)
  const { canEdit, team: owningTeamDetail } = useCanEditSetlist(detail?.owner)

  const [slotRows, setSlotRows] = useState<SlotRow[]>([])
  const [titleDraft, setTitleDraft] = useState('')
  const [ownerDraft, setOwnerDraft] = useState('')
  const lastLoadedSetlistRef = useRef<string>('')

  useEffect(() => {
    lastLoadedSetlistRef.current = ''
  }, [setlistId])

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
    if (!detail || detail.id !== setlistId) return
    if (lastLoadedSetlistRef.current === setlistId) return
    lastLoadedSetlistRef.current = setlistId
    setTitleDraft(detail.title)
    setOwnerDraft(detail.owner)
    setSlotRows(slotsFromSongLinks(normalizeSongLinksForEditor(detail.songs)))
  }, [detail, setlistId])

  const draftLinks = useMemo(() => slotRows.map((s) => s.link), [slotRows])

  const baseline = useMemo(
    () =>
      detail
        ? {
            title: detail.title,
            songs: normalizeSongLinksForEditor(detail.songs),
            owner: detail.owner,
          }
        : null,
    [detail],
  )

  const teamsQ = useInfiniteQuery({
    queryKey: [...teamsListRootKey, 'setlistEditor', setlistId] as const,
    initialPageParam: 0,
    enabled: Boolean(detail?.id === setlistId && canEdit && user?.id),
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

  /** Owner team may miss the listing before paginated `/teams` includes it — merge detail fetch. */
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
  } = useSetlistAutosave({
    setlistId,
    baseline,
    draftTitle: titleDraft,
    draftSongs: draftLinks,
    draftOwner: ownerDraft,
    canAutosavePatch,
  })

  const blockingAll = patchInFlight || !!saveFailure || offlineFrozen || !canEdit || resumePrompt
  const dndBlocked = blockingAll || !canEdit
  const announcingRef = useRef<HTMLParagraphElement>(null)

  async function flushBeforePicker() {
    await flushNow()
  }

  const openPickerSafe = async () => {
    if (!canEdit || blockingAll) return
    await flushBeforePicker()
    setPickerOpen(true)
  }

  const duplicateCountFor = useCallback(
    (songId: string) => slotRows.reduce((acc, row) => acc + (row.link.id === songId ? 1 : 0), 0),
    [slotRows],
  )

  const insertSongFromPicker = async (song: { id: string; data?: { key?: unknown } }) => {
    const link: EditorSongLink = {
      id: song.id,
      key: resolveSongDataKey(song.data as Record<string, unknown>),
    }
    setSlotRows((prev) => [...prev, makeSlotRow(link)])
    queueMicrotask(() => notifyDraftEdited())
  }

  /** Cmd-K registration */
  const bridge: SetlistPaletteBridge | null = useMemo(() => {
    if (!detail || !canEdit || offlineFrozen || resumePrompt) return null
    return {
      songLinks: draftLinks,
      canInsert: !patchInFlight,
      flushBeforeInsert: flushNow,
      insertSongLink: (link: EditorSongLink) => {
        setSlotRows((prev) => [...prev, makeSlotRow(link)])
        queueMicrotask(() => notifyDraftEdited())
      },
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
  const [, setRetryTick] = useState(0)
  useEffect(() => {
    if (!retryAfterUntil) return
    const id = window.setInterval(() => setRetryTick((n) => n + 1), 400)
    return () => window.clearInterval(id)
  }, [retryAfterUntil])
  const retrySec = retryAfterUntil
    ? Math.max(0, Math.ceil((retryAfterUntil - Date.now()) / 1000))
    : 0

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
    notifyingLive(t('setlists.editor.a11yMoved', { position: '' }))
    notifyDraftEdited()
  }

  function notifyingLive(msg: string) {
    const el = announcingRef.current
    if (el) el.textContent = msg
  }

  const undoRef = useRef<{ rows: SlotRow[]; title: string } | null>(null)

  function removeAtIndex(index: number) {
    const removed = slotRows[index]
    if (!removed) return
    undoRef.current = { rows: slotRows, title: titleDraft }
    const nextRows = removeAt(slotRows, index)
    setSlotRows(nextRows)
    notifyDraftEdited()
    toast(t('setlists.editor.removedSlot'), {
      duration: 5000,
      action: {
        label: t('setlists.editor.undo'),
        onClick: () => {
          const u = undoRef.current
          if (!u) return
          setSlotRows(u.rows)
          setTitleDraft(u.title)
          notifyDraftEdited()
        },
      },
    })
  }

  const discardBrokenToBaseline = () => {
    if (!detail) return
    setTitleDraft(detail.title)
    setOwnerDraft(detail.owner)
    setSlotRows(slotsFromSongLinks(normalizeSongLinksForEditor(detail.songs)))
    notifyDraftEdited()
  }

  async function discardResumeReload() {
    setResumePrompt(false)
    wentOfflineEditing.current = false
    await queryClient.invalidateQueries({ queryKey: setlistDetailKey(setlistId) })
    const r = await refetch()
    if (r.data) {
      setTitleDraft(r.data.title)
      setOwnerDraft(r.data.owner)
      setSlotRows(slotsFromSongLinks(normalizeSongLinksForEditor(r.data.songs)))
    }
  }

  const saveAria = useMemo(() => {
    if (offlineFrozen) return t('setlists.editor.bannerOfflineEditing')
    if (brokenGate && !saveFailure) return t('setlists.editor.brokenAutosavePaused')
    if (patchInFlight) return t('setlists.editor.saveStatusSaving')
    if (saveFailure) return t('setlists.editor.saveFailedShort')
    if (saveIcon === 'pending') return t('setlists.editor.saveStatusPending')
    return t('setlists.editor.saveStatusIdle')
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

      {/* Sticky-ish title */}
      {!canEdit ? (
        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-muted)]/40 px-3 py-2 text-sm">
          {t('setlists.editor.readOnlyBanner')}
        </div>
      ) : null}
      {offlineFrozen ? (
        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-muted)]/40 px-3 py-2 text-sm">
          {t('setlists.editor.bannerOfflineEditing')}
        </div>
      ) : null}
      {brokenGate && !saveFailure ? (
        <div className="rounded-lg border border-[var(--color-danger)]/50 bg-[var(--color-danger)]/10 px-3 py-2 text-sm text-[var(--color-foreground)]">
          <p>{t('setlists.editor.removeBrokenToSave')}</p>
          <div className="mt-2">
            <Button type="button" variant="outline" size="sm" onClick={() => discardBrokenToBaseline()}>
              {t('setlists.editor.discardToServer')}
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
              {retrySec > 0 ? t('setlists.editor.retryIn', { seconds: retrySec }) : t('setlists.editor.retry')}
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => {
                const rolled = discardFailedSave()
                if (rolled) {
                  setTitleDraft(rolled.title)
                  setOwnerDraft(rolled.owner)
                  setSlotRows(slotsFromSongLinks(rolled.songs))
                }
              }}
            >
              {t('setlists.editor.discardLocal')}
            </Button>
          </div>
        </div>
      ) : null}
      {resumePrompt ? (
        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm shadow-sm">
          <p className="font-medium">{t('setlists.editor.resumePrompt')}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              onClick={async () => {
                await flushNow()
                setResumePrompt(false)
              }}
            >
              {t('setlists.editor.resumeRetry')}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void discardResumeReload()}
            >
              {t('setlists.editor.resumeDiscard')}
            </Button>
          </div>
        </div>
      ) : null}

      <div className="flex flex-col gap-2 bg-[var(--color-background)]/90 py-3 backdrop-blur">
        <div className="grid gap-1.5">
          <div className="flex items-center justify-between gap-2">
            <label className="text-sm font-medium" htmlFor={`setlist-editor-title-${setlistId}`}>
              {t('setlists.create.titleLabel')}
            </label>
            <EditorPlayButton
              entityType="setlist"
              entityId={setlistId}
              canPlay={slotRows.length > 0 && !brokenGate}
              needsFlush={canEdit}
              flushNow={flushNow}
              disabled={patchInFlight || !!saveFailure || brokenGate || slotRows.length === 0}
              disabledAriaLabel={
                slotRows.length === 0 ? t('player.editor.emptySetlist') : undefined
              }
            />
          </div>
          <div className="relative">
            <Input
              id={`setlist-editor-title-${setlistId}`}
              className={cn(
                'min-h-12 w-full pr-11 text-base font-semibold',
                (blockingAll || !canEdit) && 'opacity-95',
              )}
              value={titleDraft}
              readOnly={blockingAll || !canEdit}
              onChange={(e) => {
                if (blockingAll || !canEdit) return
                setTitleDraft(e.target.value)
                notifyDraftEdited()
              }}
              maxLength={200}
            />
            <div
              role="status"
              aria-live="polite"
              className="pointer-events-none absolute right-2.5 top-1/2 flex -translate-y-1/2 flex-col items-center gap-0.5 text-xs"
            >
              <span aria-hidden className={cn(saveIcon === 'saving' && 'inline-flex size-5 animate-spin rounded-full border-2 border-[var(--color-muted)] border-t-[var(--color-primary)]')}>
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
            <label className="text-sm font-medium" htmlFor={`setlist-editor-owner-${setlistId}`}>
              {t('setlists.create.teamLabel')}
            </label>
            <Select
              value={ownerDraft}
              onValueChange={(v) => {
                if (blockingAll || !canEdit) return
                setOwnerDraft(v)
                notifyDraftEdited()
              }}
              disabled={blockingAll || !canEdit}
            >
              <SelectTrigger
                id={`setlist-editor-owner-${setlistId}`}
                aria-label={t('setlists.create.teamLabel')}
                className={cn('font-normal shadow-sm', (blockingAll || !canEdit) && 'opacity-95')}
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
      </div>

      <div className="grid gap-1.5">
        <h2 className="m-0 text-sm font-medium" id={`setlist-editor-songs-${setlistId}`}>
          {t('setlists.editor.songsSectionLabel')}
        </h2>
        {!slotRows.length ? (
          <p className="text-center text-sm text-[var(--color-muted-foreground)]">{t('setlists.editor.emptyHint')}</p>
        ) : null}

        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          modifiers={[restrictToVerticalAxis, restrictToParentElement]}
          onDragEnd={(e: DragEndEvent) => onDragEnd(e)}
        >
          <SortableContext items={slotRows.map((s) => s.slotId)} strategy={verticalListSortingStrategy}>
            <ul className="flex flex-col gap-1" aria-labelledby={`setlist-editor-songs-${setlistId}`}>
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
                <SortableSongRow
                  key={row.slotId}
                  row={row}
                  index={idx}
                  draftLinks={draftLinks}
                  hydratedSong={hydrated ?? undefined}
                  hydrationPending={hydrationPendingRow}
                  brokenHydration={brokenHydration}
                  songOwnerTeamLine={songOwnerTeamLine}
                  canEditUi={canEdit && !blockingAll && !offlineFrozen && !resumePrompt}
                  blockingAll={blockingAll || !canEdit}
                  patchInFlight={patchInFlight}
                  onAnnounce={notifyingLive}
                  onPatchKey={(key) => {
                    setSlotRows((prev) => {
                      const next = [...prev]
                      const cur = next[idx]
                      if (!cur) return prev
                      next[idx] = { ...cur, link: { ...cur.link, key } }
                      return next
                    })
                    queueMicrotask(() => notifyDraftEdited())
                  }}
                  onPatchTempo={(tempo) => {
                    setSlotRows((prev) => {
                      const next = [...prev]
                      const cur = next[idx]
                      if (!cur) return prev
                      next[idx] = { ...cur, link: { ...cur.link, tempo } }
                      return next
                    })
                    queueMicrotask(() => notifyDraftEdited())
                  }}
                  onRemove={() => removeAtIndex(idx)}
                />
              )
            })}
          </ul>
        </SortableContext>
      </DndContext>
      </div>

      {!canEdit || resumePrompt ? null : (
        <Button className="w-full shrink-0" type="button" disabled={offlineFrozen || patchInFlight || !!saveFailure} onClick={() => void openPickerSafe()}>
          {t('setlists.editor.addSong')}
        </Button>
      )}

      <SetlistSongPickerSheet
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        duplicateCountFor={duplicateCountFor}
        blockedAdd={patchInFlight}
        onPickSong={(s) => void insertSongFromPicker(s)}
      />
    </div>
  )
}

type SortProps = {
  row: SlotRow
  index: number
  draftLinks: EditorSongLink[]
  hydratedSong?: import('@/api/setlists-detail').Song
  hydrationPending: boolean
  brokenHydration: boolean
  /** Resolved label for `Song.owner`; `null` while team detail loads; omit when hidden. */
  songOwnerTeamLine?: string | null
  canEditUi: boolean
  blockingAll: boolean
  patchInFlight: boolean
  onAnnounce: (s: string) => void
  onPatchKey: (key: string | null) => void
  onPatchTempo: (tempo: number | null) => void
  onRemove: () => void
}

const SortableSongRow = memo(function SortableSongRow(props: SortProps) {
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

  let titleLabel = hydratedSong?.data.titles?.[0]?.trim() || ''
  const artistsLine = ((hydratedSong?.data.artists ?? []).filter(Boolean).join(', ') || '').trim()
  if (brokenHydration) titleLabel = t('setlists.editor.unavailable')
  if (!titleLabel && !hydrationPending && !brokenHydration) titleLabel = '…'
  const defaultKey = resolveSongDataKey(hydratedSong?.data)
  const displayChip = pinned ?? defaultKey
  const isDefaultInherited = pinned == null && defaultKey != null
  const showSongOriginalKeyCaption = !hydrationPending && !brokenHydration && Boolean(hydratedSong)

  const bpm = !hydrationPending && !brokenHydration ? normalizedTempoBpm(hydratedSong?.data.tempo) : null
  const meter = !hydrationPending && !brokenHydration ? formattedTimeSignature(hydratedSong?.data.time) : null
  const pinnedBpm = normalizedTempoBpm(row.link.tempo)
  const displayBpm = pinnedBpm ?? bpm
  const isTempoInherited = pinnedBpm == null
  const showSongOriginalTempoCaption =
    !hydrationPending && !brokenHydration && Boolean(hydratedSong) && bpm != null
  let songOriginalTempoLine: string | null = null
  if (showSongOriginalTempoCaption && bpm != null) {
    if (meter) songOriginalTempoLine = t('setlists.editor.songTempoAndMeter', { bpm, meter })
    else songOriginalTempoLine = t('setlists.editor.songOriginalTempo', { bpm })
  }

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
        aria-label={t('setlists.editor.dragHandleAria')}
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
          if (dx < -72) props.onRemove()
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
              <div className="inline-flex max-w-[11rem] min-w-0 flex-col justify-self-end gap-1">
                {!brokenHydration && hydratedSong ? (
                  <>
                    <PopoverRoot>
                      <PopoverTrigger asChild>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className={cn(
                            'h-9 w-full justify-start px-2 text-xs',
                            isDefaultInherited && 'border-dashed text-[var(--color-muted-foreground)]',
                          )}
                          disabled={!canEditUi || blockingAll}
                        >
                          {t('setlists.editor.keyChip', { symbol: displayChip ?? '—' })}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-48 p-2" align="end">
                        <div className="grid max-h-60 grid-cols-3 gap-1 overflow-y-auto p-1">
                          {MUSICAL_KEYS.map((k) => (
                            <button
                              key={k}
                              type="button"
                              className="rounded px-2 py-1 text-xs hover:bg-[var(--color-muted)]"
                              onClick={() => props.onPatchKey(k)}
                            >
                              {k}
                            </button>
                          ))}
                        </div>
                      </PopoverContent>
                    </PopoverRoot>
                    <TempoOverrideChip
                      displayBpm={displayBpm}
                      pinnedBpm={pinnedBpm}
                      isInherited={isTempoInherited}
                      canEditUi={canEditUi}
                      blockingAll={blockingAll}
                      onPatchTempo={props.onPatchTempo}
                    />
                  </>
                ) : null}
              </div>

              <div className="min-w-0">
                {!brokenHydration && artistsLine ? (
                  <p className="truncate text-xs text-[var(--color-muted-foreground)]">{artistsLine}</p>
                ) : null}
              </div>
              <div className="inline-flex max-w-[11rem] min-w-0 flex-col justify-self-end gap-1">
                {showSongOriginalKeyCaption ? (
                  <p className="w-full truncate text-xs text-[var(--color-muted-foreground)]">
                    {t('setlists.editor.songOriginalKey', { symbol: defaultKey ?? '—' })}
                  </p>
                ) : null}
                {songOriginalTempoLine ? (
                  <p className="w-full truncate text-xs text-[var(--color-muted-foreground)]">
                    {songOriginalTempoLine}
                  </p>
                ) : null}
              </div>

              <div className="min-w-0">
                {songOwnerTeamLine === null ? (
                  <div
                    className="h-3 w-28 max-w-full animate-pulse rounded bg-[var(--color-muted)]"
                    aria-hidden
                  />
                ) : songOwnerTeamLine ? (
                  <p className="truncate text-xs text-[var(--color-muted-foreground)]">{songOwnerTeamLine}</p>
                ) : null}
              </div>
              <div className="inline-flex max-w-[11rem] min-w-0 flex-col justify-self-end">
                {meter && !showSongOriginalTempoCaption ? (
                  <p className="w-full truncate text-xs text-[var(--color-muted-foreground)]">
                    {t('setlists.editor.songMeterOnly', { meter })}
                  </p>
                ) : null}
              </div>
            </>
          )}
          {dup > 1 ? (
            <p className="col-span-2 mt-0.5 text-[0.65rem] uppercase text-[var(--color-muted-foreground)]">
              {t('setlists.editor.duplicateBadge', { count: dup })}
            </p>
          ) : null}
        </div>
        {canEditUi && !blockingAll ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="hidden shrink-0 sm:flex"
            aria-label={t('setlists.editor.removeAria')}
            onClick={() => props.onRemove()}
            disabled={blockingAll || !canEditUi}
          >
            <TrashIcon size={18} />
          </Button>
        ) : null}
      </div>
    </li>
  )
})

function parseTempoDraft(value: string): number | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  const n = Number(trimmed)
  if (!Number.isFinite(n)) return null
  return normalizedTempoBpm(Math.round(n))
}

type TempoOverrideChipProps = {
  displayBpm: number | null
  pinnedBpm: number | null
  isInherited: boolean
  canEditUi: boolean
  blockingAll: boolean
  onPatchTempo: (tempo: number | null) => void
}

function TempoOverrideChip({
  displayBpm,
  pinnedBpm,
  isInherited,
  canEditUi,
  blockingAll,
  onPatchTempo,
}: TempoOverrideChipProps) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState('')
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    setDraft(pinnedBpm != null ? String(pinnedBpm) : displayBpm != null ? String(displayBpm) : '')
  }, [open, pinnedBpm, displayBpm])

  function applyDraft() {
    const parsed = parseTempoDraft(draft)
    if (parsed == null) {
      onPatchTempo(null)
      setOpen(false)
      return
    }
    onPatchTempo(parsed)
    setOpen(false)
  }

  return (
    <PopoverRoot open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={cn(
            'h-9 w-full justify-start px-2 text-xs',
            isInherited && 'border-dashed text-[var(--color-muted-foreground)]',
          )}
          disabled={!canEditUi || blockingAll}
          aria-label={t('setlists.editor.tempoPopoverAria')}
        >
          {displayBpm != null
            ? t('setlists.editor.tempoChip', { bpm: displayBpm })
            : t('setlists.editor.tempoChipPlaceholder')}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-48 p-2" align="end">
        <div className="grid gap-2">
          <label className="grid gap-1 text-xs">
            <span className="font-medium">{t('setlists.editor.tempoInputLabel')}</span>
            <Input
              type="number"
              inputMode="numeric"
              min={1}
              max={999}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  applyDraft()
                }
              }}
            />
          </label>
          <div className="flex flex-col gap-1">
            <Button type="button" size="sm" onClick={() => applyDraft()}>
              {t('setlists.editor.tempoApply')}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                onPatchTempo(null)
                setOpen(false)
              }}
            >
              {t('setlists.editor.tempoResetToDefault')}
            </Button>
          </div>
        </div>
      </PopoverContent>
    </PopoverRoot>
  )
}
