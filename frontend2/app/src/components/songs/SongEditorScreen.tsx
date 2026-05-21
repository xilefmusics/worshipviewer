import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { SongEditorActionsMenu } from '@/components/songs/SongEditorActionsMenu'
import { SongEditorPreview } from '@/components/songs/SongEditorPreview'
import { SongEditorSource } from '@/components/songs/SongEditorSource'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useCanEditSong } from '@/hooks/useCanEditSong'
import { useChordFormatPreference } from '@/hooks/useChordFormatPreference'
import { useOnline } from '@/hooks/use-online'
import { useSongAutosave } from '@/hooks/useSongAutosave'
import { useSongDetailQuery } from '@/hooks/useSongDetailQuery'
import { getChordEngine } from '@/lib/chord-engine'
import { MUSICAL_KEYS } from '@/lib/setlist-editor-constants'
import { songDetailQueryKey } from '@/lib/setlist-detail-key'
import {
  applyMetadataStripToSource,
  formatSourceFromSongData,
  metadataStripFromSongData,
  parseErrorsFromResult,
  parseSourceWithEngine,
  patchSongDataFromParsed,
  patchSongDataFromSongData,
  SONG_EDITOR_TIME_SIGNATURES,
  SONG_EDITOR_TYPING_DEBOUNCE_MS,
  type SongMetadataStrip,
} from '@/lib/song-editor-state'
import {
  importUltimateGuitarHtml,
  isUltimateGuitarUrl,
  shouldAttemptUgImport,
} from '@/lib/ultimate-guitar-import'
import type { ChordEngine } from '@/ports/chord-engine'
import { cn } from '@/lib/utils'

type EditorTab = 'meta' | 'source' | 'preview'

const editorTabs: EditorTab[] = ['meta', 'source', 'preview']

type EngineState =
  | { status: 'loading' }
  | { status: 'ready'; engine: ChordEngine }
  | { status: 'error'; message: string }

type UgImportUiState =
  | { kind: 'idle' }
  | { kind: 'url_hint' }
  | { kind: 'importing' }
  | { kind: 'error'; message: string }

