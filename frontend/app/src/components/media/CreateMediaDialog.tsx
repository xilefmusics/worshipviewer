import * as Dialog from '@radix-ui/react-dialog'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { createUploadedMedia } from '@/api/media-upload'
import { createMedia, mediaDetailKey, mediaListRootKey, type Media } from '@/api/media'
import { MediaUploadDropZone } from '@/components/media/MediaUploadDropZone'
import { MediaFields } from '@/components/media/MediaFields'
import { Button } from '@/components/ui/button'
import { useWritableTeams } from '@/hooks/useWritableTeams'
import {
  sniffAssetUploadKind,
  isCreateMediaKind,
  isUploadMediaKind,
  isValidUrlMediaInput,
  type CreateMediaKind,
  urlContent,
} from '@/lib/media-display'

// Flow: M1 — create a slide deck from mixed PNG/JPEG/SVG/PDF files

export function CreateMediaDialog({
  open,
  onOpenChange,
  onCreated,
  defaultOwner,
  defaultIsBackground = false,
  elevated = false,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: (id: string, media: Media) => void
  defaultOwner?: string
  defaultIsBackground?: boolean
  elevated?: boolean
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const shouldReduceMotion = useReducedMotion()
  const [dragOffset, setDragOffset] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const pointerStartY = useRef<number | null>(null)
  const { teams, user, isPending: teamsPending } = useWritableTeams('mediaCreate', open)
  const [title, setTitle] = useState('')
  const [kind, setKind] = useState<CreateMediaKind>(defaultIsBackground ? 'image' : 'slide_deck')
  const [isBackground, setIsBackground] = useState(defaultIsBackground)
  const [url, setUrl] = useState('')
  const [owner, setOwner] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [files, setFiles] = useState<File[]>([])
  const [uploadProgress, setUploadProgress] = useState<number | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (open && !owner && teams[0]) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- initialize the owner after the async team list arrives
      setOwner(teams.find((team) => team.id === defaultOwner)?.id ?? teams[0].id)
    }
  }, [defaultOwner, open, owner, teams])

  const mutation = useMutation({
    mutationFn: async (quickFiles?: File[]) => {
      if (quickFiles) {
        if (!owner) throw new Error(t('media.validation.noWritableTeam'))
        const kinds = quickFiles.map(sniffAssetUploadKind)
        let uploadKind: 'image' | 'video' | 'audio' | 'slide_deck' | null = null
        if (kind === 'image') {
          if (quickFiles.length !== 1 || (kinds[0] !== 'image' && kinds[0] !== 'svg')) {
            throw new Error(t('media.validation.imageFileType'))
          }
          uploadKind = 'image'
        } else if (
          kinds.length > 0 &&
          kinds.every((value) => value === 'image' || value === 'pdf' || value === 'svg')
        ) {
          uploadKind = 'slide_deck'
        } else if (kinds.length === 1 && (kinds[0] === 'audio' || kinds[0] === 'video')) {
          uploadKind = kinds[0]
        }
        if (!uploadKind) throw new Error(t('setlists.editor.mediaQuickUploadUnsupported'))
        setKind(uploadKind)
        setFile(quickFiles[0])
        setFiles(quickFiles)
        setUploadProgress(0)
        return createUploadedMedia({
          kind: uploadKind,
          title:
            title.trim() ||
            quickFiles[0].name.replace(/\.[^.]+$/, '').trim() ||
            t('media.create.title'),
          owner,
          isBackground: uploadKind === 'image' && isBackground,
          files: quickFiles,
          onProgress: setUploadProgress,
        })
      }
      if (!title.trim()) throw new Error(t('media.validation.titleRequired'))
      if (!owner) throw new Error(t('media.validation.noWritableTeam'))
      if (isUploadMediaKind(kind)) {
        if (kind === 'image') {
          if (!file) throw new Error(t('media.validation.fileRequired'))
          const sniff = sniffAssetUploadKind(file)
          if (sniff !== 'image' && sniff !== 'svg') throw new Error(t('media.validation.imageFileType'))
          setUploadProgress(0)
          return createUploadedMedia({
            kind,
            title: title.trim(),
            owner,
            isBackground,
            files: [file],
            onProgress: setUploadProgress,
          })
        }
        if (kind === 'slide_deck') {
          if (files.length === 0) throw new Error(t('media.validation.fileRequired'))
          for (const next of files) {
            const sniff = sniffAssetUploadKind(next)
            if (sniff !== 'image' && sniff !== 'pdf' && sniff !== 'svg') {
              throw new Error(t('media.validation.deckFileType'))
            }
          }
          setUploadProgress(0)
          return createUploadedMedia({
            kind,
            title: title.trim(),
            owner,
            isBackground: false,
            files,
            onProgress: setUploadProgress,
          })
        }
        if (!file) throw new Error(t('media.validation.fileRequired'))
        setUploadProgress(0)
        return createUploadedMedia({
          kind,
          title: title.trim(),
          owner,
          files: [file],
          onProgress: setUploadProgress,
        })
      }
      if (!isValidUrlMediaInput(kind, url)) throw new Error(t('media.validation.invalidUrl'))
      return createMedia(queryClient, {
        title: title.trim(),
        owner,
        content: urlContent(kind, url.trim()),
      })
    },
    onSuccess: async (created) => {
      queryClient.setQueryData(mediaDetailKey(created.id), created)
      setUploadProgress(null)
      await queryClient.invalidateQueries({ queryKey: mediaListRootKey })
      onCreated(created.id, created)
    },
    onError: (cause: Error) => {
      setUploadProgress(null)
      const key = cause.message
      if (key === 'payload_too_large') setError(t('media.upload.errors.tooLarge'))
      else if (key === 'upload_failed') setError(t('media.upload.errors.failed'))
      else setError(cause.message)
    },
  })

  function close(next: boolean) {
    if (mutation.isPending) return
    onOpenChange(next)
    if (!next) {
      setTitle('')
      setKind(defaultIsBackground ? 'image' : 'slide_deck')
      setIsBackground(defaultIsBackground)
      setUrl('')
      setOwner('')
      setFile(null)
      setFiles([])
      setUploadProgress(null)
      setError('')
    }
  }

  const busy = mutation.isPending
  const uploading = uploadProgress != null

  return (
    <Dialog.Root open={open} onOpenChange={close}>
      <Dialog.Portal forceMount>
        <AnimatePresence>
          {open ? (
            <>
              <Dialog.Overlay forceMount asChild>
                <motion.div
                  className={`fixed inset-0 bg-black/40 ${elevated ? 'z-[70]' : 'z-50'}`}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: shouldReduceMotion ? 0 : 0.18 }}
                />
              </Dialog.Overlay>
              <Dialog.Content forceMount asChild>
                <motion.div
                  className={`fixed inset-x-0 bottom-0 box-border flex max-h-[88dvh] w-auto min-w-0 max-w-[100vw] flex-col gap-4 overflow-x-hidden rounded-t-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 text-[var(--color-foreground)] shadow-[var(--shadow-elevated)] ${elevated ? 'z-[71]' : 'z-50'}`}
                  initial={{ y: shouldReduceMotion ? 0 : '100%' }}
                  animate={isDragging ? { y: dragOffset } : { y: 0 }}
                  exit={{ y: shouldReduceMotion ? 0 : '100%' }}
                  transition={
                    isDragging
                      ? { duration: 0 }
                      : {
                          type: 'spring',
                          stiffness: 420,
                          damping: 36,
                          mass: 0.9,
                        }
                  }
                >
                  <div
                    className="mx-auto h-1.5 w-12 shrink-0 rounded-full bg-[var(--color-muted)]"
                    style={{ touchAction: 'none' }}
                    onPointerDown={(event) => {
                      if (busy) return
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
                      if (dragOffset > 90) close(false)
                      setDragOffset(0)
                    }}
                    onPointerCancel={() => {
                      setIsDragging(false)
                      pointerStartY.current = null
                      setDragOffset(0)
                    }}
                  />
                  <div className="grid gap-1.5">
                    <Dialog.Title className="text-base font-semibold">
                      {t('media.create.title')}
                    </Dialog.Title>
                    <Dialog.Description className="text-sm text-[var(--color-muted-foreground)]">
                      {t('media.create.description')}
                    </Dialog.Description>
                  </div>
                  <div className="grid min-h-0 gap-4 overflow-y-auto pb-1">
                    <MediaFields
                      uploadInput={
                        <MediaUploadDropZone
                          disabled={busy || teamsPending || !owner}
                          pending={busy && uploading}
                          progress={uploadProgress}
                          accept={kind === 'image'
                            ? 'image/png,image/jpeg,image/svg+xml,.png,.jpg,.jpeg,.svg'
                            : undefined}
                          onFiles={(nextFiles) => {
                            setError('')
                            mutation.mutate(nextFiles)
                          }}
                        />
                      }
                      title={title}
                      kind={kind}
                      url={url}
                      owner={owner}
                      teams={teams}
                      userId={user?.id}
                      showTeam={teams.length > 1}
                      disabled={busy}
                      uploadFileName={
                        kind === 'slide_deck'
                          ? files.map((item) => item.name).join(', ')
                          : file?.name
                      }
                      onTitleChange={setTitle}
                      onKindChange={(value) => {
                        if (isCreateMediaKind(value)) setKind(value)
                      }}
                      onUrlChange={setUrl}
                      onOwnerChange={setOwner}
                      onFileChange={setFile}
                      onFilesChange={setFiles}
                      isBackground={isBackground}
                      onBackgroundChange={setIsBackground}
                    />
                    {uploading ? (
                      <div role="status" className="grid gap-1">
                        <span className="text-sm">
                          {t('media.upload.progress', {
                            percent: Math.round(uploadProgress * 100),
                          })}
                        </span>
                        <div className="h-2 rounded-full bg-[var(--color-muted)]">
                          <div
                            className="h-2 rounded-full bg-[var(--color-primary)] transition-[width]"
                            style={{
                              width: `${Math.round(uploadProgress * 100)}%`,
                            }}
                          />
                        </div>
                      </div>
                    ) : null}
                    {error ? (
                      <p role="alert" className="text-sm text-[var(--color-destructive)]">
                        {error}
                      </p>
                    ) : null}
                    {!teamsPending && teams.length === 0 ? (
                      <p role="status" className="text-sm text-[var(--color-muted-foreground)]">
                        {t('media.validation.noWritableTeam')}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 justify-end gap-2 pb-[env(safe-area-inset-bottom)]">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => close(false)}
                      disabled={busy}
                    >
                      {t('common.cancel')}
                    </Button>
                    <Button
                      type="button"
                      disabled={busy || teamsPending || teams.length === 0}
                      onClick={() => {
                        setError('')
                        mutation.mutate()
                      }}
                    >
                      {busy ? t('common.load') : t('media.actions.create')}
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
