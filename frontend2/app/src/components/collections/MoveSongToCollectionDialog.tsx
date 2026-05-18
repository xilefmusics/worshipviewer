import * as Dialog from '@radix-ui/react-dialog'
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { api } from '@/api/client'
import { fetchCollectionsPage } from '@/api/list-fetch'
import { parseProblemResponse } from '@/api/problem'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { buildCollectionPatchBody } from '@/lib/collection-field-diff'
import { hubListKey } from '@/lib/hub-list-keys'
import { getNextPageIndex } from '@/lib/list-pagination'
import { collectionDetailKey } from '@/lib/setlist-detail-key'
import {
  normalizeSongLinkId,
  normalizeSongLinksForCollectionEditor,
  type SongLink,
} from '@/lib/setlist-song-links'
import { cn } from '@/lib/utils'

type MoveSongToCollectionDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  sourceCollectionId: string
  /** Slot link from the editor (identifies the song and slot key / nr). */
  songLink: SongLink
  songTitleLine: string
  flushBeforeMove: () => Promise<boolean>
  onMoveComplete: () => void
}

export function MoveSongToCollectionDialog({
  open,
  onOpenChange,
  sourceCollectionId,
  songLink,
  songTitleLine,
  flushBeforeMove,
  onMoveComplete,
}: MoveSongToCollectionDialogProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const shouldReduceMotion = useReducedMotion()
  const [selectedId, setSelectedId] = useState('')

  const {
    data,
    error,
    isPending,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  } = useInfiniteQuery({
    queryKey: hubListKey('collections', ''),
    initialPageParam: 0,
    enabled: open,
    staleTime: 60_000,
    queryFn: async ({ pageParam, signal }) => {
      const page = pageParam as number
      return fetchCollectionsPage(queryClient, { page, q: '', signal })
    },
    getNextPageParam: (_last, allPages) => getNextPageIndex(allPages),
  })

  useEffect(() => {
    if (!open || !hasNextPage || isFetchingNextPage) return
    void fetchNextPage()
  }, [open, hasNextPage, isFetchingNextPage, fetchNextPage])

  const collections = useMemo(() => {
    const pages = data?.pages ?? []
    const flat = pages.flatMap((p) => p.items)
    return [...flat]
      .filter((c) => c.id !== sourceCollectionId)
      .sort((a, b) => b.title.localeCompare(a.title, undefined, { numeric: true }))
  }, [data?.pages, sourceCollectionId])

  const moveMutation = useMutation({
    mutationFn: async (targetCollectionId: string) => {
      const flushed = await flushBeforeMove()
      if (!flushed) {
        throw new Error('flush_failed')
      }

      const { data: src, response: srcRes } = await api.GET('/api/v1/collections/{id}', {
        params: { path: { id: sourceCollectionId } },
      })
      if (!srcRes.ok) {
        const problem = await parseProblemResponse(srcRes.clone())
        throw new Error(problem?.title ?? t('collections.editor.moveToCollection.failed'))
      }
      if (!src) {
        throw new Error(t('collections.editor.moveToCollection.failed'))
      }

      const { data: tgt, response: tgtRes } = await api.GET('/api/v1/collections/{id}', {
        params: { path: { id: targetCollectionId } },
      })
      if (!tgtRes.ok) {
        const problem = await parseProblemResponse(tgtRes.clone())
        throw new Error(problem?.title ?? t('collections.editor.moveToCollection.failed'))
      }
      if (!tgt) {
        throw new Error(t('collections.editor.moveToCollection.failed'))
      }

      const srcNorm = normalizeSongLinksForCollectionEditor(src.songs)
      const fromServer = srcNorm.find(
        (l) => normalizeSongLinkId(l.id) === normalizeSongLinkId(songLink.id),
      )
      if (!fromServer) {
        throw new Error('not_in_collection')
      }

      const linkToMove: SongLink = {
        id: fromServer.id,
        key: songLink.key ?? fromServer.key,
        nr: songLink.nr ?? fromServer.nr,
      }

      const tgtNorm = normalizeSongLinksForCollectionEditor(tgt.songs)
      if (
        tgtNorm.some((l) => normalizeSongLinkId(l.id) === normalizeSongLinkId(linkToMove.id))
      ) {
        return { kind: 'duplicate' as const, title: tgt.title }
      }

      const nextTargetSongs = [...tgtNorm, linkToMove]
      const nextSourceSongs = srcNorm.filter(
        (l) => normalizeSongLinkId(l.id) !== normalizeSongLinkId(linkToMove.id),
      )

      const baselineTgt = {
        title: tgt.title,
        songs: tgt.songs,
        cover: tgt.cover ?? '',
        owner: tgt.owner,
      }
      const draftTgt = { title: tgt.title, songs: nextTargetSongs, cover: tgt.cover ?? '', owner: tgt.owner }

      const baselineSrc = {
        title: src.title,
        songs: src.songs,
        cover: src.cover ?? '',
        owner: src.owner,
      }
      const draftSrc = { title: src.title, songs: nextSourceSongs, cover: src.cover ?? '', owner: src.owner }

      const bodyTgt = buildCollectionPatchBody(baselineTgt, draftTgt)
      const bodySrc = buildCollectionPatchBody(baselineSrc, draftSrc)

      if (!bodyTgt || !bodySrc) {
        throw new Error(t('collections.editor.moveToCollection.failed'))
      }

      const { response: patchTgtRes, data: patchedTgt } = await api.PATCH('/api/v1/collections/{id}', {
        params: { path: { id: targetCollectionId } },
        body: bodyTgt,
      })
      if (!patchTgtRes.ok) {
        const problem = await parseProblemResponse(patchTgtRes.clone())
        throw new Error(problem?.title ?? t('collections.editor.moveToCollection.failed'))
      }

      const { response: patchSrcRes, data: patchedSrc } = await api.PATCH('/api/v1/collections/{id}', {
        params: { path: { id: sourceCollectionId } },
        body: bodySrc,
      })
      if (!patchSrcRes.ok) {
        const problem = await parseProblemResponse(patchSrcRes.clone())
        throw new Error(problem?.title ?? t('collections.editor.moveToCollection.failedPartial'))
      }

      return {
        kind: 'ok' as const,
        targetTitle: tgt.title,
        patchedTgt: patchedTgt ?? undefined,
        patchedSrc: patchedSrc ?? undefined,
      }
    },
    onSuccess: (result) => {
      if (result.kind === 'duplicate') {
        toast.info(t('collections.editor.moveToCollection.alreadyThere'))
        return
      }

      if (result.patchedSrc) {
        queryClient.setQueryData(collectionDetailKey(sourceCollectionId), result.patchedSrc)
      }
      if (result.patchedTgt) {
        queryClient.setQueryData(collectionDetailKey(result.patchedTgt.id), result.patchedTgt)
      }
      void queryClient.invalidateQueries({ queryKey: hubListKey('collections', '') })

      toast.success(
        t('collections.editor.moveToCollection.success', { collection: result.targetTitle }),
      )
      onMoveComplete()
      onOpenChange(false)
    },
    onError: (e: unknown) => {
      const msg = e instanceof Error ? e.message : ''
      if (msg === 'flush_failed') {
        toast.error(t('collections.editor.moveToCollection.flushFailed'))
        return
      }
      if (msg === 'not_in_collection') {
        toast.error(t('collections.editor.moveToCollection.notFound'))
        return
      }
      toast.error(msg || t('collections.editor.moveToCollection.failed'))
    },
  })

  const loadError = error instanceof Error ? error.message : null

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next)
        if (!next) setSelectedId('')
      }}
    >
      <Dialog.Portal forceMount>
        <AnimatePresence>
          {open ? (
            <>
              <Dialog.Overlay forceMount asChild>
                <motion.div
                  className="fixed inset-0 z-[60] bg-black/40"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: shouldReduceMotion ? 0 : 0.18 }}
                />
              </Dialog.Overlay>
              <Dialog.Content forceMount asChild>
                <motion.div
                  className={cn(
                    'fixed left-1/2 top-1/2 z-[70] w-[min(100vw-1.5rem,22rem)] -translate-x-1/2 -translate-y-1/2',
                    'rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-[var(--shadow-elevated)] outline-none',
                  )}
                  initial={{ opacity: 0, scale: 0.97 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.97 }}
                  transition={{ duration: shouldReduceMotion ? 0 : 0.18 }}
                >
                  <Dialog.Title className="text-base font-semibold text-[var(--color-foreground)]">
                    {t('collections.editor.moveToCollection.title')}
                  </Dialog.Title>
                  <p className="mt-1 line-clamp-2 text-sm text-[var(--color-muted-foreground)]">
                    {songTitleLine.trim() || '—'}
                  </p>

                  <div className="mt-4 grid gap-2">
                    <div className="grid gap-1.5 text-sm font-medium">
                      <label htmlFor="move-song-collection-select">
                        {t('collections.editor.moveToCollection.collectionLabel')}
                      </label>
                      <Select
                        value={selectedId || undefined}
                        onValueChange={setSelectedId}
                        disabled={isPending || Boolean(loadError) || collections.length === 0}
                      >
                        <SelectTrigger
                          id="move-song-collection-select"
                          aria-label={t('collections.editor.moveToCollection.selectAria')}
                          className="rounded-md bg-[var(--color-bg)]"
                        >
                          <SelectValue
                            placeholder={t('collections.editor.moveToCollection.placeholder')}
                          />
                        </SelectTrigger>
                        <SelectContent>
                          {collections.map((c) => (
                            <SelectItem key={c.id} value={c.id}>
                              {c.title}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {isPending && collections.length === 0 ? (
                      <p className="text-xs text-[var(--color-muted-foreground)]">
                        {t('collections.editor.moveToCollection.loadingLists')}
                      </p>
                    ) : null}
                    {isFetchingNextPage ? (
                      <p className="text-xs text-[var(--color-muted-foreground)]">
                        {t('collections.editor.moveToCollection.loadingMore')}
                      </p>
                    ) : null}
                    {loadError ? (
                      <p className="text-xs text-[var(--color-danger)]">{loadError}</p>
                    ) : null}
                    {!isPending && !loadError && collections.length === 0 ? (
                      <p className="text-xs text-[var(--color-muted-foreground)]">
                        {t('collections.editor.moveToCollection.empty')}
                      </p>
                    ) : null}
                  </div>

                  <div className="mt-5 flex justify-end gap-2">
                    <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                      {t('collections.editor.moveToCollection.cancel')}
                    </Button>
                    <Button
                      type="button"
                      disabled={!selectedId || moveMutation.isPending}
                      onClick={() => {
                        if (!selectedId) return
                        moveMutation.mutate(selectedId)
                      }}
                    >
                      {t('collections.editor.moveToCollection.confirm')}
                    </Button>
                  </div>
                </motion.div>
              </Dialog.Content>
            </>
          ) : null}
        </AnimatePresence>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