export function SongEditorScreen({ songId }: { songId: string }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const online = useOnline()
  const chordFormat = useChordFormatPreference()

  const { data: detail, isPending, error, refetch } = useSongDetailQuery(songId)
  const { canEdit } = useCanEditSong(detail?.owner)
  const editable = Boolean(canEdit && detail && !detail.not_a_song)

  const [engineState, setEngineState] = useState<EngineState>({ status: 'loading' })
  const [enginePass, setEnginePass] = useState(0)
  const [sourceText, setSourceText] = useState('')
  const [metadataStrip, setMetadataStrip] = useState<SongMetadataStrip>({
    title: '',
    subtitle: '',
    artists: '',
    copyright: '',
    languages: '',
    tempo: '',
    timeSignature: '',
    key: '',
  })
  const [parseError, setParseError] = useState<string | null>(null)
  const [ugImportUi, setUgImportUi] = useState<UgImportUiState>({ kind: 'idle' })
  const [activeTab, setActiveTab] = useState<EditorTab>('source')
  const lastLoadedSongRef = useRef('')
  const [resumePrompt, setResumePrompt] = useState(false)
  const [fileImportError, setFileImportError] = useState<string | null>(null)
  const [fileExportError, setFileExportError] = useState<string | null>(null)
  const wentOfflineEditing = useRef(false)

  useEffect(() => {
    lastLoadedSongRef.current = ''
    setActiveTab('source')
    setUgImportUi({ kind: 'idle' })
  }, [songId])

  useEffect(() => {
    let cancelled = false
    setEngineState({ status: 'loading' })
    void (async () => {
      try {
        const engine = await getChordEngine()
        if (cancelled) return
        setEngineState({ status: 'ready', engine })
      } catch (e) {
        if (cancelled) return
        const message = e instanceof Error ? e.message : String(e)
        setEngineState({ status: 'error', message })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [enginePass])

  useEffect(() => {
    if (!online && editable) wentOfflineEditing.current = true
    if (online && wentOfflineEditing.current) {
      setResumePrompt(true)
      wentOfflineEditing.current = false
    }
  }, [online, editable])

  const offlineFrozen = !online && editable
  const engineReady = engineState.status === 'ready'
  const engine = engineState.status === 'ready' ? engineState.engine : null

  useLayoutEffect(() => {
    if (!detail || detail.id !== songId || !engine) return
    if (lastLoadedSongRef.current === songId) return
    lastLoadedSongRef.current = songId
    const source = formatSourceFromSongData(engine, detail.data as Record<string, unknown>, chordFormat)
    setSourceText(source)
    setMetadataStrip(metadataStripFromSongData(detail.data as Record<string, unknown>))
    setParseError(null)
    setUgImportUi({ kind: 'idle' })
  }, [detail, songId, engine, chordFormat])

  const parseResult = useMemo(() => {
    if (!engine) return null
    return parseSourceWithEngine(engine, sourceText)
  }, [engine, sourceText])
  const parseResultRef = useRef(parseResult)
  parseResultRef.current = parseResult

  const previewData = parseResult?.ok ? parseResult.data : null
  const exportData = useMemo(() => {
    if (previewData) return previewData
    if (detail?.data) return detail.data as Record<string, unknown>
    return null
  }, [detail?.data, previewData])
  const parseErrors = useMemo(
    () => (parseResult ? parseErrorsFromResult(parseResult) : []),
    [parseResult],
  )
  const effectiveParseError = parseError ?? parseErrors[0] ?? null

  const [displayedParseError, setDisplayedParseError] = useState<string | null>(null)
  const [displayedParseErrors, setDisplayedParseErrors] = useState<string[]>([])

  useEffect(() => {
    if (!effectiveParseError) {
      setDisplayedParseError(null)
      setDisplayedParseErrors([])
      return
    }
    const errors = parseErrors
    const id = setTimeout(() => {
      setDisplayedParseError(effectiveParseError)
      setDisplayedParseErrors(errors)
    }, SONG_EDITOR_TYPING_DEBOUNCE_MS)
    return () => clearTimeout(id)
  }, [effectiveParseError, parseErrors])

  const baseline = useMemo(
    () => (detail ? patchSongDataFromSongData(detail.data as Record<string, unknown>) : null),
    [detail],
  )

  const draftPatchData = useMemo(() => {
    if (!parseResult?.ok) return null
    return patchSongDataFromParsed(parseResult.data, metadataStrip)
  }, [metadataStrip, parseResult])

  const canAutosavePatch = Boolean(
    editable &&
      !offlineFrozen &&
      baseline &&
      detail &&
      !resumePrompt &&
      engineReady &&
      draftPatchData &&
      !effectiveParseError,
  )

  const {
    notifyDraftEdited,
    flushNow,
    patchInFlight,
    saveIcon,
    saveFailure,
    saveRevision,
    retrySave,
    discardFailedSave,
  } = useSongAutosave({
    songId,
    baseline,
    draft: draftPatchData,
    canAutosavePatch,
  })

  useEffect(() => {
    if (!engine) return
    const current = parseResultRef.current
    if (!current?.ok) return
    setSourceText(formatSourceFromSongData(engine, current.data, chordFormat))
  }, [chordFormat, engine])

  useEffect(() => {
    if (!engine || !detail || saveRevision === 0) return
    setSourceText(formatSourceFromSongData(engine, detail.data as Record<string, unknown>, chordFormat))
    setParseError(null)
  }, [saveRevision, engine, detail, chordFormat])

  const blockingAll =
    patchInFlight || !!saveFailure || offlineFrozen || !editable || resumePrompt || !engineReady
  const sourceBlocked = blockingAll || !editable || !engineReady

  useEffect(() => {
    if (!engine || !editable || sourceBlocked) {
      setUgImportUi({ kind: 'idle' })
      return
    }
    if (parseResult?.ok) {
      setUgImportUi({ kind: 'idle' })
      return
    }

    setUgImportUi({ kind: 'idle' })
    const trimmed = sourceText.trim()
    const timer = setTimeout(() => {
      if (parseResultRef.current?.ok) return

      if (isUltimateGuitarUrl(trimmed)) {
        setUgImportUi({ kind: 'url_hint' })
        return
      }

      if (!shouldAttemptUgImport(sourceText, false)) {
        setUgImportUi({ kind: 'idle' })
        return
      }

      setUgImportUi({ kind: 'importing' })
      const result = importUltimateGuitarHtml(engine, sourceText, chordFormat)
      if (result.ok) {
        setUgImportUi({ kind: 'idle' })
        setSourceText(result.source)
        setMetadataStrip(metadataStripFromSongData(result.data))
        setParseError(null)
        queueMicrotask(() => notifyDraftEdited())
        return
      }
      setUgImportUi({ kind: 'error', message: result.error })
    }, SONG_EDITOR_TYPING_DEBOUNCE_MS)

    return () => clearTimeout(timer)
  }, [sourceText, engine, editable, sourceBlocked, chordFormat, notifyDraftEdited, parseResult?.ok])

  const retryAfterUntil = saveFailure?.retryAfterUntil
  const [retrySec, setRetrySec] = useState(0)
  useEffect(() => {
    if (!retryAfterUntil) {
      setRetrySec(0)
      return
    }
    const tick = () => {
      const left = Math.max(0, Math.ceil((retryAfterUntil - Date.now()) / 1000))
      setRetrySec(left)
    }
    tick()
    const id = setInterval(tick, 500)
    return () => clearInterval(id)
  }, [retryAfterUntil])

  const onSourceChange = useCallback(
    (next: string) => {
      if (sourceBlocked) return
      setSourceText(next)
      if (!engine) return
      const parsed = parseSourceWithEngine(engine, next)
      if (parsed.ok) {
        setParseError(null)
        setMetadataStrip(metadataStripFromSongData(parsed.data))
      } else {
        setParseError(parsed.error)
      }
      queueMicrotask(() => notifyDraftEdited())
    },
    [engine, notifyDraftEdited, sourceBlocked],
  )

  const commitMetadataStrip = useCallback(
    (stripOverride?: SongMetadataStrip) => {
      if (!engine || !parseResult?.ok || sourceBlocked) return
      const strip = stripOverride ?? metadataStrip
      const nextSource = applyMetadataStripToSource(engine, parseResult.data, strip, chordFormat)
      setSourceText(nextSource)
      setParseError(null)
      queueMicrotask(() => notifyDraftEdited())
    },
    [engine, metadataStrip, notifyDraftEdited, parseResult, sourceBlocked, chordFormat],
  )

  const onMetadataFieldBlur = useCallback(() => {
    queueMicrotask(() => commitMetadataStrip())
  }, [commitMetadataStrip])

  const saveAria = useMemo(() => {
    if (offlineFrozen) return t('songs.editor.bannerOfflineEditing')
    if (ugImportUi.kind === 'importing') return t('songs.editor.ugImporting')
    if (effectiveParseError && ugImportUi.kind !== 'url_hint') return t('songs.editor.parseBlocked')
    if (patchInFlight) return t('songs.editor.saveStatusSaving')
    if (saveFailure) return t('songs.editor.saveFailedShort')
    if (saveIcon === 'pending') return t('songs.editor.saveStatusPending')
    return t('songs.editor.saveStatusIdle')
  }, [effectiveParseError, offlineFrozen, patchInFlight, saveFailure, saveIcon, t, ugImportUi.kind])

  async function discardResumeReload() {
    setResumePrompt(false)
    wentOfflineEditing.current = false
    await queryClient.invalidateQueries({ queryKey: songDetailQueryKey(songId) })
    const r = await refetch()
    if (r.data && engine) {
      setSourceText(formatSourceFromSongData(engine, r.data.data as Record<string, unknown>, chordFormat))
      setMetadataStrip(metadataStripFromSongData(r.data.data as Record<string, unknown>))
      setParseError(null)
    }
  }

  if (isPending || !detail) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-[var(--color-muted-foreground)]">
        {error ? String((error as Error).message) : t('common.load')}
      </div>
    )
  }

  if (engineState.status === 'loading') {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-[var(--color-muted-foreground)]">
        {t('songs.editor.wasmLoading')}
      </div>
    )
  }

  if (engineState.status === 'error') {
    return (
      <div className="mx-auto flex max-w-lg flex-col items-center gap-3 px-4 py-16 text-center">
        <p className="text-sm text-[var(--color-danger)]" role="alert">
          {t('songs.editor.wasmFailed')}
        </p>
        <p className="text-xs text-[var(--color-muted-foreground)]">{engineState.message}</p>
        <Button type="button" variant="outline" onClick={() => setEnginePass((n) => n + 1)}>
          {t('hub.error.retry')}
        </Button>
      </div>
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-lg min-h-[calc(100dvh-6.5rem-env(safe-area-inset-top,0px)-env(safe-area-inset-bottom,0px))] flex-col gap-4">
      <div className="sticky top-0 z-10 -mx-3 bg-[var(--color-background)] px-3 pb-2">
        <div className="flex items-center gap-2">
          <nav
            role="tablist"
            aria-label={t('songs.editor.tabsAria')}
            className="flex min-w-0 flex-1 items-stretch gap-1 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] p-[0.18rem] shadow-[var(--shadow-elevated)]"
          >
            {editorTabs.map((tab) => {
              const selected = activeTab === tab
              return (
                <button
                  key={tab}
                  type="button"
                  role="tab"
                  id={`song-editor-tab-${tab}-${songId}`}
                  aria-selected={selected}
                  aria-controls={`song-editor-panel-${tab}-${songId}`}
                  tabIndex={selected ? 0 : -1}
                  onClick={() => setActiveTab(tab)}
                  className={cn(
                    'min-w-0 flex-1 rounded-full px-2 py-2.5 text-sm font-medium transition-colors',
                    selected
                      ? 'bg-[var(--color-primary)] text-[var(--color-primary-foreground)]'
                      : 'text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)]',
                  )}
                >
                  {t(`songs.editor.tabs.${tab}`)}
                </button>
              )
            })}
          </nav>
          <SongEditorActionsMenu
            engine={engine}
            exportData={exportData}
            chordFormat={chordFormat}
            canImport={Boolean(editable && online && engineReady)}
            online={online}
            hasPendingEdits={saveIcon === 'pending'}
            onImportError={setFileImportError}
            onExportError={setFileExportError}
            onImportApplied={(source, data) => {
              setFileImportError(null)
              setSourceText(source)
              setMetadataStrip(metadataStripFromSongData(data))
              setParseError(null)
              queueMicrotask(() => notifyDraftEdited())
            }}
          />
        </div>
      </div>
      {!editable ? (
        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-muted)]/40 px-3 py-2 text-sm">
          {detail.not_a_song ? t('songs.editor.notASongChip') : t('songs.editor.readOnlyBanner')}
        </div>
      ) : null}
      {offlineFrozen ? (
        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-muted)]/40 px-3 py-2 text-sm">
          {t('songs.editor.bannerOfflineEditing')}
        </div>
      ) : null}
      {fileImportError ? (
        <div className="rounded-lg border border-[var(--color-danger)]/50 bg-[var(--color-danger)]/10 px-3 py-2 text-sm text-[var(--color-foreground)]">
          <p className="font-medium">{t('songs.editor.importFailed')}</p>
          <p className="mt-1">{fileImportError}</p>
        </div>
      ) : null}
      {fileExportError ? (
        <div className="rounded-lg border border-[var(--color-danger)]/50 bg-[var(--color-danger)]/10 px-3 py-2 text-sm text-[var(--color-foreground)]">
          <p className="font-medium">{t('songs.editor.exportFailed')}</p>
          <p className="mt-1">{fileExportError}</p>
        </div>
      ) : null}
      {ugImportUi.kind === 'url_hint' ? (
        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm">
          {t('songs.editor.ugUrlHint')}
        </div>
      ) : null}
      {ugImportUi.kind === 'importing' ? (
        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm">
          {t('songs.editor.ugImporting')}
        </div>
      ) : null}
      {ugImportUi.kind === 'error' ? (
        <div className="rounded-lg border border-[var(--color-danger)]/50 bg-[var(--color-danger)]/10 px-3 py-2 text-sm text-[var(--color-foreground)]">
          <p className="font-medium">{t('songs.editor.ugImportFailed')}</p>
          <p className="mt-1">{ugImportUi.message}</p>
        </div>
      ) : null}
      {displayedParseError && ugImportUi.kind !== 'url_hint' && ugImportUi.kind !== 'importing' ? (
        <div className="rounded-lg border border-[var(--color-danger)]/50 bg-[var(--color-danger)]/10 px-3 py-2 text-sm text-[var(--color-foreground)]">
          <p className="font-medium">{t('songs.editor.parseErrorTitle')}</p>
          <ul className="mt-1 list-inside list-disc">
            {displayedParseErrors.map((msg) => (
              <li key={msg}>{msg}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {saveFailure ? (
        <div className="rounded-lg border border-[var(--color-danger)]/50 bg-[var(--color-danger)]/10 px-3 py-2 text-sm">
          <p className="font-medium">{saveFailure.message}</p>
          <div className="mt-3 flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={retrySec > 0}
              onClick={() => void retrySave()}
            >
              {retrySec > 0 ? t('songs.editor.retryIn', { seconds: retrySec }) : t('songs.editor.retry')}
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => {
                const rolled = discardFailedSave()
                if (rolled && engine) {
                  const data = rolled as unknown as Record<string, unknown>
                  setSourceText(formatSourceFromSongData(engine, data, chordFormat))
                  setMetadataStrip(metadataStripFromSongData(data))
                  setParseError(null)
                }
              }}
            >
              {t('songs.editor.discardLocal')}
            </Button>
          </div>
        </div>
      ) : null}
      {resumePrompt ? (
        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm shadow-sm">
          <p className="font-medium">{t('songs.editor.resumePrompt')}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              onClick={async () => {
                await flushNow()
                setResumePrompt(false)
              }}
            >
              {t('songs.editor.resumeRetry')}
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => void discardResumeReload()}>
              {t('songs.editor.resumeDiscard')}
            </Button>
          </div>
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1 flex-col gap-4">
      {activeTab === 'meta' ? (
        <div
          role="tabpanel"
          id={`song-editor-panel-meta-${songId}`}
          aria-labelledby={`song-editor-tab-meta-${songId}`}
          className="grid gap-3"
        >
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="grid gap-1 text-sm">
              <span>{t('songs.editor.titleLabel')}</span>
              <Input
                value={metadataStrip.title}
                readOnly={sourceBlocked}
                onChange={(e) => setMetadataStrip((s) => ({ ...s, title: e.target.value }))}
                onBlur={onMetadataFieldBlur}
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span>{t('songs.editor.subtitleLabel')}</span>
              <Input
                value={metadataStrip.subtitle}
                readOnly={sourceBlocked}
                onChange={(e) => setMetadataStrip((s) => ({ ...s, subtitle: e.target.value }))}
                onBlur={onMetadataFieldBlur}
              />
            </label>
            <label className="grid gap-1 text-sm sm:col-span-2">
              <span>{t('songs.editor.artistsLabel')}</span>
              <Input
                value={metadataStrip.artists}
                readOnly={sourceBlocked}
                onChange={(e) => setMetadataStrip((s) => ({ ...s, artists: e.target.value }))}
                onBlur={onMetadataFieldBlur}
              />
            </label>
            <label className="grid gap-1 text-sm sm:col-span-2">
              <span>{t('songs.editor.copyrightLabel')}</span>
              <Input
                value={metadataStrip.copyright}
                readOnly={sourceBlocked}
                onChange={(e) => setMetadataStrip((s) => ({ ...s, copyright: e.target.value }))}
                onBlur={onMetadataFieldBlur}
              />
            </label>
            <label className="grid gap-1 text-sm sm:col-span-2">
              <span>{t('songs.editor.languagesLabel')}</span>
              <Input
                value={metadataStrip.languages}
                readOnly={sourceBlocked}
                placeholder={t('songs.editor.languagesPlaceholder')}
                onChange={(e) => setMetadataStrip((s) => ({ ...s, languages: e.target.value }))}
                onBlur={onMetadataFieldBlur}
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span>{t('songs.editor.tempoLabel')}</span>
              <Input
                value={metadataStrip.tempo}
                readOnly={sourceBlocked}
                inputMode="numeric"
                onChange={(e) => setMetadataStrip((s) => ({ ...s, tempo: e.target.value }))}
                onBlur={onMetadataFieldBlur}
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span>{t('songs.editor.timeLabel')}</span>
              <Select
                value={metadataStrip.timeSignature || '__none__'}
                onValueChange={(v) => {
                  if (sourceBlocked) return
                  const nextTime = v === '__none__' ? '' : v
                  setMetadataStrip((s) => {
                    const next = { ...s, timeSignature: nextTime }
                    queueMicrotask(() => commitMetadataStrip(next))
                    return next
                  })
                }}
                disabled={sourceBlocked}
              >
                <SelectTrigger className="font-normal" aria-label={t('songs.editor.timeSelectAria')}>
                  <SelectValue placeholder={t('songs.editor.timePlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">{t('songs.editor.timeNone')}</SelectItem>
                  {SONG_EDITOR_TIME_SIGNATURES.map((sig) => (
                    <SelectItem key={sig} value={sig}>
                      {sig}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            <label className="grid gap-1 text-sm">
              <span>{t('songs.editor.keyLabel')}</span>
              <Select
                value={metadataStrip.key || '__none__'}
                onValueChange={(v) => {
                  if (sourceBlocked) return
                  const nextKey = v === '__none__' ? '' : v
                  setMetadataStrip((s) => {
                    const next = { ...s, key: nextKey }
                    queueMicrotask(() => commitMetadataStrip(next))
                    return next
                  })
                }}
                disabled={sourceBlocked}
              >
                <SelectTrigger className="font-normal">
                  <SelectValue placeholder={t('songs.editor.keyPlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">{t('songs.editor.keyNone')}</SelectItem>
                  {MUSICAL_KEYS.map((k) => (
                    <SelectItem key={k} value={k}>
                      {k}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
          </div>
        </div>
      ) : null}

      {activeTab === 'source' ? (
        <div
          role="tabpanel"
          id={`song-editor-panel-source-${songId}`}
          aria-labelledby={`song-editor-tab-source-${songId}`}
          className="grid min-h-0 gap-1.5"
        >
          <label htmlFor={`song-editor-source-${songId}`} className="sr-only">
            {t('songs.editor.sourceLabel')}
          </label>
          <SongEditorSource
            id={`song-editor-source-${songId}`}
            value={sourceText}
            readOnly={sourceBlocked}
            onChange={onSourceChange}
          />
        </div>
      ) : null}

      {activeTab === 'preview' && engine ? (
        <div
          role="tabpanel"
          id={`song-editor-panel-preview-${songId}`}
          aria-labelledby={`song-editor-tab-preview-${songId}`}
          className="flex min-h-0 flex-1 flex-col"
        >
          <SongEditorPreview
            engine={engine}
            songData={previewData}
            parseError={effectiveParseError}
            hideHeading
          />
        </div>
      ) : null}
      </div>

      <div className="sticky bottom-0 z-10 -mx-3 flex flex-col gap-2 bg-[var(--color-background)] px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom,0px))]">
        <div
          role="status"
          aria-live="polite"
          className="flex min-h-4 items-center justify-end gap-1 text-xs text-[var(--color-muted-foreground)]"
        >
          <span
            aria-hidden
            className={cn(
              saveIcon === 'saving' &&
                'inline-flex size-4 animate-spin rounded-full border-2 border-[var(--color-muted)] border-t-[var(--color-primary)]',
            )}
          >
            {saveIcon === 'pending' ? <span className="size-2 rounded-full bg-[var(--color-primary)]" /> : null}
            {saveIcon === 'idle' ? <span className="size-2 rounded-full opacity-35" /> : null}
            {saveIcon === 'error' ? <span className="text-[var(--color-danger)]">!</span> : null}
          </span>
          <span className="sr-only">{saveAria}</span>
        </div>
      </div>
    </div>
  )
}
