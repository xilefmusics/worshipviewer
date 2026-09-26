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
import { MAX_IMPORT_FILE_BYTES } from '@/lib/song-import-export'
import { teamsListRootKey } from '@/lib/teams-sessions-keys'
import { cn } from '@/lib/utils'
import type { ChordSongData } from '@/ports/chord-engine'

type CcliPdfImportSheetProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  online: boolean
  onImported: (songId: string) => void
}

type ImportVariables = {
  collection: string
  data: ChordSongData
}

export function CcliPdfImportSheet({
  open,
  onOpenChange,
  online,
  onImported,
}: CcliPdfImportSheetProps) {
  const { t } = useTranslation()
  const shouldReduceMotion = useReducedMotion()
  const queryClient = useQueryClient()
  const { data: user } = useSession()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [parsedData, setParsedData] = useState<ChordSongData | null>(null)
  const [localError, setLocalError] = useState<string | null>(null)
  const [isParsing, setIsParsing] = useState(false)

  const teamsQ = useInfiniteQuery({
    queryKey: [...teamsListRootKey, 'ccliPdfImport', ''] as const,
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

  const showNoCollectionFlow = collectionsFetched && !hasEditableCollection && noCollectionPromptOpen

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
        throw new Error(problemMessageFromBody(result.error, t('songs.ccliPdfImport.failed')))
      }
      return result.data as Song
    },
    onSuccess: (song, variables) => {
      writeLastCollectionToLs(variables.collection)
      void queryClient.invalidateQueries({ queryKey: [...hubListRootKey, 'songs'] })
      void queryClient.invalidateQueries({ queryKey: [...hubListRootKey, 'collections'] })
      setLocalError(null)
      onImported(song.id)
    },
    onError: (error: Error) => {
      setLocalError(error.message)
    },
  })

  function reset() {
    setFile(null)
    setParsedData(null)
    setLocalError(null)
    setIsParsing(false)
    setCollectionPick(null)
    setNoCollectionPromptOpen(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function parseSelectedFile(): Promise<ChordSongData | null> {
    if (!file) {
      setLocalError(t('songs.ccliPdfImport.noFile'))
      return null
    }
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      setLocalError(t('songs.ccliPdfImport.invalidFile'))
      return null
    }
    if (file.size > MAX_IMPORT_FILE_BYTES) {
      setLocalError(t('songs.ccliPdfImport.tooLarge'))
      return null
    }

    setIsParsing(true)
    setLocalError(null)
    try {
      const bytes = new Uint8Array(await file.arrayBuffer())
      const engine = await getChordEngine()
      const data = engine.parsePdf(bytes)
      setParsedData(data)
      return data
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setLocalError(t('songs.ccliPdfImport.parseFailed', { error: message }))
      return null
    } finally {
      setIsParsing(false)
    }
  }

  async function processFile() {
    if (!online) return
    setLocalError(null)
    const data = parsedData ?? (await parseSelectedFile())
    if (!data) return

    if (!collectionId) {
      if (!hasEditableCollection) setNoCollectionPromptOpen(true)
      return
    }
    mutation.mutate({ collection: collectionId, data })
  }

  async function createCollectionAndImport() {
    if (!online) return
    setLocalError(null)
    try {
      const data = parsedData ?? (await parseSelectedFile())
      if (!data) return
      const collection = await createPersonalCollection(t('songs.ccliPdfImport.defaultCollectionTitle'))
      await mutation.mutateAsync({ collection, data })
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : t('songs.ccliPdfImport.failed'))
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
                  animate={{ y: 0 }}
                  exit={{ y: shouldReduceMotion ? 0 : '100%' }}
                  transition={{ type: 'spring', stiffness: 420, damping: 36, mass: 0.9 }}
                >
                  <div className="mx-auto h-1.5 w-12 rounded-full bg-[var(--color-muted)]" />
                  <div className="flex flex-col gap-2 text-center sm:text-left">
                    <Dialog.Title className="text-lg font-semibold leading-none">
                      {t('songs.ccliPdfImport.title')}
                    </Dialog.Title>
                    <Dialog.Description className="text-sm text-[var(--color-muted-foreground)]">
                      {t('songs.ccliPdfImport.description')}
                    </Dialog.Description>
                  </div>

                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,application/pdf"
                    className="sr-only"
                    tabIndex={-1}
                    aria-hidden
                    disabled={pending}
                    onChange={(event) => {
                      setFile(event.target.files?.[0] ?? null)
                      setParsedData(null)
                      setLocalError(null)
                    }}
                  />

                  <div className="grid gap-3">
                    {showNoCollectionFlow ? (
                      <p className="text-sm text-[var(--color-muted-foreground)]">
                        {t('songs.ccliPdfImport.noCollectionDescription')}
                      </p>
                    ) : null}

                    {showCollectionPicker && !showNoCollectionFlow ? (
                      <div className="grid gap-1.5 text-sm font-medium">
                        <label htmlFor="ccli-pdf-import-collection">
                          {t('songs.import.collectionLabel')}
                        </label>
                        <Select value={collectionId} onValueChange={setCollectionPick}>
                          <SelectTrigger id="ccli-pdf-import-collection" className="font-normal">
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

                    <Button
                      type="button"
                      variant="outline"
                      disabled={!online || pending}
                      title={!online ? t('songs.ccliPdfImport.offlineHint') : undefined}
                      onClick={() => fileInputRef.current?.click()}
                    >
                      {t('songs.ccliPdfImport.chooseFile')}
                    </Button>
                    <p className="text-sm text-[var(--color-muted-foreground)]" aria-live="polite">
                      {file?.name ?? t('songs.ccliPdfImport.noFile')}
                    </p>
                    {localError ? (
                      <p className="text-sm text-[var(--color-destructive)]" role="alert">
                        {localError}
                      </p>
                    ) : null}
                  </div>

                  <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                    <Button type="button" variant="outline" disabled={pending} onClick={() => onOpenChange(false)}>
                      {t('teams.dialogCancel')}
                    </Button>
                    {showNoCollectionFlow ? (
                      <Button
                        type="button"
                        disabled={!online || pending || !file}
                        onClick={() => void createCollectionAndImport()}
                      >
                        {pending
                          ? t('songs.ccliPdfImport.processing')
                          : t('songs.ccliPdfImport.createCollectionAndImport')}
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        disabled={!online || pending || !file}
                        title={!online ? t('songs.ccliPdfImport.offlineHint') : undefined}
                        onClick={() => void processFile()}
                      >
                        {pending ? t('songs.ccliPdfImport.processing') : t('songs.ccliPdfImport.import')}
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
