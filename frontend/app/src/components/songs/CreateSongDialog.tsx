import * as Dialog from '@radix-ui/react-dialog'
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { api } from '@/api/client'
import { problemMessageFromBody } from '@/api/problem'
import type { Song } from '@/api/songs-detail'
import { fetchTeamsPage } from '@/api/teams-sessions-fetch'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  useEnsureTargetCollection,
  writeLastCollectionToLs,
} from '@/hooks/useEnsureTargetCollection'
import { useSession } from '@/hooks/useSession'
import { hubListRootKey } from '@/lib/hub-list-keys'
import { getNextPageIndex } from '@/lib/list-pagination'
import { teamsListRootKey } from '@/lib/teams-sessions-keys'
import { cn } from '@/lib/utils'

type CreateSongDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: (songId: string) => void
}

export function CreateSongDialog({ open, onOpenChange, onCreated }: CreateSongDialogProps) {
  const { t } = useTranslation()
  const shouldReduceMotion = useReducedMotion()
  const queryClient = useQueryClient()
  const { data: user } = useSession()
  const [localError, setLocalError] = useState<string | null>(null)
  const [dragOffset, setDragOffset] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const pointerStartY = useRef<number | null>(null)

  const teamsQ = useInfiniteQuery({
    queryKey: [...teamsListRootKey, 'songCreate', ''] as const,
    initialPageParam: 0,
    enabled: open,
    queryFn: async ({ pageParam, signal }) => {
      const page = pageParam as number
      return fetchTeamsPage(queryClient, { page, q: '', signal })
    },
    getNextPageParam: (_last, all) => getNextPageIndex(all),
  })

  const allTeams = teamsQ.data?.pages.flatMap((p) => p.items) ?? []

  const {
    editableCollections,
    collectionId,
    setCollectionPick,
    showCollectionPicker,
    hasEditableCollection,
    noCollectionPromptOpen,
    setNoCollectionPromptOpen,
    createPersonalCollection,
    createCollectionPending,
    collectionsFetched,
  } = useEnsureTargetCollection({
    enabled: open,
    userId: user?.id,
    teams: allTeams,
  })

  const showNoCollectionFlow =
    collectionsFetched && !hasEditableCollection && noCollectionPromptOpen

  const mutation = useMutation({
    mutationFn: async (targetCollectionId: string) => {
      const body = {
        collection: targetCollectionId,
        data: {
          sections: [] as [],
          titles: [t('songs.create.defaultTitle')],
        },
        blobs: [] as [],
        not_a_song: false as const,
      }
      const { data, error, response } = await api.POST('/api/v1/songs', { body })
      if (!response.ok) {
        throw new Error(problemMessageFromBody(error, t('songs.create.failed')))
      }
      return data as Song
    },
    onSuccess: (song) => {
      if (collectionId) writeLastCollectionToLs(collectionId)
      void queryClient.invalidateQueries({
        queryKey: [...hubListRootKey, 'songs'],
      })
      void queryClient.invalidateQueries({
        queryKey: [...hubListRootKey, 'collections'],
      })
      setLocalError(null)
      onCreated(song.id)
    },
    onError: (e: Error) => {
      setLocalError(e.message)
    },
  })

  async function submitCreate() {
    setLocalError(null)
    const targetId = collectionId
    if (!targetId) {
      if (!hasEditableCollection) {
        setNoCollectionPromptOpen(true)
        return
      }
      return
    }
    await mutation.mutateAsync(targetId)
  }

  async function submitCreateWithNewCollection() {
    setLocalError(null)
    try {
      const newId = await createPersonalCollection(t('songs.create.defaultCollectionTitle'))
      await mutation.mutateAsync(newId)
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : t('songs.create.failed'))
    }
  }

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next)
        if (!next) {
          setLocalError(null)
          setCollectionPick(null)
          setNoCollectionPromptOpen(false)
        }
      }}
    >
      <Dialog.Portal forceMount>
        <AnimatePresence>
          {open ? (
            <>
              <Dialog.Overlay forceMount asChild>
                <motion.div
                  className="fixed inset-0 z-50 bg-black/40"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: shouldReduceMotion ? 0 : 0.18 }}
                />
              </Dialog.Overlay>
              <Dialog.Content forceMount asChild>
                <motion.div
                  className={cn(
                    'fixed inset-x-0 bottom-0 z-50 grid w-full gap-4 rounded-t-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 text-[var(--color-foreground)] shadow-[var(--shadow-elevated)]',
                  )}
                  initial={{ y: shouldReduceMotion ? 0 : '100%' }}
                  animate={isDragging ? { y: dragOffset } : { y: 0 }}
                  exit={{ y: shouldReduceMotion ? 0 : '100%' }}
                  transition={
                    isDragging
                      ? { duration: 0 }
                      : { type: 'spring', stiffness: 420, damping: 36, mass: 0.9 }
                  }
                >
                  <div
                    className="mx-auto h-1.5 w-12 rounded-full bg-[var(--color-muted)]"
                    style={{ touchAction: 'none' }}
                    onPointerDown={(event) => {
                      event.currentTarget.setPointerCapture(event.pointerId)
                      pointerStartY.current = event.clientY
                      setIsDragging(true)
                      setDragOffset(0)
                    }}
                    onPointerMove={(event) => {
                      if (!isDragging || pointerStartY.current === null) return
                      const nextOffset = Math.max(0, event.clientY - pointerStartY.current)
                      setDragOffset(nextOffset)
                    }}
                    onPointerUp={() => {
                      if (!isDragging) return
                      setIsDragging(false)
                      pointerStartY.current = null
                      if (dragOffset > 90) {
                        onOpenChange(false)
                        setDragOffset(0)
                        return
                      }
                      setDragOffset(0)
                    }}
                    onPointerCancel={() => {
                      setIsDragging(false)
                      pointerStartY.current = null
                      setDragOffset(0)
                    }}
                  />
                  <div className="flex flex-col gap-2 text-center sm:text-left">
                    <Dialog.Title className="text-lg font-semibold leading-none">
                      {showNoCollectionFlow
                        ? t('songs.create.noCollectionPrompt')
                        : t('songs.create.dialogTitle')}
                    </Dialog.Title>
                    <p className="text-sm text-[var(--color-muted-foreground)]">
                      {showNoCollectionFlow
                        ? t('songs.create.noCollectionDescription')
                        : t('songs.create.dialogDescription')}
                    </p>
                  </div>
                  <div className="grid gap-2">
                    {showCollectionPicker && !showNoCollectionFlow ? (
                      <div className="grid gap-1.5 text-sm font-medium">
                        <label htmlFor="song-create-collection">
                          {t('songs.create.collectionLabel')}
                        </label>
                        <Select value={collectionId} onValueChange={(v) => setCollectionPick(v)}>
                          <SelectTrigger id="song-create-collection" className="font-normal">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {editableCollections.map((c) => (
                              <SelectItem key={c.id} value={c.id}>
                                {c.title}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    ) : null}
                    {localError ? (
                      <p className="text-sm text-[var(--color-destructive)]" role="alert">
                        {localError}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                    <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                      {t('teams.dialogCancel')}
                    </Button>
                    {showNoCollectionFlow ? (
                      <Button
                        type="button"
                        disabled={mutation.isPending || createCollectionPending}
                        onClick={() => void submitCreateWithNewCollection()}
                      >
                        {mutation.isPending || createCollectionPending
                          ? t('common.load')
                          : t('songs.create.createCollectionAndSong')}
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        disabled={mutation.isPending}
                        onClick={() => void submitCreate()}
                      >
                        {mutation.isPending ? t('common.load') : t('songs.create.submit')}
                      </Button>
                    )}
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
