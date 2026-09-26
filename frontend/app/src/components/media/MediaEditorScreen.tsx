import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { uploadMediaSource, mediaAssetDataUrl } from '@/api/media-upload'
import {
  beginDeckRevision,
  commitDeck,
  fetchMedia,
  mediaDetailKey,
  mediaListRootKey,
  updateMedia,
  type Media,
} from '@/api/media'
import { DeckPagesEditor, type DeckEditorPage } from '@/components/media/DeckPagesEditor'
import { MediaDeckPageView } from '@/components/media/MediaDeckPageView'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useOnline } from '@/hooks/use-online'
import { useTeamDetail } from '@/hooks/useTeamDetail'
import { useWritableTeams } from '@/hooks/useWritableTeams'
import {
  formatMediaDuration,
  isUploadedDisplayKind,
  isUrlMediaKind,
  isValidUrlMediaInput,
  mediaCanonicalUrl,
  mediaDisplayKind,
  sniffAssetUploadKind,
  type UrlMediaKind,
  urlContent,
} from '@/lib/media-display'
import { canEditTeamLibrary } from '@/lib/team-permissions'

// Flow: M2, M4, M5 — preview/edit draft pages, commit, empty-guard

function deckPagesFromMedia(media: Media): DeckEditorPage[] {
  if (media.pending_revision) {
    return media.pending_revision.pages.map((page) => ({
      id: page.id,
      blob_id: page.blob_id,
      section_title: page.section_title ?? null,
    }))
  }
  if (media.content.type === 'slide_deck') {
    return media.content.pages.map((page) => ({
      id: page.blob_id,
      blob_id: page.blob_id,
      section_title: page.section_title ?? null,
    }))
  }
  return []
}

function draftSignatureForMedia(value: Media): string {
  return JSON.stringify({
    title: value.title,
    owner: value.owner,
    is_background: value.is_background,
    pages: deckPagesFromMedia(value),
  })
}

