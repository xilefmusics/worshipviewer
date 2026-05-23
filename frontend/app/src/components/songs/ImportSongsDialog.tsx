import * as Dialog from '@radix-ui/react-dialog'
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { api } from '@/api/client'
import { parseProblemResponse } from '@/api/problem'
import type { components } from '@/api/schema'
import type { Song } from '@/api/songs-detail'
import type { Team } from '@/api/teams-sessions-fetch'
import { fetchTeamsPage } from '@/api/teams-sessions-fetch'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useSession } from '@/hooks/useSession'
import { getChordEngine } from '@/lib/chord-engine'
import { hubListRootKey } from '@/lib/hub-list-keys'
import { getNextPageIndex } from '@/lib/list-pagination'
import { importSongsBatch, SONG_IMPORT_FILE_ACCEPT } from '@/lib/song-import-export'
import { getTeamDisplayName, isPersonalTeamName } from '@/lib/team-display-name'
import { canEditTeamLibrary } from '@/lib/team-permissions'
import { teamsListRootKey } from '@/lib/teams-sessions-keys'
import { cn } from '@/lib/utils'

const LAST_OWNER_LS = 'wv.songCreate.lastOwnerTeamId'

function readLastOwnerFromLs(): string | null {
  try {
    const raw = globalThis.localStorage?.getItem(LAST_OWNER_LS)
    return raw && raw.trim() ? raw.trim() : null
  } catch {
    return null
  }
}

function writeLastOwnerToLs(teamId: string) {
  try {
    globalThis.localStorage?.setItem(LAST_OWNER_LS, teamId)
  } catch {
    /* ignore */
  }
}

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

  const allTeams = useMemo(() => {
    const pages = teamsQ.data?.pages ?? []
    return pages.flatMap((p) => p.items) as Team[]
  }, [teamsQ.data?.pages])

  const writableTeams = useMemo(() => {
    if (!user?.id) return []
    return allTeams.filter((tm) => canEditTeamLibrary(tm, user.id))
  }, [allTeams, user])

  const showOwnerPicker = writableTeams.length > 1
  const [ownerPick, setOwnerPick] = useState<string | null>(null)

  const defaultOwnerId = useMemo(() => {
    if (!open || !user?.id) return ''
    if (writableTeams.length === 0 && !teamsQ.isFetched) return ''
    const last = readLastOwnerFromLs()
    if (last && writableTeams.some((tm) => tm.id === last)) return last
    const personal = writableTeams.find(
      (tm) => isPersonalTeamName(tm.name) && canEditTeamLibrary(tm, user.id),
    )
    return personal?.id ?? writableTeams[0]?.id ?? ''
  }, [open, teamsQ.isFetched, user, writableTeams])

  const ownerId = ownerPick ?? defaultOwnerId

  const mutation = useMutation({
    mutationFn: async () => {
      if (!selectedFiles.length) throw new Error(t('songs.import.noFiles'))
      const engine = await getChordEngine()
      const owner = showOwnerPicker && ownerId ? ownerId : undefined
      return importSongsBatch({
        files: selectedFiles,
        engine,
        owner,
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
    },
    onSuccess: (result) => {
      if (showOwnerPicker && ownerId) writeLastOwnerToLs(ownerId)
      void queryClient.invalidateQueries({ queryKey: [...hubListRootKey, 'songs'] })
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
          setOwnerPick(null)
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
                    {showOwnerPicker ? (
                      <div className="grid gap-1.5 text-sm font-medium">
                        <label htmlFor="song-import-owner">{t('songs.import.teamLabel')}</label>
                        <Select value={ownerId} onValueChange={(v) => setOwnerPick(v)}>
                          <SelectTrigger id="song-import-owner" className="font-normal">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {writableTeams.map((tm) => (
                              <SelectItem key={tm.id} value={tm.id}>
                                {getTeamDisplayName(tm, user?.id, t)}
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
                    <Button
                      type="button"
                      disabled={!online || mutation.isPending || selectedFiles.length === 0}
                      onClick={() => {
                        setLocalError(null)
                        setSummary(null)
                        void mutation.mutateAsync()
                      }}
                    >
                      {mutation.isPending ? t('songs.import.importing') : t('songs.import.submit')}
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
