import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { api } from '@/api/client'
import { problemMessageFromBody } from '@/api/problem'
import type { components } from '@/api/schema'
import type { Song } from '@/api/songs-detail'
import { fetchTeamsPage } from '@/api/teams-sessions-fetch'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { useEnsureTargetCollection, writeLastCollectionToLs } from '@/hooks/useEnsureTargetCollection'
import { useOnline } from '@/hooks/use-online'
import { useSession } from '@/hooks/useSession'
import { getChordEngine } from '@/lib/chord-engine'
import { hubListRootKey } from '@/lib/hub-list-keys'
import { getNextPageIndex } from '@/lib/list-pagination'
import { createSongBodyFromParsed, MAX_IMPORT_FILE_BYTES } from '@/lib/song-import-export'
import { isLikelySongClipboardText, parseSongClipboardText } from '@/lib/song-clipboard-import'
import { teamsListRootKey } from '@/lib/teams-sessions-keys'
import type { ChordSongData } from '@/ports/chord-engine'

const IMPORT_TOAST_ID = 'song-clipboard-import'

type SongClipboardImportProps = {
  onImported: (songId: string) => void
}

export function SongClipboardImport({ onImported }: SongClipboardImportProps) {
  const { t } = useTranslation()
  const online = useOnline()
  const queryClient = useQueryClient()
  const { data: user } = useSession()
  const [clipboardSong, setClipboardSong] = useState<ChordSongData | null>(null)
  const isHandlingPasteRef = useRef(false)
  const importStartedRef = useRef(false)
  const creatingCollectionRef = useRef(false)

  const teamsQ = useInfiniteQuery({
    queryKey: [...teamsListRootKey, 'songClipboardImport', ''] as const,
    initialPageParam: 0,
    enabled: !!clipboardSong,
    queryFn: async ({ pageParam, signal }) => {
      return fetchTeamsPage(queryClient, { page: pageParam as number, q: '', signal })
    },
    getNextPageParam: (_last, all) => getNextPageIndex(all),
  })
  const teams = teamsQ.data?.pages.flatMap((page) => page.items) ?? []
  const {
    collectionId,
    hasEditableCollection,
    collectionsFetched,
    createPersonalCollection,
    createCollectionPending,
  } = useEnsureTargetCollection({
    enabled: !!clipboardSong,
    userId: user?.id,
    teams,
  })

  const resetClipboardImport = useCallback(() => {
    toast.dismiss(IMPORT_TOAST_ID)
    isHandlingPasteRef.current = false
    importStartedRef.current = false
    setClipboardSong(null)
  }, [])

  const noCollectionDialogOpen =
    !!clipboardSong &&
    !!user?.id &&
    teamsQ.isFetched &&
    collectionsFetched &&
    !hasEditableCollection

  const { mutate: createSong, isPending: createSongPending } = useMutation({
    mutationFn: async (variables: { collection: string; data: ChordSongData }) => {
      const { data, error, response } = await api.POST('/api/v1/songs', {
        body: createSongBodyFromParsed(
          variables.data,
          variables.collection,
        ) as unknown as components['schemas']['CreateSong'],
      })
      if (!response.ok) {
        throw new Error(problemMessageFromBody(error, t('songs.import.failed')))
      }
      if (!data) throw new Error(t('songs.import.failed'))
      return { song: data as Song, collection: variables.collection }
    },
    onSuccess: ({ song, collection }) => {
      toast.dismiss(IMPORT_TOAST_ID)
      writeLastCollectionToLs(collection)
      void queryClient.invalidateQueries({ queryKey: [...hubListRootKey, 'songs'] })
      void queryClient.invalidateQueries({ queryKey: [...hubListRootKey, 'collections'] })
      resetClipboardImport()
      onImported(song.id)
    },
    onError: () => {
      toast.error(t('songs.import.failed'), { id: IMPORT_TOAST_ID })
      isHandlingPasteRef.current = false
      importStartedRef.current = false
      setClipboardSong(null)
    },
  })

  useEffect(() => {
    const handlePaste = (event: ClipboardEvent) => {
      if (isHandlingPasteRef.current || !online) return
      const source = event.clipboardData?.getData('text/plain') ?? ''
      if (!isLikelySongClipboardText(source)) return

      event.preventDefault()
      if (new TextEncoder().encode(source).byteLength > MAX_IMPORT_FILE_BYTES) {
        toast.error(t('songs.import.clipboardTooLarge'), { id: IMPORT_TOAST_ID })
        return
      }
      isHandlingPasteRef.current = true
      toast.loading(t('songs.import.importing'), { id: IMPORT_TOAST_ID })
      void getChordEngine()
        .then((engine) => {
          const parsed = parseSongClipboardText(engine, source)
          if (!parsed) {
            toast.error(t('songs.import.failed'), { id: IMPORT_TOAST_ID })
            isHandlingPasteRef.current = false
            return
          }
          setClipboardSong(parsed)
        })
        .catch(() => {
          toast.error(t('songs.import.failed'), { id: IMPORT_TOAST_ID })
          isHandlingPasteRef.current = false
        })
    }

    window.addEventListener('paste', handlePaste)
    return () => window.removeEventListener('paste', handlePaste)
  }, [online, t])

  useEffect(() => {
    if (!clipboardSong || !online || !user?.id || !teamsQ.isFetched || !collectionsFetched) return
    if (createSongPending || importStartedRef.current) return

    if (!hasEditableCollection) {
      toast.dismiss(IMPORT_TOAST_ID)
      return
    }
    if (!collectionId) return

    importStartedRef.current = true
    createSong({ collection: collectionId, data: clipboardSong })
  }, [
    clipboardSong,
    collectionId,
    collectionsFetched,
    createSong,
    createSongPending,
    hasEditableCollection,
    online,
    teamsQ.isFetched,
    user?.id,
  ])

  async function createCollectionAndImport() {
    if (!clipboardSong || creatingCollectionRef.current) return
    const data = clipboardSong
    creatingCollectionRef.current = true
    try {
      const collection = await createPersonalCollection(t('songs.import.defaultCollectionTitle'))
      importStartedRef.current = true
      setClipboardSong(null)
      toast.loading(t('songs.import.importing'), { id: IMPORT_TOAST_ID })
      createSong({ collection, data })
    } catch {
      resetClipboardImport()
      toast.error(t('songs.import.failed'))
    } finally {
      creatingCollectionRef.current = false
    }
  }

  return (
    <AlertDialog
      open={noCollectionDialogOpen}
      onOpenChange={(open) => {
        if (!open && !creatingCollectionRef.current) resetClipboardImport()
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('songs.ultimateGuitarImport.noCollectionPrompt')}</AlertDialogTitle>
          <AlertDialogDescription>
            {t('songs.ultimateGuitarImport.noCollectionDescription')}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={createCollectionPending}>
            {t('teams.dialogCancel')}
          </AlertDialogCancel>
          <Button
            type="button"
            disabled={createCollectionPending || createSongPending}
            onClick={() => void createCollectionAndImport()}
          >
            {createCollectionPending || createSongPending
              ? t('songs.import.importing')
              : t('songs.ultimateGuitarImport.createCollectionAndImport')}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
