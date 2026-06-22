import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { SongEditorPreview } from '@/components/songs/SongEditorPreview'
import { SongEditorSource } from '@/components/songs/SongEditorSource'
import { PlusIcon } from '@/components/icons/lucide-animated/plus-icon'
import { TrashIcon } from '@/components/icons/lucide-animated/trash-icon'
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
  applyKeyChangeToSource,
  applyMetadataStripToSource,
  formatSourceFromSongData,
  createSongLanguageEntry,
  createSongMetaTagEntry,
  metadataStripFromSongData,
  parseErrorsFromResult,
  parseSourceWithEngine,
  patchSongDataFromParsed,
  patchSongDataFromSongData,
  SONG_EDITOR_TIME_SIGNATURES,
  SONG_EDITOR_TYPING_DEBOUNCE_MS,
  shouldPromptKeyChangeChords,
  type KeyChangeChordMode,
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

  const [enginePass, setEnginePass] = useState(0)
  const [engineCache, setEngineCache] = useState<{ key: string; state: EngineState }>({
    key: '',
    state: { status: 'loading' },
  })
  const engineKey = String(enginePass)
  const engineState: EngineState =
    engineCache.key === engineKey ? engineCache.state : { status: 'loading' }
  const [sourceText, setSourceText] = useState('')
  const [metadataStrip, setMetadataStrip] = useState<SongMetadataStrip>({
    subtitle: '',
    copyright: '',
    languageEntries: [],
    tempo: '',
    timeSignature: '',
    key: '',
    tags: [],
  })
  const [parseError, setParseError] = useState<string | null>(null)
  const [ugImportUi, setUgImportUi] = useState<UgImportUiState>({ kind: 'idle' })
  const [activeTab, setActiveTab] = useState<EditorTab>('source')
  const lastLoadedSongRef = useRef('')
  const [resumePrompt, setResumePrompt] = useState(false)
  const [keyChangePrompt, setKeyChangePrompt] = useState<{
    previousKey: string
    pendingStrip: SongMetadataStrip
  } | null>(null)
  const wentOfflineEditing = useRef(false)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const engine = await getChordEngine()
        if (cancelled) return
        setEngineCache({ key: engineKey, state: { status: 'ready', engine } })
      } catch (e) {
        if (cancelled) return
        const message = e instanceof Error ? e.message : String(e)
        setEngineCache({ key: engineKey, state: { status: 'error', message } })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [engineKey])

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
  useEffect(() => {
    parseResultRef.current = parseResult
  }, [parseResult])

  const previewData = parseResult?.ok ? parseResult.data : null
  const parseErrors = useMemo(
    () => (parseResult ? parseErrorsFromResult(parseResult) : []),
    [parseResult],
  )
  const effectiveParseError = parseError ?? parseErrors[0] ?? null

  const [displayedParseError, setDisplayedParseError] = useState<string | null>(null)
  const [displayedParseErrors, setDisplayedParseErrors] = useState<string[]>([])

  useEffect(() => {
    if (!effectiveParseError) {
      const clearId = setTimeout(() => {
        setDisplayedParseError(null)
        setDisplayedParseErrors([])
      }, 0)
      return () => clearTimeout(clearId)
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
    queueMicrotask(() => {
      setSourceText(formatSourceFromSongData(engine, current.data, chordFormat))
    })
  }, [chordFormat, engine])

  useEffect(() => {
    if (!engine || !detail || saveRevision === 0) return
    queueMicrotask(() => {
      const data = detail.data as Record<string, unknown>
      setSourceText(formatSourceFromSongData(engine, data, chordFormat))
      setMetadataStrip(metadataStripFromSongData(data))
      setParseError(null)
    })
  }, [saveRevision, engine, detail, chordFormat])

  const blockingAll =
    patchInFlight || !!saveFailure || offlineFrozen || !editable || resumePrompt || !engineReady
  const sourceBlocked = blockingAll || !editable || !engineReady

  useEffect(() => {
    if (!engine || !editable || sourceBlocked) {
      queueMicrotask(() => setUgImportUi({ kind: 'idle' }))
      return
    }
    if (parseResult?.ok) {
      queueMicrotask(() => setUgImportUi({ kind: 'idle' }))
      return
    }

    queueMicrotask(() => setUgImportUi({ kind: 'idle' }))
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
    if (!retryAfterUntil) return
    const tick = () => {
      setRetrySec(Math.max(0, Math.ceil((retryAfterUntil - Date.now()) / 1000)))
    }
    tick()
    const id = setInterval(tick, 500)
    return () => clearInterval(id)
  }, [retryAfterUntil])
  const displayRetrySec = retryAfterUntil ? retrySec : 0

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

  const commitKeyChange = useCallback(
    (strip: SongMetadataStrip, mode: KeyChangeChordMode, previousKey: string) => {
      if (!engine || !parseResult?.ok || sourceBlocked) return
      const nextSource = applyKeyChangeToSource(
        engine,
        parseResult.data,
        strip,
        mode,
        previousKey,
        chordFormat,
      )
      setSourceText(nextSource)
      const reparsed = parseSourceWithEngine(engine, nextSource)
      if (reparsed.ok) {
        setMetadataStrip(metadataStripFromSongData(reparsed.data))
        setParseError(null)
      }
      queueMicrotask(() => notifyDraftEdited())
    },
    [chordFormat, engine, notifyDraftEdited, parseResult, sourceBlocked],
  )

  const onKeySelectChange = useCallback(
    (value: string) => {
      if (sourceBlocked) return
      const nextKey = value === '__none__' ? '' : value
      const previousKey = metadataStrip.key
      if (nextKey === previousKey) return

      const pendingStrip = { ...metadataStrip, key: nextKey }

      if (
        engine &&
        parseResult?.ok &&
        shouldPromptKeyChangeChords(previousKey, nextKey)
      ) {
        setKeyChangePrompt({ previousKey, pendingStrip })
        return
      }

      setMetadataStrip(pendingStrip)
      queueMicrotask(() => commitMetadataStrip(pendingStrip))
    },
    [commitMetadataStrip, engine, metadataStrip, parseResult, sourceBlocked],
  )

  const onMetadataFieldBlur = useCallback(() => {
    queueMicrotask(() => commitMetadataStrip())
  }, [commitMetadataStrip])

  const updateMetaTag = useCallback((id: string, field: 'key' | 'value', value: string) => {
    setMetadataStrip((strip) => ({
      ...strip,
      tags: strip.tags.map((tag) => (tag.id === id ? { ...tag, [field]: value } : tag)),
    }))
  }, [])

  const updateLanguageEntry = useCallback(
    (id: string, field: 'language' | 'title' | 'artist', value: string) => {
      setMetadataStrip((strip) => ({
        ...strip,
        languageEntries: strip.languageEntries.map((entry) =>
          entry.id === id ? { ...entry, [field]: value } : entry,
        ),
      }))
    },
    [],
  )

  const addLanguageEntry = useCallback(() => {
    setMetadataStrip((strip) => ({
      ...strip,
      languageEntries: [...strip.languageEntries, createSongLanguageEntry()],
    }))
  }, [])

  const removeLanguageEntry = useCallback(
    (id: string) => {
      setMetadataStrip((strip) => {
        const next = { ...strip, languageEntries: strip.languageEntries.filter((entry) => entry.id !== id) }
        queueMicrotask(() => commitMetadataStrip(next))
        return next
      })
    },
    [commitMetadataStrip],
  )

  const addMetaTag = useCallback(() => {
    setMetadataStrip((strip) => ({ ...strip, tags: [...strip.tags, createSongMetaTagEntry()] }))
  }, [])

  const removeMetaTag = useCallback(
    (id: string) => {
      setMetadataStrip((strip) => {
        const next = { ...strip, tags: strip.tags.filter((tag) => tag.id !== id) }
        queueMicrotask(() => commitMetadataStrip(next))
        return next
      })
    },
    [commitMetadataStrip],
  )

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
              disabled={displayRetrySec > 0}
              onClick={() => void retrySave()}
            >
              {displayRetrySec > 0 ? t('songs.editor.retryIn', { seconds: displayRetrySec }) : t('songs.editor.retry')}
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
            <div className="grid gap-2 sm:col-span-2">
              {metadataStrip.languageEntries.length === 0 ? (
                <p className="text-sm text-[var(--color-muted-foreground)]">
                  {t('songs.editor.languageVariantsEmpty')}
                </p>
              ) : (
                <ul className="grid gap-3" role="list">
                  {metadataStrip.languageEntries.map((entry, index) => (
                    <li key={entry.id} className="grid gap-2">
                      <div className="flex items-end gap-2">
                        <label className="grid flex-1 gap-1 text-sm">
                          <span>{t('songs.editor.titleNumberedLabel', { number: index + 1 })}</span>
                          <Input
                            value={entry.title}
                            readOnly={sourceBlocked}
                            onChange={(e) => updateLanguageEntry(entry.id, 'title', e.target.value)}
                            onBlur={onMetadataFieldBlur}
                          />
                        </label>
                        {!sourceBlocked ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="shrink-0"
                            aria-label={t('songs.editor.languageVariantsRemoveAria')}
                            onClick={() => removeLanguageEntry(entry.id)}
                          >
                            <TrashIcon size={18} />
                          </Button>
                        ) : null}
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <label className="grid gap-1 text-sm">
                          <span>{t('songs.editor.languagesNumberedLabel', { number: index + 1 })}</span>
                          <Input
                            value={entry.language}
                            readOnly={sourceBlocked}
                            placeholder={t('songs.editor.languagesPlaceholder')}
                            onChange={(e) => updateLanguageEntry(entry.id, 'language', e.target.value)}
                            onBlur={onMetadataFieldBlur}
                          />
                        </label>
                        <label className="grid gap-1 text-sm">
                          <span>{t('songs.editor.artistsNumberedLabel', { number: index + 1 })}</span>
                          <Input
                            value={entry.artist}
                            readOnly={sourceBlocked}
                            onChange={(e) => updateLanguageEntry(entry.id, 'artist', e.target.value)}
                            onBlur={onMetadataFieldBlur}
                          />
                        </label>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              {!sourceBlocked ? (
                <div className="flex justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 shrink-0"
                    onClick={addLanguageEntry}
                  >
                    <PlusIcon size={16} />
                    {t('songs.editor.languageVariantsAdd')}
                  </Button>
                </div>
              ) : null}
            </div>
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
                onValueChange={onKeySelectChange}
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
            <label className="grid gap-1 text-sm">
              <span>{t('songs.editor.copyrightLabel')}</span>
              <Input
                value={metadataStrip.copyright}
                readOnly={sourceBlocked}
                onChange={(e) => setMetadataStrip((s) => ({ ...s, copyright: e.target.value }))}
                onBlur={onMetadataFieldBlur}
              />
            </label>
            <div className="grid gap-2 sm:col-span-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm">{t('songs.editor.tagsLabel')}</span>
                {!sourceBlocked ? (
                  <Button type="button" variant="outline" size="sm" className="h-8 shrink-0" onClick={addMetaTag}>
                    <PlusIcon size={16} />
                    {t('songs.editor.tagsAdd')}
                  </Button>
                ) : null}
              </div>
              {metadataStrip.tags.length === 0 ? (
                <p className="text-sm text-[var(--color-muted-foreground)]">{t('songs.editor.tagsEmpty')}</p>
              ) : (
                <ul className="grid gap-2" role="list">
                  {metadataStrip.tags.map((tag) => (
                    <li
                      key={tag.id}
                      className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-center gap-2"
                    >
                      <Input
                        value={tag.key}
                        readOnly={sourceBlocked}
                        placeholder={t('songs.editor.tagsKeyPlaceholder')}
                        aria-label={t('songs.editor.tagsKeyLabel')}
                        onChange={(e) => updateMetaTag(tag.id, 'key', e.target.value)}
                        onBlur={onMetadataFieldBlur}
                      />
                      <Input
                        value={tag.value}
                        readOnly={sourceBlocked}
                        placeholder={t('songs.editor.tagsValuePlaceholder')}
                        aria-label={t('songs.editor.tagsValueLabel')}
                        onChange={(e) => updateMetaTag(tag.id, 'value', e.target.value)}
                        onBlur={onMetadataFieldBlur}
                      />
                      {!sourceBlocked ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="shrink-0"
                          aria-label={t('songs.editor.tagsRemoveAria')}
                          onClick={() => removeMetaTag(tag.id)}
                        >
                          <TrashIcon size={18} />
                        </Button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </div>
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

      <AlertDialog
        open={keyChangePrompt != null}
        onOpenChange={(open) => {
          if (!open) setKeyChangePrompt(null)
        }}
      >
        <AlertDialogContent className="min-w-0 w-[min(100%,28rem)] max-w-[calc(100vw-2rem)]">
          <AlertDialogHeader className="min-w-0 text-left">
            <AlertDialogTitle>{t('songs.editor.keyChangeTitle')}</AlertDialogTitle>
            <AlertDialogDescription className="text-pretty leading-relaxed">
              {keyChangePrompt
                ? t('songs.editor.keyChangeDescription', {
                    from: keyChangePrompt.previousKey,
                    to: keyChangePrompt.pendingStrip.key,
                  })
                : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex flex-col gap-2 sm:flex-col sm:items-stretch">
            <Button
              type="button"
              className="w-full"
              onClick={() => {
                const prompt = keyChangePrompt
                setKeyChangePrompt(null)
                if (!prompt) return
                commitKeyChange(prompt.pendingStrip, 'transpose', prompt.previousKey)
              }}
            >
              {t('songs.editor.keyChangeTranspose')}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => {
                const prompt = keyChangePrompt
                setKeyChangePrompt(null)
                if (!prompt) return
                setMetadataStrip(prompt.pendingStrip)
                commitKeyChange(prompt.pendingStrip, 'keep', prompt.previousKey)
              }}
            >
              {t('songs.editor.keyChangeKeep')}
            </Button>
            <AlertDialogCancel className="mt-0 w-full">
              {t('teams.dialogCancel')}
            </AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
