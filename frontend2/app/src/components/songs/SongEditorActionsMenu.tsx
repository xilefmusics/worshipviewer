import { useCallback, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { ChordFormatPreference } from '@/lib/chord-format'
import { runSongExport, type SongExportKind } from '@/lib/run-song-export'
import {
  formatImportedSource,
  parseImportSource,
  readTextFiles,
  SONG_IMPORT_FILE_ACCEPT,
} from '@/lib/song-import-export'
import { metadataStripFromSongData } from '@/lib/song-editor-state'
import type { ChordEngine, ChordSongData } from '@/ports/chord-engine'
import { cn } from '@/lib/utils'

type SongEditorActionsMenuProps = {
  engine: ChordEngine | null
  exportData: ChordSongData | null
  chordFormat: ChordFormatPreference
  canImport: boolean
  online: boolean
  hasPendingEdits: boolean
  onImportApplied: (source: string, data: ChordSongData) => void
  onImportError?: (message: string | null) => void
  onExportError?: (message: string | null) => void
  onPlay?: () => void
  playDisabled?: boolean
}

export function SongEditorActionsMenu({
  engine,
  exportData,
  chordFormat,
  canImport,
  online,
  hasPendingEdits,
  onImportApplied,
  onImportError,
  onExportError,
  onPlay,
  playDisabled,
}: SongEditorActionsMenuProps) {
  const { t } = useTranslation()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [replaceOpen, setReplaceOpen] = useState(false)
  const [pendingFile, setPendingFile] = useState<File | null>(null)

  const menuDisabled = !engine || !exportData

  const applyImportFile = useCallback(
    async (file: File) => {
      if (!engine) return
      onImportError?.(null)
      const reads = await readTextFiles([file])
      const first = reads[0]
      if (!first || !first.ok) {
        onImportError?.(first && !first.ok ? first.error : t('songs.editor.importFailed'))
        return
      }
      const parsed = parseImportSource(engine, first.text)
      if (!parsed.ok) {
        onImportError?.(parsed.error)
        return
      }
      const source = formatImportedSource(engine, parsed.data, chordFormat)
      onImportApplied(source, parsed.data)
    },
    [chordFormat, engine, onImportApplied, onImportError, t],
  )

  const onFileInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      e.target.value = ''
      if (!file) return
      if (hasPendingEdits) {
        setPendingFile(file)
        setReplaceOpen(true)
        return
      }
      void applyImportFile(file)
    },
    [applyImportFile, hasPendingEdits],
  )

  const onExport = useCallback(
    async (kind: SongExportKind) => {
      if (!exportData) return
      onExportError?.(null)
      try {
        await runSongExport(exportData, kind, chordFormat)
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e)
        onExportError?.(message || t('songs.editor.exportFailed'))
      }
    },
    [chordFormat, exportData, onExportError, t],
  )

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept={SONG_IMPORT_FILE_ACCEPT}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={onFileInputChange}
      />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="icon"
            disabled={menuDisabled}
            className={cn('size-9 shrink-0 rounded-full shadow-[var(--shadow-elevated)]')}
            aria-label={t('songs.editor.actionsMenuAria')}
          >
            <span aria-hidden className="text-lg leading-none">
              ⋯
            </span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          {onPlay ? (
            <>
              <DropdownMenuItem disabled={playDisabled} onSelect={onPlay}>
                {t('hub.actions.play')}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          ) : null}
          <DropdownMenuItem
            disabled={!canImport}
            title={!online ? t('songs.editor.importOfflineHint') : undefined}
            onSelect={() => fileInputRef.current?.click()}
          >
            {t('songs.editor.importFile')}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuLabel>{t('songs.editor.exportLabel')}</DropdownMenuLabel>
          <DropdownMenuItem onSelect={() => void onExport('chordpro')}>
            {t('songs.editor.exportChordPro')}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => void onExport('worshippro')}>
            {t('songs.editor.exportWorshipPro')}
          </DropdownMenuItem>
          <DropdownMenuItem
            title={t('songs.editor.exportPdfHint')}
            onSelect={() => void onExport('pdf')}
          >
            {t('songs.editor.exportPdf')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={replaceOpen} onOpenChange={setReplaceOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('songs.editor.importReplaceTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('songs.editor.importReplaceDescription')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                setPendingFile(null)
              }}
            >
              {t('teams.dialogCancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const file = pendingFile
                setPendingFile(null)
                setReplaceOpen(false)
                if (file) void applyImportFile(file)
              }}
            >
              {t('songs.editor.importReplaceConfirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