export function MediaEditorScreen({ mediaId }: { mediaId: string }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const online = useOnline()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const detailQuery = useQuery({
    queryKey: mediaDetailKey(mediaId),
    queryFn: ({ signal }) => fetchMedia(queryClient, mediaId, signal),
  })
  const media = detailQuery.data
  const ownerTeam = useTeamDetail(media?.owner ?? '', { enabled: Boolean(media?.owner) })
  const { user } = useWritableTeams(`mediaEditor:${mediaId}`, Boolean(media))
  const canEdit = Boolean(media && ownerTeam.data && user?.id && canEditTeamLibrary(ownerTeam.data, user.id))
  const [title, setTitle] = useState('')
  const [kind, setKind] = useState<UrlMediaKind>('youtube')
  const [url, setUrl] = useState('')
  const [owner, setOwner] = useState('')
  const [isBackground, setIsBackground] = useState(false)
  const [error, setError] = useState('')
  const [uploadProgress, setUploadProgress] = useState<number | null>(null)
  const [deckPages, setDeckPages] = useState<DeckEditorPage[]>([])
  const loadedDraftRef = useRef<string | null>(null)
  const queuedAutosaveRef = useRef<string | null>(null)

  const draftSignature = useMemo(
    () => JSON.stringify({ title, owner, is_background: isBackground, pages: deckPages }),
    [deckPages, isBackground, owner, title],
  )

  useEffect(() => {
    if (!media) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset the editor draft from the fetched canonical resource
    setTitle(media.title)
    setOwner(media.owner)
    setIsBackground(media.is_background ?? false)
    setDeckPages(deckPagesFromMedia(media))
    loadedDraftRef.current = draftSignatureForMedia(media)
    const displayKind = mediaDisplayKind(media)
    if (isUrlMediaKind(displayKind)) {
      setKind(displayKind)
      setUrl(mediaCanonicalUrl(media) ?? '')
    }
  }, [media])

  const displayKind = media ? mediaDisplayKind(media) : 'unknown'
  const uploaded = media ? isUploadedDisplayKind(displayKind) : false
  const isDeck = displayKind === 'slide_deck'
  const editableUrl = media ? isUrlMediaKind(displayKind) : false

  useEffect(() => {
    if (!isDeck) return
    const onTitleChange = (event: Event) => {
      const titleChange = event as CustomEvent<string>
      setTitle(titleChange.detail)
    }
    window.addEventListener('media-editor-title-change', onTitleChange)
    return () => window.removeEventListener('media-editor-title-change', onTitleChange)
  }, [isDeck])
  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!canEdit || !media) throw new Error(t('media.validation.notEditable'))
      if (isDeck) {
        if (deckPages.length === 0) throw new Error(t('media.deck.emptyGuard'))
        await updateMedia(queryClient, mediaId, { title: title.trim(), owner })
        let current = await fetchMedia(queryClient, mediaId)
        if (!current.pending_revision?.pages?.length) {
          current = await beginDeckRevision(queryClient, mediaId)
        }
        const pending = current.pending_revision
        if (!pending) throw new Error(t('media.deck.emptyGuard'))
        const byBlob = new Map((pending.pages ?? []).map((page) => [page.blob_id, page.id]))
        const pageIds = deckPages.map((page) => byBlob.get(page.blob_id) ?? page.id)
        return commitDeck(queryClient, mediaId, {
          revision_id: pending.revision_id,
          page_ids: pageIds,
          section_titles: deckPages.map((page) => {
            const sectionTitle = page.section_title?.trim() ?? ''
            return sectionTitle.length > 0 ? sectionTitle : null
          }),
        })
      }
      if (uploaded) {
        return updateMedia(queryClient, mediaId, {
          title: title.trim(),
          owner,
          is_background: media.content.type === 'image' ? isBackground : false,
        })
      }
      if (!editableUrl) throw new Error(t('media.validation.notEditable'))
      if (!isValidUrlMediaInput(kind, url)) throw new Error(t('media.validation.invalidUrl'))
      return updateMedia(queryClient, mediaId, {
        title: title.trim(),
        owner,
        content: urlContent(kind, url.trim()),
      })
    },
    onSuccess: (saved) => {
      queryClient.setQueryData(mediaDetailKey(mediaId), saved)
      void queryClient.invalidateQueries({ queryKey: mediaListRootKey })
    },
    onError: (cause: Error) => setError(cause.message),
  })

  useEffect(() => {
    if (!isDeck || !canEdit || !online || deckPages.length === 0 || saveMutation.isPending) return
    if (draftSignature === loadedDraftRef.current || draftSignature === queuedAutosaveRef.current) return
    const timer = window.setTimeout(() => {
      queuedAutosaveRef.current = draftSignature
      setError('')
      saveMutation.mutate()
    }, 700)
    return () => window.clearTimeout(timer)
  }, [canEdit, deckPages.length, draftSignature, isDeck, online, saveMutation])

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      if (!media || !isUploadedDisplayKind(displayKind) || isDeck) throw new Error(t('media.validation.notEditable'))
      const uploadKind = displayKind === 'image'
        ? sniffAssetUploadKind(file)
        : displayKind === 'video' ? 'video' : 'audio'
      if (uploadKind !== 'image' && uploadKind !== 'svg' && uploadKind !== 'video' && uploadKind !== 'audio') {
        throw new Error(t('media.validation.imageFileType'))
      }
      setUploadProgress(0)
      return uploadMediaSource({
        mediaId,
        kind: uploadKind,
        file,
        onProgress: (ratio) => setUploadProgress(ratio),
      })
    },
    onSuccess: (saved) => {
      setUploadProgress(null)
      queryClient.setQueryData(mediaDetailKey(mediaId), saved)
      void queryClient.invalidateQueries({ queryKey: mediaListRootKey })
    },
    onError: (cause: Error) => {
      setUploadProgress(null)
      setError(cause.message)
    },
  })

  const deckUploadMutation = useMutation({
    mutationFn: async ({
      files,
      replacePage,
      insertionIndex,
    }: {
      files: File[]
      replacePage?: string
      insertionIndex?: number
    }) => {
      setUploadProgress(0)
      let saved: Media | null = null
      for (let index = 0; index < files.length; index += 1) {
        const file = files[index]
        const sniff = sniffAssetUploadKind(file)
        if (sniff !== 'image' && sniff !== 'pdf' && sniff !== 'svg') {
          throw new Error(t('media.validation.deckFileType'))
        }
        saved = await uploadMediaSource({
          mediaId,
          kind: sniff,
          file,
          replacePage,
          onProgress: (ratio) => setUploadProgress((index + ratio) / files.length),
        })
      }
      if (!saved) throw new Error(t('media.validation.fileRequired'))
      if (insertionIndex == null || replacePage) return saved

      const pending = saved.pending_revision
      if (!pending) throw new Error(t('media.deck.emptyGuard'))
      const existingBlobIds = new Set(deckPages.map((page) => page.blob_id))
      const pendingByBlobId = new Map(pending.pages.map((page) => [page.blob_id, page]))
      const localByBlobId = new Map(deckPages.map((page) => [page.blob_id, page]))
      const existingPages = deckPages.flatMap((page) => {
        const pendingPage = pendingByBlobId.get(page.blob_id)
        return pendingPage ? [pendingPage] : []
      })
      const matchedExistingIds = new Set(existingPages.map((page) => page.id))
      existingPages.push(
        ...pending.pages.filter(
          (page) => existingBlobIds.has(page.blob_id) && !matchedExistingIds.has(page.id),
        ),
      )
      const addedPages = pending.pages.filter((page) => !existingBlobIds.has(page.blob_id))
      const insertAt = Math.max(0, Math.min(insertionIndex, existingPages.length))
      const orderedPages = [
        ...existingPages.slice(0, insertAt),
        ...addedPages,
        ...existingPages.slice(insertAt),
      ]

      return commitDeck(queryClient, mediaId, {
        revision_id: pending.revision_id,
        page_ids: orderedPages.map((page) => page.id),
        section_titles: orderedPages.map((page) => {
          const sectionTitle = localByBlobId.get(page.blob_id)?.section_title ?? page.section_title
          const trimmed = sectionTitle?.trim() ?? ''
          return trimmed.length > 0 ? trimmed : null
        }),
      })
    },
    onSuccess: (saved) => {
      setUploadProgress(null)
      queryClient.setQueryData(mediaDetailKey(mediaId), saved)
      void queryClient.invalidateQueries({ queryKey: mediaListRootKey })
    },
    // Flow: M6
    onError: (cause: Error) => {
      setUploadProgress(null)
      setError(cause.message)
    },
  })

  const avFileAccept = useMemo(() => (displayKind === 'video' ? 'video/*,audio/*' : 'audio/*,video/*'), [displayKind])

  if (detailQuery.isPending) {
    return <div className="mx-auto w-full max-w-2xl py-12 text-center text-sm text-[var(--color-muted-foreground)]" role="status">{t('common.load')}</div>
  }
  if (detailQuery.error || !media) {
    return <div className="mx-auto flex w-full max-w-2xl flex-col items-center gap-3 py-12 text-center"><p className="text-sm text-[var(--color-muted-foreground)]">{t('media.editor.loadFailed')}</p><Button variant="outline" onClick={() => void detailQuery.refetch()}>{t('hub.error.retry')}</Button></div>
  }

  const canonicalUrl = mediaCanonicalUrl(media)
  const isImage = media.content.type === 'image'
  const previewBlobId =
    media.content.type === 'video' || media.content.type === 'audio' || media.content.type === 'image'
      ? media.content.blob_id
      : null
  const previewUrl = previewBlobId ? mediaAssetDataUrl(mediaId, previewBlobId) : null
  const replaceAccept = isImage
    ? 'image/png,image/jpeg,image/svg+xml,.png,.jpg,.jpeg,.svg'
    : avFileAccept
  const showUploadedEditor = uploaded

  return (
    <section className={`mx-auto grid w-full pb-8 ${isDeck ? 'max-w-5xl gap-3' : 'max-w-2xl gap-6'}`}>
      {isDeck ? (
        null
      ) : (
        <div className="grid gap-1">
          <h1 className="text-xl font-semibold">{media.title}</h1>
          <p className="text-sm text-[var(--color-muted-foreground)]">{t(`media.kinds.${displayKind}`)}</p>
          {!isImage ? <div className="pt-2"><Button asChild size="sm"><a href={`/player/media/${encodeURIComponent(media.id)}`}>{t('media.actions.play')}</a></Button></div> : null}
        </div>
      )}

      {showUploadedEditor ? (
        <div className={`grid ${isDeck ? 'gap-3' : 'gap-4'}`}>
          {!isDeck ? <div className="grid gap-1.5">
            <label htmlFor="media-editor-title" className="text-sm font-medium">{t('media.fields.title')}</label>
            <Input id="media-editor-title" value={title} onChange={(event) => setTitle(event.target.value)} disabled={!canEdit || !online || saveMutation.isPending} maxLength={200} />
          </div> : null}
          {isImage ? (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={isBackground}
                onChange={(event) => setIsBackground(event.target.checked)}
                disabled={!canEdit || !online || saveMutation.isPending}
              />
              {t('media.fields.isBackground')}
            </label>
          ) : null}
          {media.content.type === 'video' ? (
            <p className="text-sm text-[var(--color-muted-foreground)]">
              {t('media.editor.metadataVideo', {
                duration: formatMediaDuration(media.content.duration_ms),
                width: media.content.width,
                height: media.content.height,
              })}
            </p>
          ) : null}
          {media.content.type === 'audio' ? (
            <p className="text-sm text-[var(--color-muted-foreground)]">
              {t('media.editor.metadataAudio', { duration: formatMediaDuration(media.content.duration_ms) })}
            </p>
          ) : null}
          {previewUrl && media.content.type === 'video' ? (
            <video className="w-full rounded-lg border border-[var(--color-border)]" controls src={previewUrl} />
          ) : null}
          {previewUrl && media.content.type === 'audio' ? (
            <audio className="w-full" controls src={previewUrl} />
          ) : null}
          {isImage && previewBlobId ? (
            <div className="flex max-h-[60vh] items-center justify-center overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-muted)]/20 p-2">
              <MediaDeckPageView mediaId={mediaId} blobId={previewBlobId} label={media.title} />
            </div>
          ) : null}
          {isDeck ? (
            <DeckPagesEditor
              mediaId={mediaId}
              pages={deckPages}
              disabled={!canEdit || !online || deckUploadMutation.isPending}
              onReorder={setDeckPages}
              onRemove={(id) => setDeckPages((current) => current.filter((page) => page.id !== id))}
              onReplace={(id, file) => deckUploadMutation.mutate({ files: [file], replacePage: id })}
              onAdd={(files, insertionIndex) => deckUploadMutation.mutate({ files, insertionIndex })}
              onSectionTitleChange={(id, sectionTitle) => {
                setDeckPages((current) =>
                  current.map((page) =>
                    page.id === id ? { ...page, section_title: sectionTitle } : page,
                  ),
                )
              }}
              onRemoveSection={(id) => {
                setDeckPages((current) =>
                  current.map((page) => (page.id === id ? { ...page, section_title: null } : page)),
                )
              }}
            />
          ) : null}
          {canEdit && !isDeck ? (
            <div className="flex flex-wrap gap-2">
              <input ref={fileInputRef} type="file" className="hidden" accept={replaceAccept} onChange={(event) => {
                const file = event.target.files?.[0]
                if (file) uploadMutation.mutate(file)
                event.target.value = ''
              }} />
              <Button type="button" variant="outline" disabled={!online || uploadMutation.isPending} onClick={() => fileInputRef.current?.click()}>
                {t('media.upload.replace')}
              </Button>
            </div>
          ) : null}
          {uploadProgress != null ? (
            <div role="status" className="grid gap-1">
              <span className="text-sm">{t('media.upload.progress', { percent: Math.round(uploadProgress * 100) })}</span>
              <div className="h-2 rounded-full bg-[var(--color-muted)]">
                <div className="h-2 rounded-full bg-[var(--color-primary)]" style={{ width: `${Math.round(uploadProgress * 100)}%` }} />
              </div>
            </div>
          ) : null}
          {canEdit && !isDeck ? (
            <div className="flex justify-end">
              <Button disabled={!online || saveMutation.isPending} onClick={() => { setError(''); saveMutation.mutate() }}>
                {saveMutation.isPending ? t('common.load') : t('media.actions.save')}
              </Button>
            </div>
          ) : null}
        </div>
      ) : editableUrl ? (
        <>
          <div className="grid gap-1.5">
            <label htmlFor="media-editor-url" className="text-sm font-medium">{t(`media.fields.url.${kind}`)}</label>
            <Input id="media-editor-url" type="url" value={url} onChange={(event) => setUrl(event.target.value)} disabled={!canEdit || !online} />
          </div>
          {canEdit ? (
            <div className="flex justify-end">
              <Button disabled={!online || saveMutation.isPending} onClick={() => { setError(''); saveMutation.mutate() }}>
                {saveMutation.isPending ? t('common.load') : t('media.actions.save')}
              </Button>
            </div>
          ) : null}
        </>
      ) : (
        <p className="rounded-lg border border-[var(--color-border)] p-4 text-sm text-[var(--color-muted-foreground)]">{t('media.editor.notReady')}</p>
      )}

      {canonicalUrl ? (
        <div className="grid gap-1">
          <span className="text-sm font-medium">{t('media.fields.canonicalUrl')}</span>
          <a href={canonicalUrl} target="_blank" rel="noreferrer" className="break-all text-sm text-[var(--color-primary)] underline">{canonicalUrl}</a>
        </div>
      ) : null}

      {!canEdit ? <p role="status" className="text-sm text-[var(--color-muted-foreground)]">{t('media.editor.readOnly')}</p> : null}
      {error ? <p role="alert" className="text-sm text-[var(--color-destructive)]">{error}</p> : null}
    </section>
  )
}
