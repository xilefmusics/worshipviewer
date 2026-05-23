import * as Dialog from '@radix-ui/react-dialog'
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { api } from '@/api/client'
import { fetchSetlistsPage, type Song } from '@/api/list-fetch'
import { parseProblemResponse } from '@/api/problem'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { buildSetlistPatchBody } from '@/lib/setlist-field-diff'
import { setlistDetailKey } from '@/lib/setlist-detail-key'
import {
  normalizeSongLinkId,
  normalizeSongLinksForEditor,
  resolveSongDataKey,
  type EditorSongLink,
} from '@/lib/setlist-song-links'
import { hubListKey } from '@/lib/hub-list-keys'
import { getNextPageIndex } from '@/lib/list-pagination'
import { cn } from '@/lib/utils'

type AddSongToSetlistDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  song: Song
}

export function AddSongToSetlistDialog({ open, onOpenChange, song }: AddSongToSetlistDialogProps) {
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
    queryKey: hubListKey('setlists', ''),
    initialPageParam: 0,
    enabled: open && !song.not_a_song,
    staleTime: 60_000,
    queryFn: async ({ pageParam, signal }) => {
      const page = pageParam as number
      return fetchSetlistsPage(queryClient, { page, q: '', signal })
    },
    getNextPageParam: (_last, allPages) => getNextPageIndex(allPages),
  })

  useEffect(() => {
    if (!open || !hasNextPage || isFetchingNextPage) return
    void fetchNextPage()
  }, [open, hasNextPage, isFetchingNextPage, fetchNextPage])

  const setlists = useMemo(() => {
    const pages = data?.pages ?? []
    const flat = pages.flatMap((p) => p.items)
    return [...flat].sort((a, b) => b.title.localeCompare(a.title, undefined, { numeric: true }))
  }, [data?.pages])

  const addMutation = useMutation({
    mutationFn: async (setlistId: string) => {
      if (song.not_a_song) {
        throw new Error('excluded')
      }
      const { data: detail, response } = await api.GET('/api/v1/setlists/{id}', {
        params: { path: { id: setlistId } },
      })
      if (!response.ok) {
        const problem = await parseProblemResponse(response.clone())
        throw new Error(problem?.title ?? t('hub.addToSetlist.failed'))
      }
      if (!detail) {
        throw new Error(t('hub.addToSetlist.failed'))
      }
      const existing = normalizeSongLinksForEditor(detail.songs)
      if (existing.some((l) => normalizeSongLinkId(l.id) === normalizeSongLinkId(song.id))) {
        return { kind: 'duplicate' as const, title: detail.title }
      }
      const link: EditorSongLink = {
        id: song.id,
        key: resolveSongDataKey(song.data as Record<string, unknown>),
      }
      const nextSongs = [...existing, link]
      const body = buildSetlistPatchBody(
        {
          title: detail.title,
          songs: existing,
          owner: detail.owner,
        },
        { title: detail.title, songs: nextSongs, owner: detail.owner },
      )
      if (!body) {
        return { kind: 'noop' as const }
      }
      const { response: patchRes, data: updated } = await api.PATCH('/api/v1/setlists/{id}', {
        params: { path: { id: setlistId } },
        body,
      })
      if (!patchRes.ok) {
        const problem = await parseProblemResponse(patchRes.clone())
        throw new Error(problem?.title ?? t('hub.addToSetlist.failed'))
      }
      return { kind: 'ok' as const, title: detail.title, updated }
    },
    onSuccess: (result) => {
      if (result.kind === 'duplicate') {
        toast.info(t('hub.addToSetlist.alreadyInSetlist'))
        return
      }
      if (result.kind === 'noop') return
      if (result.updated) {
        queryClient.setQueryData(setlistDetailKey(result.updated.id), result.updated)
      }
      void queryClient.invalidateQueries({ queryKey: hubListKey('setlists', '') })
      toast.success(t('hub.addToSetlist.success', { title: result.title }))
      onOpenChange(false)
    },
    onError: (e: Error) => {
      if (e.message === 'excluded') {
        toast.error(t('setlists.editor.pickerExcluded'))
        return
      }
      toast.error(e.message || t('hub.addToSetlist.failed'))
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
                    {t('hub.addToSetlist.title')}
                  </Dialog.Title>
                  <p className="mt-1 line-clamp-2 text-sm text-[var(--color-muted-foreground)]">
                    {song.data.titles?.[0]?.trim() || '—'}
                  </p>

                  <div className="mt-4 grid gap-2">
                    <div className="grid gap-1.5 text-sm font-medium">
                      <label htmlFor="hub-add-to-setlist-select">{t('hub.addToSetlist.setlistLabel')}</label>
                      <Select
                        value={selectedId || undefined}
                        onValueChange={setSelectedId}
                        disabled={isPending || Boolean(loadError) || setlists.length === 0}
                      >
                        <SelectTrigger
                          id="hub-add-to-setlist-select"
                          aria-label={t('hub.addToSetlist.selectAria')}
                          className="rounded-md bg-[var(--color-bg)]"
                        >
                          <SelectValue placeholder={t('hub.addToSetlist.placeholder')} />
                        </SelectTrigger>
                        <SelectContent>
                          {setlists.map((sl) => (
                            <SelectItem key={sl.id} value={sl.id}>
                              {sl.title}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {isPending && setlists.length === 0 ? (
                      <p className="text-xs text-[var(--color-muted-foreground)]">
                        {t('hub.addToSetlist.loadingLists')}
                      </p>
                    ) : null}
                    {isFetchingNextPage ? (
                      <p className="text-xs text-[var(--color-muted-foreground)]">
                        {t('hub.addToSetlist.loadingMore')}
                      </p>
                    ) : null}
                    {loadError ? (
                      <p className="text-xs text-[var(--color-danger)]">{loadError}</p>
                    ) : null}
                    {!isPending && !loadError && setlists.length === 0 ? (
                      <p className="text-xs text-[var(--color-muted-foreground)]">
                        {t('hub.addToSetlist.empty')}
                      </p>
                    ) : null}
                  </div>

                  <div className="mt-5 flex justify-end gap-2">
                    <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                      {t('hub.addToSetlist.cancel')}
                    </Button>
                    <Button
                      type="button"
                      disabled={!selectedId || addMutation.isPending}
                      onClick={() => {
                        if (!selectedId) return
                        addMutation.mutate(selectedId)
                      }}
                    >
                      {t('hub.addToSetlist.add')}
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
