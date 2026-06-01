import * as Dialog from '@radix-ui/react-dialog'
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { api } from '@/api/client'
import { parseProblemResponse } from '@/api/problem'
import type { components } from '@/api/schema'
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
import { getChordEngine } from '@/lib/chord-engine'
import { hubListRootKey } from '@/lib/hub-list-keys'
import { getNextPageIndex } from '@/lib/list-pagination'
import { importSongsBatch, SONG_IMPORT_FILE_ACCEPT } from '@/lib/song-import-export'
import { teamsListRootKey } from '@/lib/teams-sessions-keys'
import { cn } from '@/lib/utils'

type ImportSongsDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  online: boolean
}

export function ImportSongsDialog({ open, onOpenChange, online }: ImportSongsDialogProps) {
  const { t } = useTranslation()
  const shouldReduceMotion = useReducedMotion()
  const queryClient = useQueryClient()
  const { data: user } = useSession()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [summary, setSummary] = useState<{ created: number; failed: { name: string; error: string }[] } | null>(
    null,
  )
  const [localError, setLocalError] = useState<string | null>(null)
  const [dragOffset, setDragOffset] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const pointerStartY = useRef<number | null>(null)

  const teamsQ = useInfiniteQuery({
    queryKey: [...teamsListRootKey, 'songImport', ''] as const,
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

  const runImport = async (targetCollectionId: string) => {
    if (!selectedFiles.length) throw new Error(t('songs.import.noFiles'))
    const engine = await getChordEngine()
    return importSongsBatch({
      files: selectedFiles,
      engine,
      collection: targetCollectionId,
      postSong: async (body) => {
          const { data, response } = await api.POST('/api/v1/songs', {
            body: body as unknown as components['schemas']['CreateSong'],
          })
          if (!response.ok) {
            const problem = await parseProblemResponse(response.clone())
            throw new Error(problem?.title ?? t('songs.import.failed'))
          }
          return { id: (data as Song).id }
        },
    })
  }

  const mutation = useMutation({
    mutationFn: async () => {
      let targetId = collectionId
      if (!targetId) {
        if (!hasEditableCollection) {
          setNoCollectionPromptOpen(true)
          throw new Error(t('songs.import.noFiles'))
        }
        throw new Error(t('songs.import.failed'))
      }
      return runImport(targetId)
    },
    onSuccess: (result) => {
      if (collectionId) writeLastCollectionToLs(collectionId)
      void queryClient.invalidateQueries({ queryKey: [...hubListRootKey, 'songs'] })
      void queryClient.invalidateQueries({ queryKey: [...hubListRootKey, 'collections'] })
      setSummary({ created: result.created.length, failed: result.failed })
      setSelectedFiles([])
      setLocalError(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
    },
    onError: (e: Error) => {
      setLocalError(e.message)
      setSummary(null)
    },
  })

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next)
        if (!next) {
          setSelectedFiles([])
          setSummary(null)
          setLocalError(null)
          setCollectionPick(null)
          setNoCollectionPromptOpen(false)
          if (fileInputRef.current) fileInputRef.current.value = ''
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
                    'fixed inset-x-0 bottom-0 z-50 grid max-h-[85dvh] w-full gap-4 overflow-y-auto rounded-t-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 text-[var(--color-foreground)] shadow-[var(--shadow-elevated)]',
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
                    className="mx-auto h-1.5 w-12 shrink-0 rounded-full bg-[var(--color-muted)]"
                    style={{ touchAction: 'none' }}
                    onPointerDown={(event) => {
                      event.currentTarget.setPointerCapture(event.pointerId)
                      pointerStartY.current = event.clientY
                      setIsDragging(true)
                      setDragOffset(0)
                    }}
                    onPointerMove={(event) => {
                      if (!isDragging || pointerStartY.current === null) return
                      setDragOffset(Math.max(0, event.clientY - pointerStartY.current))
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
                      {t('songs.import.dialogTitle')}
                    </Dialog.Title>
                    <p className="text-sm text-[var(--color-muted-foreground)]">
                      {t('songs.import.dialogDescription')}
                    </p>
                  </div>

                  <input
                    ref={fileInputRef}
                    type="file"
                    accept={SONG_IMPORT_FILE_ACCEPT}
                    multiple
                    className="sr-only"
                    tabIndex={-1}
                    aria-hidden
                    onChange={(e) => {
                      setSummary(null)
                      setLocalError(null)
                      setSelectedFiles(Array.from(e.target.files ?? []))
                    }}
                  />

                  <div className="grid gap-2">
                    {showNoCollectionFlow ? (
                      <p className="text-sm text-[var(--color-muted-foreground)]">
                        {t('songs.import.noCollectionDescription')}
                      </p>
                    ) : null}
                    {showCollectionPicker && !showNoCollectionFlow ? (
                      <div className="grid gap-1.5 text-sm font-medium">
                        <label htmlFor="song-import-collection">
                          {t('songs.import.collectionLabel')}
                        </label>
                        <Select value={collectionId} onValueChange={(v) => setCollectionPick(v)}>
                          <SelectTrigger id="song-import-collection" className="font-normal">
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

                    <Button
                      type="button"
                      variant="outline"
                      disabled={!online}
                      title={!online ? t('songs.import.offlineHint') : undefined}
                      onClick={() => fileInputRef.current?.click()}
                    >
                      {t('songs.import.pickFiles')}
                    </Button>
                    {selectedFiles.length > 0 ? (
                      <p className="text-sm text-[var(--color-muted-foreground)]">
                        {selectedFiles.map((f) => f.name).join(', ')}
                      </p>
                    ) : (
                      <p className="text-sm text-[var(--color-muted-foreground)]">{t('songs.import.noFiles')}</p>
                    )}

                    {summary ? (
                      <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-muted)]/30 px-3 py-2 text-sm">
                        {summary.created > 0 ? (
                          <p>
                            {t('songs.import.summaryCreated', { count: summary.created })}
                          </p>
                        ) : null}
                        {summary.failed.length > 0 ? (
                          <>
                            <p className="mt-1 font-medium">
                              {t('songs.import.summaryFailed', {
                                count: summary.failed.length,
                              })}
                            </p>
                            <ul className="mt-1 list-inside list-disc text-xs">
                              {summary.failed.map((f) => (
                                <li key={f.name}>
                                  {t('songs.import.failedItem', { name: f.name, error: f.error })}
                                </li>
                              ))}
                            </ul>
                          </>
                        ) : null}
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
                        disabled={
                          !online ||
                          mutation.isPending ||
                          createCollectionPending ||
                          selectedFiles.length === 0
                        }
                        onClick={() => {
                          setLocalError(null)
                          setSummary(null)
                          void (async () => {
                            try {
                              const newId = await createPersonalCollection(
                                t('songs.import.defaultCollectionTitle'),
                              )
                              const result = await runImport(newId)
                              if (newId) writeLastCollectionToLs(newId)
                              void queryClient.invalidateQueries({
                                queryKey: [...hubListRootKey, 'songs'],
                              })
                              void queryClient.invalidateQueries({
                                queryKey: [...hubListRootKey, 'collections'],
                              })
                              setSummary({
                                created: result.created.length,
                                failed: result.failed,
                              })
                              setSelectedFiles([])
                              if (fileInputRef.current) fileInputRef.current.value = ''
                            } catch (e) {
                              setLocalError(
                                e instanceof Error ? e.message : t('songs.import.failed'),
                              )
                            }
                          })()
                        }}
                      >
                        {mutation.isPending || createCollectionPending
                          ? t('songs.import.importing')
                          : t('songs.import.createCollectionAndImport')}
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        disabled={!online || mutation.isPending || selectedFiles.length === 0}
                        onClick={() => {
                          setLocalError(null)
                          setSummary(null)
                          if (!collectionId && !hasEditableCollection) {
                            setNoCollectionPromptOpen(true)
                            return
                          }
                          void mutation.mutateAsync()
                        }}
                      >
                        {mutation.isPending
                          ? t('songs.import.importing')
                          : t('songs.import.submit')}
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
