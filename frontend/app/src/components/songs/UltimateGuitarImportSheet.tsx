import * as Dialog from '@radix-ui/react-dialog'
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { api } from '@/api/client'
import { problemMessageFromBody } from '@/api/problem'
import type { components } from '@/api/schema'
import type { Song } from '@/api/songs-detail'
import { fetchTeamsPage } from '@/api/teams-sessions-fetch'
import { Button } from '@/components/ui/button'
import { KeyboardShortcut } from '@/components/ui/keyboard-shortcut'
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
import { detectKeyboardShortcutPlatform } from '@/lib/platform'
import { teamsListRootKey } from '@/lib/teams-sessions-keys'
import {
  isLikelyUltimateGuitarHtml,
  parseUltimateGuitarHtml,
} from '@/lib/ultimate-guitar-import'
import { cn } from '@/lib/utils'
import type { ChordSongData } from '@/ports/chord-engine'

type UltimateGuitarImportSheetProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  online: boolean
  onImported: (songId: string) => void
}

type ImportVariables = {
  collection: string
  data: ChordSongData
}

export function UltimateGuitarImportSheet({
  open,
  onOpenChange,
  online,
  onImported,
}: UltimateGuitarImportSheetProps) {
  const { t } = useTranslation()
  const shouldReduceMotion = useReducedMotion()
  const queryClient = useQueryClient()
  const { data: user } = useSession()
  const [source, setSource] = useState('')
  const [parsedData, setParsedData] = useState<ChordSongData | null>(null)
  const [localError, setLocalError] = useState<string | null>(null)
  const [isParsing, setIsParsing] = useState(false)
  const [dragOffset, setDragOffset] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const pointerStartY = useRef<number | null>(null)
  const shortcutPlatform = detectKeyboardShortcutPlatform()
  const mobile = shortcutPlatform === 'mobile'
  const mac = shortcutPlatform === 'mac'

  const teamsQ = useInfiniteQuery({
    queryKey: [...teamsListRootKey, 'ultimateGuitarImport', ''] as const,
    initialPageParam: 0,
    enabled: open,
    queryFn: async ({ pageParam, signal }) => {
      return fetchTeamsPage(queryClient, { page: pageParam as number, q: '', signal })
    },
    getNextPageParam: (_last, all) => getNextPageIndex(all),
  })

  const allTeams = teamsQ.data?.pages.flatMap((page) => page.items) ?? []
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
    mutationFn: async ({ collection, data }: ImportVariables) => {
      const body = {
        collection,
        data,
        blobs: [] as [],
        not_a_song: false as const,
      }
      const result = await api.POST('/api/v1/songs', {
        body: body as unknown as components['schemas']['CreateSong'],
      })
      if (!result.response.ok) {
        throw new Error(
          problemMessageFromBody(result.error, t('songs.ultimateGuitarImport.failed')),
        )
      }
      return result.data as Song
    },
    onSuccess: (song, variables) => {
      writeLastCollectionToLs(variables.collection)
      void queryClient.invalidateQueries({ queryKey: [...hubListRootKey, 'songs'] })
      void queryClient.invalidateQueries({ queryKey: [...hubListRootKey, 'collections'] })
      setLocalError(null)
      reset()
      onImported(song.id)
    },
    onError: (error: Error) => {
      setLocalError(error.message)
    },
  })

  function reset() {
    setSource('')
    setParsedData(null)
    setLocalError(null)
    setIsParsing(false)
    setCollectionPick(null)
    setNoCollectionPromptOpen(false)
    setDragOffset(0)
    setIsDragging(false)
    pointerStartY.current = null
  }

  function close() {
    reset()
    onOpenChange(false)
  }

  async function parseSource(): Promise<ChordSongData | null> {
    const trimmed = source.trim()
    if (!trimmed) {
      setLocalError(t('songs.ultimateGuitarImport.emptySource'))
      return null
    }
    if (!isLikelyUltimateGuitarHtml(trimmed)) {
      setLocalError(t('songs.ultimateGuitarImport.invalidSource'))
      return null
    }

    setIsParsing(true)
    setLocalError(null)
    try {
      const engine = await getChordEngine()
      const result = parseUltimateGuitarHtml(engine, trimmed)
      if (!result.ok) {
        setLocalError(t('songs.ultimateGuitarImport.parseFailed', { error: result.error }))
        return null
      }
      setParsedData(result.data)
      return result.data
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setLocalError(t('songs.ultimateGuitarImport.parseFailed', { error: message }))
      return null
    } finally {
      setIsParsing(false)
    }
  }

  async function processSource() {
    if (!online) return
    const data = await parseSource()
    if (!data) return

    if (!collectionId) {
      if (!hasEditableCollection) {
        setNoCollectionPromptOpen(true)
      }
      return
    }
    mutation.mutate({ collection: collectionId, data })
  }

  async function createCollectionAndImport() {
    if (!online) return
    setLocalError(null)
    try {
      const data = parsedData ?? (await parseSource())
      if (!data) return
      const newId = await createPersonalCollection(
        t('songs.ultimateGuitarImport.defaultCollectionTitle'),
      )
      await mutation.mutateAsync({ collection: newId, data })
    } catch (error) {
      setLocalError(
        error instanceof Error ? error.message : t('songs.ultimateGuitarImport.failed'),
      )
    }
  }

  const pending = isParsing || mutation.isPending || createCollectionPending

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next)
        if (!next) reset()
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
                        close()
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
                        ? t('songs.ultimateGuitarImport.noCollectionPrompt')
                        : t('songs.ultimateGuitarImport.title')}
                    </Dialog.Title>
                    <Dialog.Description className="text-sm text-[var(--color-muted-foreground)]">
                      {showNoCollectionFlow
                        ? t('songs.ultimateGuitarImport.noCollectionDescription')
                        : t('songs.ultimateGuitarImport.description')}
                    </Dialog.Description>
                  </div>

                  {!showNoCollectionFlow && mobile ? (
                    <div
                      className="rounded-lg border border-[var(--color-border)] bg-[var(--color-muted)]/40 px-4 py-3 text-sm"
                      role="note"
                    >
                      <p className="font-medium">
                        {t('songs.ultimateGuitarImport.desktopRequiredTitle')}
                      </p>
                      <p className="mt-1 text-[var(--color-muted-foreground)]">
                        {t('songs.ultimateGuitarImport.desktopRequiredDescription')}
                      </p>
                    </div>
                  ) : null}

                  {!showNoCollectionFlow && !mobile ? (
                    <div className="grid gap-4">
                      <ol className="grid list-decimal gap-2 pl-5 text-sm">
                        <li>
                          <Button asChild type="button" variant="outline" size="sm">
                            <a
                              href="https://www.ultimate-guitar.com/"
                              target="_blank"
                              rel="noreferrer"
                            >
                              {t('songs.ultimateGuitarImport.openUltimateGuitar')}
                            </a>
                          </Button>
                        </li>
                        <li>
                          {t('songs.ultimateGuitarImport.openSourceStep')}{' '}
                          <KeyboardShortcut
                            keys={mac ? ['⌥', '⌘', 'U'] : ['Ctrl', 'U']}
                            label={t(
                              mac
                                ? 'songs.ultimateGuitarImport.macOpenSourceShortcut'
                                : 'songs.ultimateGuitarImport.windowsOpenSourceShortcut',
                            )}
                          />
                        </li>
                        <li>
                          {t('songs.ultimateGuitarImport.selectAllStep')}{' '}
                          <KeyboardShortcut
                            keys={mac ? ['⌘', 'A'] : ['Ctrl', 'A']}
                            label={t(
                              mac
                                ? 'songs.ultimateGuitarImport.macSelectAllShortcut'
                                : 'songs.ultimateGuitarImport.windowsSelectAllShortcut',
                            )}
                          />{' '}
                          {t('songs.ultimateGuitarImport.thenCopy')}{' '}
                          <KeyboardShortcut
                            keys={mac ? ['⌘', 'C'] : ['Ctrl', 'C']}
                            label={t(
                              mac
                                ? 'songs.ultimateGuitarImport.macCopyShortcut'
                                : 'songs.ultimateGuitarImport.windowsCopyShortcut',
                            )}
                          />
                        </li>
                        <li>{t('songs.ultimateGuitarImport.pasteSourceStep')}</li>
                      </ol>

                      {showCollectionPicker ? (
                        <div className="grid gap-1.5 text-sm font-medium">
                          <label htmlFor="ultimate-guitar-import-collection">
                            {t('songs.ultimateGuitarImport.collectionLabel')}
                          </label>
                          <Select value={collectionId} onValueChange={(value) => setCollectionPick(value)}>
                            <SelectTrigger
                              id="ultimate-guitar-import-collection"
                              className="font-normal"
                            >
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {editableCollections.map((collection) => (
                                <SelectItem key={collection.id} value={collection.id}>
                                  {collection.title}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      ) : null}

                      <div className="grid gap-1.5 text-sm font-medium">
                        <label htmlFor="ultimate-guitar-source">
                          {t('songs.ultimateGuitarImport.sourceLabel')}
                        </label>
                        <textarea
                          id="ultimate-guitar-source"
                          rows={8}
                          value={source}
                          placeholder={t('songs.ultimateGuitarImport.sourcePlaceholder')}
                          className="min-h-40 w-full resize-y rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 font-mono text-sm font-normal outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] disabled:cursor-not-allowed disabled:opacity-50"
                          disabled={pending}
                          onChange={(event) => {
                            setSource(event.target.value)
                            setParsedData(null)
                            setLocalError(null)
                          }}
                        />
                      </div>
                    </div>
                  ) : null}

                  {localError ? (
                    <p className="text-sm text-[var(--color-destructive)]" role="alert">
                      {localError}
                    </p>
                  ) : null}

                  <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                    <Button type="button" variant="outline" disabled={pending} onClick={close}>
                      {t('teams.dialogCancel')}
                    </Button>
                    {showNoCollectionFlow ? (
                      <Button
                        type="button"
                        disabled={!online || pending}
                        onClick={() => void createCollectionAndImport()}
                      >
                        {pending
                          ? t('songs.ultimateGuitarImport.processing')
                          : t('songs.ultimateGuitarImport.createCollectionAndImport')}
                      </Button>
                    ) : !mobile ? (
                      <Button
                        type="button"
                        disabled={!online || pending}
                        title={!online ? t('songs.ultimateGuitarImport.offlineHint') : undefined}
                        onClick={() => void processSource()}
                      >
                        {pending
                          ? t('songs.ultimateGuitarImport.processing')
                          : t('songs.ultimateGuitarImport.process')}
                      </Button>
                    ) : null}
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
