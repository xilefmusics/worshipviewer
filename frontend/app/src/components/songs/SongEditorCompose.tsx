import {
  closestCenter,
  DndContext,
  type CollisionDetection,
  type DragEndEvent,
  type DragMoveEvent,
  type DragOverEvent,
  type DragStartEvent,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useCallback, useContext, useEffect, useMemo, useRef, useState, createContext, type CSSProperties, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { PlusIcon } from '@/components/icons/lucide-animated/plus-icon'
import { TrashIcon } from '@/components/icons/lucide-animated/trash-icon'
import {
  COMPOSE_CHORD_BELT_SCROLL_PAD_CLASS,
  HUB_FOOTER_CHROME_BOTTOM_INSET_CLASS,
} from '@/components/hub/hub-chrome-styles'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PopoverContent, PopoverRoot, PopoverTrigger } from '@/components/ui/popover'
import type { ChordFormatPreference } from '@/lib/chord-format'
import { buildDiatonicChordModeSymbol, CHORD_MODE_FLAT7_SELECTED_INDEX, composeChordPool, composeMixolydianChordPool, composeOtherChordPool, formatChordModeExtension, hasChordModeExtension, isDiatonicPoolSymbolMinor, stripChordModeExtension, type ChordModeExtensionKind, type ComposePoolChord } from '@/lib/song-editor-compose-pool'
import {
  addComposeChordAtIndex,
  clampChordPosition,
  composeBarBoundaryPercent,
  composeBarInsertPreviewSegmentLayout,
  composeBarSegmentLayout,
  composeBarWeightsFromChords,
  composeBarTotalWeight,
  composeChordBarDisplayGridMillis,
  composeChordBarDisplayMeasureCount,
  snapComposeBarDurationMillis,
  composeChordBarWeight,
  composeChordDisplayLabel,
  composeChordOnlyLineMeasureMismatch,
  composeTranslationTrackChordsMismatch,
  composeDefaultBarDurationMillis,
  createComposeChordOnlyLine,
  createComposeLine,
  createComposeSection,
  defaultSectionTitle,
  buildComposeLinesFromPaste,
  splitPasteIntoLineSegments,
  duplicateComposeChordBetweenLines,
  duplicateComposeChordToLineAfter,
  findComposeLineInSections,
  formatComposeChordDurationBeats,
  insertComposeLineAfter,
  isComposeChordOnlyLine,
  moveComposeChordBetweenLines,
  moveComposeChordToLineAfter,
  normalizeChordOnlyLine,
  parseComposeChordDurationBeats,
  positionFromBarPointer,
  positionFromCharMirror,
  resizeComposeBarDuration,
  sortedComposeLineChords,
  clampComposeLineTrackChords,
  composeLineChordsForTrack,
  composeLineHasTranslationContent,
  composeLineTrackText,
  convertComposeLineToChordBar,
  normalizeComposeLineForLanguageTracks,
  createComposeChordForLineTrack,
  isComposeBarDisplayChord,
  isComposeChordBarRow,
  isComposeLineChordBarTarget,
  updateComposeLineChordsForTrack,
  type ComposeChord,
  type ComposeLine,
  type ComposeSection,
} from '@/lib/song-editor-compose'
import { beatsPerMeasureFromTimeSignature } from '@/lib/song-editor-state'
import {
  CHORD_ERASER_MODE_ARIA_SHORTCUT,
  CHORD_SIMPLIFY_MODE_ARIA_SHORTCUT,
  CHORD_PLACEMENT_MODE_ARIA_SHORTCUT,
  chordEraserModeShortcutLabel,
  chordSimplifyModeShortcutLabel,
  chordPlacementModeShortcutLabel,
  isChordEraserModeShortcut,
  isChordSimplifyModeShortcut,
  isChordPlacementModeShortcut,
} from '@/lib/song-editor-compose-shortcuts'
import { cn } from '@/lib/utils'
import { useIsPhoneWidth } from '@/hooks/useMediaQuery'

const LINE_TEXT_PADDING_X = 12

const COMPOSE_MONO_TEXT =
  'font-mono text-sm leading-5 text-[var(--color-foreground)]'

const COMPOSE_CHORD_TEXT =
  'font-mono text-sm font-bold leading-5 text-[var(--color-primary)]'

const COMPOSE_LYRIC_HIGHLIGHT_TEXT =
  'font-mono text-sm leading-5 text-[var(--color-compose-chord)]'

const COMPOSE_TRANSLATION_TEXT =
  'font-mono text-sm italic leading-5 text-[var(--color-muted-foreground)]'

function assignRef<T>(ref: React.Ref<T>, value: T | null) {
  if (typeof ref === 'function') ref(value)
  else if (ref) ref.current = value
}

type SongEditorComposeProps = {
  sections: ComposeSection[]
  songKey: string | null
  timeSignature: string
  chordFormat: ChordFormatPreference
  readOnly: boolean
  /** Language tags for translation tracks (song languages 2..N). */
  translationLanguages: string[]
  onChange: (sections: ComposeSection[]) => void
}

type LineMeasureFn = (clientX: number) => number

type PoolDragData = { type: 'pool'; symbol: string }
type LineChordDragData = { type: 'line-chord'; lineId: string; chordId: string; trackIndex: number }
type LineDropData = { type: 'line'; lineId: string; trackIndex: number }
type LineAfterDropData = { type: 'line-after'; lineId: string }

type ComposeLineChordDragContextValue = {
  activeChordId: string | null
  duplicateSourceId: string | null
}

const ComposeLineChordDragContext = createContext<ComposeLineChordDragContextValue>({
  activeChordId: null,
  duplicateSourceId: null,
})

type ComposeChordModeHover = {
  lineId: string
  trackIndex: number
  charIndex: number
}

type ComposeChordModeContextValue = {
  enabled: boolean
  eraserEnabled: boolean
  simplifyEnabled: boolean
  selectedIndex: number
  selectedSymbol: string | null
  hover: ComposeChordModeHover | null
  eraserHoverChordId: string | null
  simplifyHoverChordId: string | null
  setEnabled: (enabled: boolean) => void
  selectIndex: (index: number) => void
  setHover: (hover: ComposeChordModeHover | null) => void
  setEraserHoverChordId: (chordId: string | null) => void
  setSimplifyHoverChordId: (chordId: string | null) => void
  placeAt: (lineId: string, trackIndex: number, charIndex: number) => void
  eraseAt: (lineId: string, trackIndex: number, charIndex: number) => void
  eraseChord: (lineId: string, trackIndex: number, chordId: string) => void
  simplifyChord: (lineId: string, trackIndex: number, chordId: string) => void
}

const ComposeChordModeContext = createContext<ComposeChordModeContextValue | null>(null)

function poolDragId(chordId: string): string {
  return `pool:${chordId}`
}

function lineDragId(lineId: string, trackIndex = 0): string {
  return `line:${lineId}:${trackIndex}`
}

function lineMeasureKey(lineId: string, trackIndex: number): string {
  return `${lineId}:${trackIndex}`
}

function lineAfterDragId(lineId: string): string {
  return `line-after:${lineId}`
}

function lineChordDragId(lineId: string, chordId: string): string {
  return `chord:${lineId}:${chordId}`
}

function sectionSortId(sectionId: string): string {
  return `section:${sectionId}`
}

function parseSectionSortId(id: string): string | null {
  if (!id.startsWith('section:')) return null
  return id.slice('section:'.length)
}

function isSectionSortId(id: unknown): boolean {
  return typeof id === 'string' && id.startsWith('section:')
}

function trackIndexFromLineDragId(id: string): number {
  if (!id.startsWith('line:') || id.startsWith('line-after:')) return 0
  const lastColon = id.lastIndexOf(':')
  if (lastColon < 0) return 0
  const parsed = Number.parseInt(id.slice(lastColon + 1), 10)
  return Number.isFinite(parsed) ? parsed : 0
}

const composeCollisionDetection: CollisionDetection = (args) => {
  if (isSectionSortId(args.active.id)) {
    return closestCenter(args)
  }
  const hits = pointerWithin(args)
  if (hits.length <= 1) return hits

  const lineHits = hits.filter((hit) => {
    const id = String(hit.id)
    return id.startsWith('line:') && !id.startsWith('line-after:')
  })
  if (lineHits.length <= 1) return hits

  const sortedLineHits = [...lineHits].sort(
    (a, b) => trackIndexFromLineDragId(String(b.id)) - trackIndexFromLineDragId(String(a.id)),
  )
  const preferred = sortedLineHits[0]
  if (!preferred) return hits
  return [preferred, ...hits.filter((hit) => hit.id !== preferred.id)]
}

function parseLineChordDragId(id: string): { lineId: string; chordId: string } | null {
  if (!id.startsWith('chord:')) return null
  const rest = id.slice('chord:'.length)
  const split = rest.indexOf(':')
  if (split <= 0) return null
  return { lineId: rest.slice(0, split), chordId: rest.slice(split + 1) }
}

function dragPointerClientX(event: {
  activatorEvent: Event | null
  delta: { x: number; y: number }
}): number | null {
  const start = event.activatorEvent
  if (!start || !('clientX' in start) || typeof start.clientX !== 'number') return null
  return start.clientX + event.delta.x
}

type BarDragOverlay = {
  symbol: string
  width: number
  height: number
}

function composeBarDragOverlayForLine(
  line: ComposeLine,
  timeSignature: string,
  symbol: string,
  barContainer: HTMLDivElement | null,
  overWidth: number | undefined,
): BarDragOverlay {
  const weights = composeBarWeightsFromChords(sortedComposeLineChords(line), timeSignature)
  const previewWeight = composeDefaultBarDurationMillis(timeSignature)
  const displayGridMillis = composeChordBarDisplayGridMillis(
    composeBarTotalWeight(weights),
    timeSignature,
  )
  const widthPercent =
    displayGridMillis > 0 ? (previewWeight / displayGridMillis) * 100 : 25
  const containerWidth =
    barContainer?.getBoundingClientRect().width ??
    Math.max(0, (overWidth ?? 0) - LINE_TEXT_PADDING_X * 2)
  const containerHeight = barContainer?.getBoundingClientRect().height ?? 32

  return {
    symbol: symbol.trim(),
    width: Math.max(24, (widthPercent / 100) * containerWidth),
    height: containerHeight,
  }
}

function chordLeftCss(position: number): string {
  return `calc(${LINE_TEXT_PADDING_X}px + ${position} * 1ch)`
}

const DIATONIC_POOL_ROWS = [
  [0, 3, 4],
  [5, 1, 2],
] as const

const MIXOLYDIAN_POOL_ROWS = [[1], [0]] as const

const OTHER_POOL_ROWS = [
  [2, 0, 4],
  [3, 1, 5],
] as const

function ComposeModeToolbarButton({
  active,
  activeClassName,
  ariaLabel,
  ariaKeyshortcuts,
  title,
  onClick,
  className,
  children,
}: {
  active: boolean
  activeClassName: string
  ariaLabel: string
  ariaKeyshortcuts: string
  title: string
  onClick: () => void
  className?: string
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      aria-label={ariaLabel}
      aria-keyshortcuts={ariaKeyshortcuts}
      title={title}
      className={cn(
        'rounded px-1 py-0.5 text-center text-[10px] font-medium uppercase tracking-wide transition-colors',
        active
          ? activeClassName
          : 'bg-[var(--color-muted)]/40 text-[var(--color-muted-foreground)]',
        className,
      )}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

function ComposeChordPoolBox({
  labelKey,
  chords,
  rows,
  columns,
  selectedChordIndex = null,
  chordModeEnabled = false,
  onPlaceModeSelect,
}: {
  labelKey: string
  chords: ComposePoolChord[]
  rows: readonly (readonly number[])[]
  columns: 1 | 2 | 3
  selectedChordIndex?: number | null
  chordModeEnabled?: boolean
  onPlaceModeSelect?: (index: number) => void
}) {
  const { t } = useTranslation()
  const columnClass =
    columns === 1 ? 'grid-cols-1' : columns === 2 ? 'grid-cols-2' : 'grid-cols-3'

  return (
    <aside className="flex min-w-0 flex-1 flex-col gap-1 rounded-lg border border-[var(--color-border)]/70 bg-[var(--color-bg)]/80 p-1.5">
      <span className="px-0.5 text-center text-[10px] font-medium uppercase tracking-wide text-[var(--color-muted-foreground)]">
        {t(labelKey)}
      </span>
      <div className="grid gap-0.5">
        {rows.map((row, rowIndex) => (
          <div key={rowIndex} className={cn('grid gap-0.5', columnClass)}>
            {row.map((index) => {
              const chord = chords[index]
              if (!chord) return null
              return (
                <PoolChordButton
                  key={chord.id}
                  chord={chord}
                  isSelected={selectedChordIndex === index}
                  chordModeEnabled={chordModeEnabled}
                  onPlaceModeSelect={
                    onPlaceModeSelect ? () => onPlaceModeSelect(index) : undefined
                  }
                />
              )
            })}
          </div>
        ))}
      </div>
    </aside>
  )
}

function ComposeChordPools({
  diatonicChords,
  mixolydianChords,
  otherChords,
  readOnly,
  chordModeEnabled,
  eraserModeEnabled,
  simplifyModeEnabled,
  diatonicSelectedIndex,
  mixolydianSelectedIndex,
  otherSelectedIndex,
  onChordModeToggle,
  onEraserModeToggle,
  onSimplifyModeToggle,
  onDiatonicPlaceModeSelect,
  onMixolydianPlaceModeSelect,
  onOtherPlaceModeSelect,
}: {
  diatonicChords: ComposePoolChord[]
  mixolydianChords: ComposePoolChord[]
  otherChords: ComposePoolChord[]
  readOnly: boolean
  chordModeEnabled: boolean
  eraserModeEnabled: boolean
  simplifyModeEnabled: boolean
  diatonicSelectedIndex: number | null
  mixolydianSelectedIndex: number | null
  otherSelectedIndex: number | null
  onChordModeToggle: () => void
  onEraserModeToggle: () => void
  onSimplifyModeToggle: () => void
  onDiatonicPlaceModeSelect: (index: number) => void
  onMixolydianPlaceModeSelect: (index: number) => void
  onOtherPlaceModeSelect: (index: number) => void
}) {
  const { t } = useTranslation()
  const isPhone = useIsPhoneWidth()
  const placementShortcutLabel = chordPlacementModeShortcutLabel()
  const eraserShortcutLabel = chordEraserModeShortcutLabel()
  const simplifyShortcutLabel = chordSimplifyModeShortcutLabel()
  if (readOnly) return null

  return (
    <div className={cn('pointer-events-none fixed inset-x-0 bottom-0 z-20 flex justify-center', HUB_FOOTER_CHROME_BOTTOM_INSET_CLASS)}>
      <div
        className={cn(
          'pointer-events-auto flex w-full max-w-lg items-end gap-2',
          'border border-[var(--color-border)] bg-[var(--color-surface)]/95 px-3 py-2',
          'shadow-[var(--shadow-elevated)] backdrop-blur-md',
          'rounded-t-xl sm:rounded-t-2xl',
        )}
        role="toolbar"
        aria-label={t('songs.editor.compose.chordPoolAria')}
      >
        <div className="flex min-w-0 flex-1 items-end justify-center gap-2">
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <ComposeModeToolbarButton
              active={eraserModeEnabled}
              activeClassName="bg-[var(--color-danger)] text-[var(--color-primary-foreground)]"
              ariaLabel={t('songs.editor.compose.eraserModeAria')}
              ariaKeyshortcuts={CHORD_ERASER_MODE_ARIA_SHORTCUT}
              title={t('songs.editor.compose.eraserModeHint')}
              onClick={onEraserModeToggle}
            >
              {t('songs.editor.compose.eraserModeLabel')}
              {!isPhone ? (
                <span className="ml-1 normal-case opacity-70">{eraserShortcutLabel}</span>
              ) : null}
            </ComposeModeToolbarButton>
            <ComposeChordPoolBox
              labelKey="songs.editor.compose.chordPoolMixolydianLabel"
              chords={mixolydianChords}
              rows={MIXOLYDIAN_POOL_ROWS}
              columns={1}
              selectedChordIndex={mixolydianSelectedIndex}
              chordModeEnabled={chordModeEnabled}
              onPlaceModeSelect={onMixolydianPlaceModeSelect}
            />
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <ComposeModeToolbarButton
              active={chordModeEnabled}
              activeClassName="bg-[var(--color-primary)] text-[var(--color-primary-foreground)]"
              ariaLabel={t('songs.editor.compose.chordModeAria')}
              ariaKeyshortcuts={CHORD_PLACEMENT_MODE_ARIA_SHORTCUT}
              title={t('songs.editor.compose.chordModeHint')}
              onClick={onChordModeToggle}
            >
              {t('songs.editor.compose.chordModeLabel')}
              {!isPhone ? (
                <span className="ml-1 normal-case opacity-70">{placementShortcutLabel}</span>
              ) : null}
            </ComposeModeToolbarButton>
            <ComposeChordPoolBox
              labelKey="songs.editor.compose.chordPoolDiatonicLabel"
              chords={diatonicChords}
              rows={DIATONIC_POOL_ROWS}
              columns={3}
              selectedChordIndex={diatonicSelectedIndex}
              chordModeEnabled={chordModeEnabled}
              onPlaceModeSelect={onDiatonicPlaceModeSelect}
            />
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <ComposeModeToolbarButton
              active={simplifyModeEnabled}
              activeClassName="bg-[var(--color-danger)] text-[var(--color-primary-foreground)]"
              ariaLabel={t('songs.editor.compose.simplifyModeAria')}
              ariaKeyshortcuts={CHORD_SIMPLIFY_MODE_ARIA_SHORTCUT}
              title={t('songs.editor.compose.simplifyModeHint')}
              onClick={onSimplifyModeToggle}
            >
              {t('songs.editor.compose.simplifyModeLabel')}
              {!isPhone ? (
                <span className="ml-1 normal-case opacity-70">{simplifyShortcutLabel}</span>
              ) : null}
            </ComposeModeToolbarButton>
            <ComposeChordPoolBox
              labelKey="songs.editor.compose.chordPoolOtherLabel"
              chords={otherChords}
              rows={OTHER_POOL_ROWS}
              columns={3}
              selectedChordIndex={otherSelectedIndex}
              chordModeEnabled={chordModeEnabled}
              onPlaceModeSelect={onOtherPlaceModeSelect}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

function PoolChordButton({
  chord,
  isSelected = false,
  chordModeEnabled = false,
  onPlaceModeSelect,
}: {
  chord: ComposePoolChord
  isSelected?: boolean
  chordModeEnabled?: boolean
  onPlaceModeSelect?: () => void
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: poolDragId(chord.id),
    data: { type: 'pool', symbol: chord.symbol } satisfies PoolDragData,
    disabled: chordModeEnabled,
  })

  return (
    <button
      ref={setNodeRef}
      type="button"
      className={cn(
        chordModeEnabled
          ? 'cursor-pointer rounded-md px-1 py-1.5 hover:bg-[var(--color-muted)]/50'
          : 'cursor-grab rounded-md px-1 py-1.5 hover:bg-[var(--color-muted)]/50 active:cursor-grabbing',
        COMPOSE_CHORD_TEXT,
        isDragging && 'opacity-40',
        isSelected && 'bg-[var(--color-primary)]/15 ring-1 ring-[var(--color-primary)]/50',
      )}
      aria-label={chord.symbol}
      aria-pressed={chordModeEnabled ? isSelected : undefined}
      onClick={chordModeEnabled ? onPlaceModeSelect : undefined}
      {...(chordModeEnabled ? {} : { ...listeners, ...attributes })}
    >
      {chord.symbol}
    </button>
  )
}

function ComposeLyricField({
  text,
  readOnly,
  charHighlights,
  inputRef,
  mirrorRef,
  placeholder,
  title,
  ariaLabel,
  tone = 'primary',
  onKeyDown,
  onChange,
  onPaste,
}: {
  text: string
  readOnly: boolean
  charHighlights: Map<number, 'placed' | 'active'>
  inputRef: React.Ref<HTMLInputElement | HTMLDivElement>
  mirrorRef: React.Ref<HTMLDivElement>
  placeholder: string
  title?: string
  ariaLabel: string
  tone?: 'primary' | 'translation'
  onKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => void
  onChange: (event: React.ChangeEvent<HTMLInputElement>) => void
  onPaste?: (event: React.ClipboardEvent<HTMLInputElement>) => void
}) {
  const baseCharClass =
    tone === 'translation' ? COMPOSE_TRANSLATION_TEXT : 'text-[var(--color-foreground)]'

  const coloredText =
    text.length > 0 ? (
      [...text].map((char, index) => {
        const kind = charHighlights.get(index)
        const isHighlightedSpace = Boolean(kind) && char === ' '
        return (
          <span
            key={`${index}-${char}`}
            data-char-index={index}
            className={kind ? COMPOSE_LYRIC_HIGHLIGHT_TEXT : baseCharClass}
          >
            {isHighlightedSpace ? '\u00B7' : char}
          </span>
        )
      })
    ) : null

  const fieldClass = cn(
    tone === 'translation' ? COMPOSE_TRANSLATION_TEXT : COMPOSE_MONO_TEXT,
    'block h-5 w-full border-0 bg-transparent pb-0 pt-0 outline-none',
  )
  const fieldStyle = { paddingLeft: LINE_TEXT_PADDING_X, paddingRight: LINE_TEXT_PADDING_X }

  if (readOnly) {
    return (
      <div
        ref={(node) => {
          assignRef(inputRef, node)
          assignRef(mirrorRef, node)
        }}
        className={cn(fieldClass, 'relative whitespace-pre')}
        style={fieldStyle}
      >
        {coloredText}
      </div>
    )
  }

  return (
    <div className="relative h-5">
      <div
        ref={mirrorRef}
        aria-hidden
        className={cn(fieldClass, 'pointer-events-none absolute inset-0 overflow-hidden whitespace-pre')}
        style={fieldStyle}
      >
        {coloredText}
      </div>
      <input
        ref={inputRef as React.RefObject<HTMLInputElement>}
        value={text}
        className={cn(
          fieldClass,
          'relative text-transparent caret-[var(--color-foreground)] selection:bg-[var(--color-primary)]/25',
          tone === 'translation'
            ? 'placeholder:text-[var(--color-muted-foreground)]/70'
            : 'placeholder:text-[var(--color-muted-foreground)]',
        )}
        style={fieldStyle}
        placeholder={placeholder}
        title={title}
        aria-label={ariaLabel}
        onKeyDown={onKeyDown}
        onChange={onChange}
        onPaste={onPaste}
      />
    </div>
  )
}

function splitTrackChordsAtCaret(
  chords: ComposeChord[],
  caret: number,
  side: 'before' | 'after',
  textLength: number,
): ComposeChord[] {
  return chords
    .filter((chord) => (side === 'before' ? chord.position < caret : chord.position >= caret))
    .map((chord) => ({
      ...chord,
      position: clampChordPosition(
        side === 'before' ? chord.position : chord.position - caret,
        textLength,
      ),
    }))
}

function splitComposeLineAtIndex(line: ComposeLine, caret: number): {
  currentLine: ComposeLine
  newLine: ComposeLine
} {
  const translations = line.translations ?? []
  const before = line.text.slice(0, caret)
  const after = line.text.slice(caret)
  const translationCount = translations.length
  const beforeTranslations = translations.map((translation) => translation.slice(0, caret))
  const afterTranslations = translations.map((translation) => translation.slice(caret))
  const translationChords = line.translationChords ?? []
  const splitTranslationChords = translationChords.map((trackChords, index) => ({
    before: splitTrackChordsAtCaret(
      trackChords,
      caret,
      'before',
      beforeTranslations[index]?.length ?? 0,
    ),
    after: splitTrackChordsAtCaret(
      trackChords,
      caret,
      'after',
      afterTranslations[index]?.length ?? 0,
    ),
  }))

  const currentLine: ComposeLine = {
    ...line,
    text: before,
    translations: beforeTranslations,
    chords: splitTrackChordsAtCaret(line.chords, caret, 'before', before.length),
    ...(translationCount > 0
      ? { translationChords: splitTranslationChords.map((entry) => entry.before) }
      : {}),
  }

  const newLine: ComposeLine = {
    ...createComposeLine(after, crypto.randomUUID(), translationCount),
    translations: afterTranslations,
    chords: splitTrackChordsAtCaret(line.chords, caret, 'after', after.length),
    ...(translationCount > 0
      ? { translationChords: splitTranslationChords.map((entry) => entry.after) }
      : {}),
  }

  return { currentLine, newLine }
}

function ComposeLyricTrackEditor({
  line,
  trackIndex,
  trackChords,
  text,
  readOnly,
  autoFocus,
  isDropTarget,
  highlightCharIndex,
  previewChordSymbol,
  isTranslation,
  timeSignature,
  placeholder,
  ariaLabel,
  registerMeasure,
  onTextChange,
  onKeyDown,
  onPaste,
  onRemoveChord,
  onUpdateChordSymbol,
  onUpdateChordDuration,
}: {
  line: ComposeLine
  trackIndex: number
  trackChords: ComposeChord[]
  text: string
  readOnly: boolean
  autoFocus?: boolean
  isDropTarget?: boolean
  highlightCharIndex?: number | null
  previewChordSymbol?: string | null
  isTranslation?: boolean
  timeSignature: string
  placeholder: string
  ariaLabel: string
  registerMeasure: (measureKey: string, measure: LineMeasureFn | null) => void
  onTextChange: (nextText: string) => void
  onKeyDown?: (event: React.KeyboardEvent<HTMLInputElement>) => void
  onPaste?: (event: React.ClipboardEvent<HTMLInputElement>) => void
  onRemoveChord: (chordId: string) => void
  onUpdateChordSymbol: (chordId: string, symbol: string) => void
  onUpdateChordDuration: (chordId: string, durationMillis: number | null) => void
}) {
  const { t } = useTranslation()
  const chordMode = useContext(ComposeChordModeContext)
  const textRef = useRef<HTMLInputElement | HTMLDivElement>(null)
  const mirrorRef = useRef<HTMLDivElement>(null)
  const measureKey = lineMeasureKey(line.id, trackIndex)
  const isChordBar = isComposeLineChordBarTarget(line, trackIndex)
  const chordModeTrackActive =
    Boolean(chordMode?.enabled) &&
    !readOnly &&
    !isChordBar &&
    text.trim().length > 0
  const eraserModeTrackActive =
    Boolean(chordMode?.eraserEnabled) &&
    !readOnly &&
    !isChordBar &&
    text.trim().length > 0
  const simplifyModeTrackActive =
    Boolean(chordMode?.simplifyEnabled) &&
    !readOnly &&
    !isChordBar &&
    text.trim().length > 0
  const composeInteractionTrackActive =
    chordModeTrackActive || eraserModeTrackActive || simplifyModeTrackActive

  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: lineDragId(line.id, trackIndex),
    data: { type: 'line', lineId: line.id, trackIndex } satisfies LineDropData,
    disabled: readOnly || (isTranslation && text.trim().length === 0),
  })

  useEffect(() => {
    if (!autoFocus) return
    const el = textRef.current
    if (el instanceof HTMLInputElement) el.focus()
  }, [autoFocus, line.id, trackIndex])

  useEffect(() => {
    const measure: LineMeasureFn = (clientX) => {
      const mirror = mirrorRef.current
      if (!mirror) return 0
      return positionFromCharMirror(mirror, clientX, text.length)
    }
    registerMeasure(measureKey, measure)
    return () => registerMeasure(measureKey, null)
  }, [measureKey, registerMeasure, text.length])

  const dropActive = isDropTarget || isOver
  const chordModeHover =
    chordModeTrackActive &&
    chordMode?.hover?.lineId === line.id &&
    chordMode.hover.trackIndex === trackIndex
      ? chordMode.hover
      : null
  const effectiveHighlightCharIndex = highlightCharIndex ?? chordModeHover?.charIndex ?? null
  const showDragHighlight =
    effectiveHighlightCharIndex != null &&
    text.length > 0 &&
    effectiveHighlightCharIndex < text.length
  const previewPosition =
    showDragHighlight && effectiveHighlightCharIndex != null
      ? clampChordPosition(effectiveHighlightCharIndex, text.length)
      : null
  const effectivePreviewSymbol =
    chordModeTrackActive && chordMode?.selectedSymbol && chordModeHover
      ? chordMode.selectedSymbol
      : previewChordSymbol

  const charHighlights = useMemo(() => {
    if (text.length <= 0) return new Map<number, 'placed' | 'active'>()

    const highlights = new Map<number, 'placed' | 'active'>()
    for (const chord of trackChords) {
      if (!chord.symbol.trim()) continue
      highlights.set(chord.position, 'placed')
    }
    if (showDragHighlight && effectiveHighlightCharIndex != null) {
      highlights.set(effectiveHighlightCharIndex, 'active')
    }
    return highlights
  }, [effectiveHighlightCharIndex, showDragHighlight, text.length, trackChords])

  function updateChordModeHover(clientX: number) {
    if (!chordModeTrackActive || !chordMode) return
    const mirror = mirrorRef.current
    if (!mirror) return
    const charIndex = positionFromCharMirror(mirror, clientX, text.length)
    const current = chordMode.hover
    if (
      current?.lineId === line.id &&
      current.trackIndex === trackIndex &&
      current.charIndex === charIndex
    ) {
      return
    }
    chordMode.setHover({ lineId: line.id, trackIndex, charIndex })
  }

  function clearChordModeHover() {
    if (!chordMode) return
    const current = chordMode.hover
    if (current?.lineId === line.id && current.trackIndex === trackIndex) {
      chordMode.setHover(null)
    }
  }

  function updatePlacedChordHover(clientX: number, clientY: number) {
    if (!chordMode) return
    const target = document.elementFromPoint(clientX, clientY)
    const placedChordEl = target?.closest('[data-compose-placed-chord]')
    const chordId = placedChordEl?.getAttribute('data-chord-id') ?? null
    if (eraserModeTrackActive) {
      if (chordMode.eraserHoverChordId !== chordId) {
        chordMode.setEraserHoverChordId(chordId)
      }
      return
    }
    if (simplifyModeTrackActive) {
      if (chordMode.simplifyHoverChordId !== chordId) {
        chordMode.setSimplifyHoverChordId(chordId)
      }
    }
  }

  function clearEraserHover() {
    if (!chordMode) return
    if (chordMode.eraserHoverChordId) {
      chordMode.setEraserHoverChordId(null)
    }
  }

  function clearSimplifyHover() {
    if (!chordMode) return
    if (chordMode.simplifyHoverChordId) {
      chordMode.setSimplifyHoverChordId(null)
    }
  }

  function handleEraserPointerDown(event: React.PointerEvent<HTMLElement>) {
    if (!eraserModeTrackActive || !chordMode) return
    event.preventDefault()
    const placedChordEl = event.target instanceof Element
      ? event.target.closest('[data-compose-placed-chord]')
      : null
    if (placedChordEl) {
      const chordId = placedChordEl.getAttribute('data-chord-id')
      if (chordId) {
        chordMode.eraseChord(line.id, trackIndex, chordId)
      }
      return
    }
    const mirror = mirrorRef.current
    const charIndex = mirror
      ? positionFromCharMirror(mirror, event.clientX, text.length)
      : 0
    chordMode.eraseAt(line.id, trackIndex, charIndex)
  }

  function handleSimplifyPointerDown(event: React.PointerEvent<HTMLElement>) {
    if (!simplifyModeTrackActive || !chordMode) return
    event.preventDefault()
    const placedChordEl = event.target instanceof Element
      ? event.target.closest('[data-compose-placed-chord]')
      : null
    if (!placedChordEl) return
    const chordId = placedChordEl.getAttribute('data-chord-id')
    if (chordId) {
      chordMode.simplifyChord(line.id, trackIndex, chordId)
    }
  }

  function handleComposeInteractionPointerDown(event: React.PointerEvent<HTMLElement>) {
    if (eraserModeTrackActive) {
      handleEraserPointerDown(event)
      return
    }
    if (simplifyModeTrackActive) {
      handleSimplifyPointerDown(event)
      return
    }
    handleChordModePointerDown(event)
  }

  function handleComposeInteractionPointerMove(event: React.PointerEvent<HTMLElement>) {
    if (eraserModeTrackActive || simplifyModeTrackActive) {
      updatePlacedChordHover(event.clientX, event.clientY)
      return
    }
    updateChordModeHover(event.clientX)
  }

  function clearComposeInteractionHover() {
    if (eraserModeTrackActive) {
      clearEraserHover()
      return
    }
    if (simplifyModeTrackActive) {
      clearSimplifyHover()
      return
    }
    clearChordModeHover()
  }

  function handleChordModePointerDown(event: React.PointerEvent<HTMLElement>) {
    if (!chordModeTrackActive || !chordMode?.selectedSymbol) return
    if (
      event.target instanceof Element &&
      event.target.closest('[data-compose-placed-chord]')
    ) {
      return
    }
    event.preventDefault()
    const mirror = mirrorRef.current
    const hover = chordMode.hover
    const charIndex =
      hover?.lineId === line.id && hover.trackIndex === trackIndex
        ? hover.charIndex
        : mirror
          ? positionFromCharMirror(mirror, event.clientX, text.length)
          : 0
    chordMode.placeAt(line.id, trackIndex, charIndex)
  }

  const hasChordLane = text.trim().length > 0
  const translationChordMismatch = useMemo(
    () =>
      isTranslation
        ? composeTranslationTrackChordsMismatch(line, trackIndex, timeSignature)
        : false,
    [isTranslation, line, trackIndex, timeSignature],
  )

  return (
    <div className="grid">
      <div
        ref={setDropRef}
        className={cn(
          'relative transition-colors',
          hasChordLane ? 'min-h-10' : 'min-h-6',
          dropActive && 'rounded-sm bg-[var(--color-primary)]/5',
          translationChordMismatch && 'rounded-sm bg-[var(--color-danger)]/5',
          chordModeTrackActive && 'cursor-crosshair',
          eraserModeTrackActive && 'cursor-pointer',
          simplifyModeTrackActive && 'cursor-pointer',
        )}
        onPointerMove={
          composeInteractionTrackActive
            ? (event) => handleComposeInteractionPointerMove(event)
            : undefined
        }
        onPointerLeave={composeInteractionTrackActive ? clearComposeInteractionHover : undefined}
        onPointerDownCapture={
          composeInteractionTrackActive ? handleComposeInteractionPointerDown : undefined
        }
      >
        <div className={cn('relative', hasChordLane ? 'pt-5' : 'pt-1')}>
        <div
          className={cn(
            isTranslation ? COMPOSE_TRANSLATION_TEXT : COMPOSE_MONO_TEXT,
            'pointer-events-none absolute inset-x-0 top-0 h-5',
          )}
        >
          {effectivePreviewSymbol && previewPosition != null ? (
            <span
              className={cn(
                COMPOSE_CHORD_TEXT,
                'absolute top-0 flex h-5 items-center opacity-70',
              )}
              style={{ left: chordLeftCss(previewPosition) }}
            >
              {effectivePreviewSymbol}
            </span>
          ) : null}
          {trackChords
            .filter((chord) => chord.symbol.trim())
            .map((chord) => (
            <div
              key={`${chord.id}-${trackIndex}`}
              className="pointer-events-auto"
              data-compose-placed-chord
              data-chord-id={chord.id}
            >
              <PlacedChordChip
                lineId={line.id}
                trackIndex={trackIndex}
                chord={chord}
                textLength={text.length}
                displayPosition={chord.position}
                readOnly={readOnly}
                eraserHover={chordMode?.eraserHoverChordId === chord.id}
                eraserModeActive={eraserModeTrackActive}
                simplifyHover={chordMode?.simplifyHoverChordId === chord.id}
                simplifyModeActive={simplifyModeTrackActive}
                onRemove={() => onRemoveChord(chord.id)}
                onUpdateSymbol={(symbol) => onUpdateChordSymbol(chord.id, symbol)}
                onUpdateDuration={(durationMillis) => onUpdateChordDuration(chord.id, durationMillis)}
              />
            </div>
          ))}
        </div>

        <ComposeLyricField
          text={text}
          readOnly={readOnly}
          charHighlights={charHighlights}
          inputRef={textRef}
          mirrorRef={mirrorRef}
          placeholder={placeholder}
          title={readOnly || isTranslation ? undefined : placeholder}
          ariaLabel={ariaLabel}
          tone={isTranslation ? 'translation' : 'primary'}
          onKeyDown={onKeyDown ?? (() => undefined)}
          onChange={(e) => onTextChange(e.target.value)}
          onPaste={onPaste}
        />
        </div>
      </div>

      {translationChordMismatch ? (
        <p className="px-3 pb-1 text-xs text-[var(--color-danger)]" role="status">
          {t('songs.editor.compose.translationChordMismatch')}
        </p>
      ) : null}
    </div>
  )
}

function ComposeChordEditPopover({
  chord,
  readOnly,
  dragHandleProps,
  onRemove,
  onUpdateSymbol,
  onUpdateDuration,
}: {
  chord: ComposeChord
  readOnly: boolean
  dragHandleProps?: React.ComponentProps<'button'>
  onRemove: () => void
  onUpdateSymbol: (symbol: string) => void
  onUpdateDuration: (durationMillis: number | null) => void
}) {
  const { t } = useTranslation()
  const [symbolDraftState, setSymbolDraftState] = useState<{ chordId: string; value: string } | null>(
    null,
  )
  const [durationDraftState, setDurationDraftState] = useState<{ chordId: string; value: string } | null>(
    null,
  )
  const symbolDraft =
    symbolDraftState?.chordId === chord.id ? symbolDraftState.value : chord.symbol
  const durationDraft =
    durationDraftState?.chordId === chord.id
      ? durationDraftState.value
      : chord.durationMillis
        ? formatComposeChordDurationBeats(chord.durationMillis)
        : ''
  const label = composeChordDisplayLabel(chord)

  function commitSymbolDraft() {
    const trimmed = symbolDraft.trim()
    if (!trimmed) {
      onRemove()
    } else {
      onUpdateSymbol(trimmed)
    }
    setSymbolDraftState(null)
  }

  function commitDurationDraft() {
    onUpdateDuration(parseComposeChordDurationBeats(durationDraft))
    setDurationDraftState(null)
  }

  if (readOnly) {
    const symbol = chord.symbol.trim()
    if (!symbol) return null
    return <span className={COMPOSE_CHORD_TEXT}>{symbol}</span>
  }

  const symbol = chord.symbol.trim()
  if (!symbol) return null

  return (
    <PopoverRoot>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            COMPOSE_CHORD_TEXT,
            dragHandleProps ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer',
          )}
          aria-label={t('songs.editor.compose.editChordAria', { chord: label })}
          {...dragHandleProps}
        >
          {symbol}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="grid gap-2 p-3">
        <label className="grid gap-1 text-sm">
          <span>{t('songs.editor.compose.chordSymbolLabel')}</span>
          <Input
            value={symbolDraft}
            placeholder={t('songs.editor.compose.chordSymbolPlaceholder')}
            aria-label={t('songs.editor.compose.chordSymbolLabel')}
            onChange={(e) => setSymbolDraftState({ chordId: chord.id, value: e.target.value })}
            onBlur={commitSymbolDraft}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                commitSymbolDraft()
              }
            }}
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span>{t('songs.editor.compose.chordDurationLabel')}</span>
          <Input
            value={durationDraft}
            inputMode="decimal"
            placeholder={t('songs.editor.compose.chordDurationPlaceholder')}
            aria-label={t('songs.editor.compose.chordDurationLabel')}
            onChange={(e) => setDurationDraftState({ chordId: chord.id, value: e.target.value })}
            onBlur={commitDurationDraft}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                commitDurationDraft()
              }
            }}
          />
        </label>
        <Button type="button" variant="outline" size="sm" onClick={onRemove}>
          <TrashIcon size={14} />
          {t('songs.editor.compose.removeChord')}
        </Button>
      </PopoverContent>
    </PopoverRoot>
  )
}

function PlacedChordChip({
  lineId,
  trackIndex,
  chord,
  textLength,
  displayPosition,
  readOnly,
  eraserHover = false,
  eraserModeActive = false,
  simplifyHover = false,
  simplifyModeActive = false,
  onRemove,
  onUpdateSymbol,
  onUpdateDuration,
}: {
  lineId: string
  trackIndex: number
  chord: ComposeChord
  textLength: number
  displayPosition: number
  readOnly: boolean
  eraserHover?: boolean
  eraserModeActive?: boolean
  simplifyHover?: boolean
  simplifyModeActive?: boolean
  onRemove: () => void
  onUpdateSymbol: (symbol: string) => void
  onUpdateDuration: (durationMillis: number | null) => void
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: lineChordDragId(lineId, chord.id),
    data: { type: 'line-chord', lineId, chordId: chord.id, trackIndex } satisfies LineChordDragData,
    disabled: readOnly || eraserModeActive || simplifyModeActive,
  })

  const { activeChordId, duplicateSourceId } = useContext(ComposeLineChordDragContext)
  const isActiveDrag = isDragging && activeChordId === chord.id
  const isDuplicateSource = isActiveDrag && duplicateSourceId === chord.id
  const hideWhileDragging = isActiveDrag && !isDuplicateSource
  const position = clampChordPosition(displayPosition, textLength)
  const label = composeChordDisplayLabel(chord)

  return (
    <div
      ref={setNodeRef}
      style={{
        left: chordLeftCss(position),
        transform:
          hideWhileDragging || isDuplicateSource
            ? undefined
            : transform
              ? `translate3d(${transform.x}px, 0, 0)`
              : undefined,
        zIndex: isActiveDrag && !hideWhileDragging && !isDuplicateSource ? 20 : 1,
      }}
      className={cn(
        'absolute top-0 flex h-5 items-center leading-5',
        hideWhileDragging && 'opacity-0',
        isActiveDrag && !isDuplicateSource && !hideWhileDragging && 'opacity-90',
        eraserHover && 'rounded-sm bg-[var(--color-danger)]/20 ring-1 ring-[var(--color-danger)]',
        simplifyHover && 'rounded-sm bg-[var(--color-danger)]/20 ring-1 ring-[var(--color-danger)]',
      )}
    >
      {readOnly || eraserModeActive || simplifyModeActive ? (
        <span
          className={cn(
            COMPOSE_CHORD_TEXT,
            (eraserModeActive || simplifyModeActive) && 'opacity-80',
          )}
        >
          {label}
        </span>
      ) : (
        <ComposeChordEditPopover
          chord={chord}
          readOnly={readOnly}
          dragHandleProps={{ ...listeners, ...attributes }}
          onRemove={onRemove}
          onUpdateSymbol={onUpdateSymbol}
          onUpdateDuration={onUpdateDuration}
        />
      )}
    </div>
  )
}

function ComposeBarBeatGrid({
  timeSignature,
  measureCount,
}: {
  timeSignature: string
  measureCount: number
}) {
  const beatsPerMeasure = beatsPerMeasureFromTimeSignature(timeSignature) ?? 4

  return (
    <div
      className="pointer-events-none absolute inset-0 grid rounded-sm border border-[var(--color-border)]/60 bg-[var(--color-muted)]/10"
      style={{ gridTemplateColumns: `repeat(${measureCount}, minmax(0, 1fr))` }}
      aria-hidden
    >
      {Array.from({ length: measureCount }, (_, barIndex) => (
        <div
          key={barIndex}
          className={cn('relative h-full', barIndex > 0 && 'border-l border-[var(--color-border)]')}
        >
          <div
            className="absolute inset-0 grid"
            style={{ gridTemplateColumns: `repeat(${beatsPerMeasure}, minmax(0, 1fr))` }}
          >
            {Array.from({ length: beatsPerMeasure }, (_, beatIndex) => (
              <div
                key={beatIndex}
                className={cn(
                  'relative h-full',
                  beatIndex > 0 && 'border-l border-[var(--color-border)]/35',
                )}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function ComposeBarChordSegment({
  lineId,
  chord,
  layout,
  readOnly,
  showBeats,
  beatMillis,
  chordModeActive = false,
  eraserHover = false,
  eraserModeActive = false,
  simplifyHover = false,
  simplifyModeActive = false,
  onRemove,
  onUpdateSymbol,
  onUpdateDuration,
}: {
  lineId: string
  chord: ComposeChord
  layout: { offsetPercent: number; widthPercent: number }
  readOnly: boolean
  showBeats?: boolean
  beatMillis: number
  chordModeActive?: boolean
  eraserHover?: boolean
  eraserModeActive?: boolean
  simplifyHover?: boolean
  simplifyModeActive?: boolean
  onRemove: () => void
  onUpdateSymbol: (symbol: string) => void
  onUpdateDuration: (durationMillis: number | null) => void
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: lineChordDragId(lineId, chord.id),
    data: { type: 'line-chord', lineId, chordId: chord.id, trackIndex: 0 } satisfies LineChordDragData,
    disabled: readOnly || chordModeActive || eraserModeActive || simplifyModeActive,
  })
  const { activeChordId, duplicateSourceId } = useContext(ComposeLineChordDragContext)
  const isActiveDrag = isDragging && activeChordId === chord.id
  const isDuplicateSource = isActiveDrag && duplicateSourceId === chord.id
  const hideWhileDragging = isActiveDrag && !isDuplicateSource
  const symbol = chord.symbol.trim()
  const beatsLabel = formatComposeChordDurationBeats(beatMillis)

  if (!symbol) return null

  return (
    <div
      ref={setNodeRef}
      data-compose-bar-chord
      data-chord-id={chord.id}
      {...(!readOnly && !showBeats && !chordModeActive && !eraserModeActive && !simplifyModeActive
        ? { ...listeners, ...attributes }
        : {})}
      style={{
        left: `${layout.offsetPercent}%`,
        width: `${layout.widthPercent}%`,
        transform:
          hideWhileDragging || isDuplicateSource
            ? undefined
            : transform
              ? `translate3d(${transform.x}px, ${transform.y}px, 0)`
              : undefined,
        zIndex: isActiveDrag && !hideWhileDragging && !isDuplicateSource ? 20 : 1,
      }}
      className={cn(
        'absolute inset-y-0 flex min-w-0 items-center justify-center overflow-hidden rounded-sm border border-[var(--color-primary)]/35 bg-[var(--color-primary)]/10 px-1',
        !readOnly &&
          !showBeats &&
          !chordModeActive &&
          !eraserModeActive &&
          !simplifyModeActive &&
          'cursor-grab touch-none active:cursor-grabbing',
        hideWhileDragging && 'opacity-0',
        isActiveDrag && !isDuplicateSource && !hideWhileDragging && 'opacity-90 shadow-sm',
        eraserHover && 'ring-1 ring-[var(--color-danger)]',
        simplifyHover && 'ring-1 ring-[var(--color-danger)]',
      )}
    >
      {showBeats ? (
        <div className="flex flex-col items-center leading-none">
          <span className={COMPOSE_CHORD_TEXT}>{symbol}</span>
          <span className="mt-0.5 text-[10px] tabular-nums text-[var(--color-muted-foreground)]">
            {beatsLabel}
          </span>
        </div>
      ) : readOnly || chordModeActive || eraserModeActive || simplifyModeActive ? (
        <span
          className={cn(
            COMPOSE_CHORD_TEXT,
            (eraserModeActive || simplifyModeActive) && 'opacity-80',
          )}
        >
          {symbol}
        </span>
      ) : (
        <ComposeChordEditPopover
          chord={chord}
          readOnly={readOnly}
          onRemove={onRemove}
          onUpdateSymbol={onUpdateSymbol}
          onUpdateDuration={onUpdateDuration}
        />
      )}
    </div>
  )
}

function ComposeBarInsertPreviewSegment({
  layout,
  symbol,
  interactive = false,
}: {
  layout: { offsetPercent: number; widthPercent: number }
  symbol: string
  interactive?: boolean
}) {
  return (
    <div
      aria-hidden
      data-compose-bar-insert-preview
      style={{
        left: `${layout.offsetPercent}%`,
        width: `${layout.widthPercent}%`,
      }}
      className={cn(
        'absolute inset-y-0 z-10 flex min-w-0 items-center justify-center overflow-hidden rounded-sm border border-dashed border-[var(--color-primary)]/55 bg-[var(--color-primary)]/10 px-1',
        interactive ? 'pointer-events-auto cursor-crosshair' : 'pointer-events-none',
      )}
    >
      <span className={cn(COMPOSE_CHORD_TEXT, 'opacity-80')}>{symbol}</span>
    </div>
  )
}

function previewLayoutIndexForTimelineChord(timelineIndex: number, insertIndex: number): number {
  return timelineIndex >= insertIndex ? timelineIndex + 1 : timelineIndex
}

function ComposeBarBoundaryHandle({
  leftPercent,
  ariaLabel,
  onPointerDown,
}: {
  leftPercent: number
  ariaLabel: string
  onPointerDown: (event: React.PointerEvent<HTMLButtonElement>) => void
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      className={cn(
        'bar-boundary absolute inset-y-0 z-30 w-3 -translate-x-1/2 cursor-col-resize touch-none',
        'opacity-0 transition-opacity group-hover/bar:opacity-100 focus-visible:opacity-100',
        'before:absolute before:inset-y-1 before:left-1/2 before:w-0.5 before:-translate-x-1/2 before:rounded-full before:bg-[var(--color-primary)]',
      )}
      style={{ left: `${leftPercent}%` }}
      onPointerDown={onPointerDown}
    />
  )
}

function ComposeLineAfterDropZone({
  lineId,
  readOnly,
  isActive,
  previewChordSymbol,
  expanded,
}: {
  lineId: string
  readOnly: boolean
  isActive: boolean
  previewChordSymbol: string | null
  expanded: boolean
}) {
  const { t } = useTranslation()
  const { setNodeRef, isOver } = useDroppable({
    id: lineAfterDragId(lineId),
    data: { type: 'line-after', lineId } satisfies LineAfterDropData,
    disabled: readOnly,
  })

  if (readOnly) return null

  const highlighted = isActive || isOver

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'flex items-center justify-center border-t border-transparent transition-all',
        expanded ? 'min-h-5 py-1' : 'min-h-1',
        highlighted && 'border-[var(--color-primary)]/25 bg-[var(--color-primary)]/5',
      )}
      aria-label={t('songs.editor.compose.lineAfterDropAria')}
    >
      {highlighted ? (
        previewChordSymbol ? (
          <span className={cn(COMPOSE_CHORD_TEXT, 'opacity-70')}>{previewChordSymbol}</span>
        ) : (
          <span className="h-0.5 w-full max-w-[8rem] rounded-full bg-[var(--color-primary)]/40" />
        )
      ) : null}
    </div>
  )
}

function ComposeChordBarRow({
  line,
  readOnly,
  timeSignature,
  isDropTarget,
  highlightInsertIndex,
  previewChordSymbol,
  onChange,
  onRemove,
  registerMeasure,
  registerBarContainer,
}: {
  line: ComposeLine
  readOnly: boolean
  timeSignature: string
  isDropTarget?: boolean
  highlightInsertIndex?: number | null
  previewChordSymbol?: string | null
  onChange: (line: ComposeLine) => void
  onRemove: () => void
  registerMeasure: (measureKey: string, measure: LineMeasureFn | null) => void
  registerBarContainer: (measureKey: string, element: HTMLDivElement | null) => void
}) {
  const { t } = useTranslation()
  const chordMode = useContext(ComposeChordModeContext)
  const barRef = useRef<HTMLDivElement>(null)
  const chordBarPlacePointerRef = useRef<number | null>(null)
  const setBarContainerRef = useCallback(
    (node: HTMLDivElement | null) => {
      barRef.current = node
      registerBarContainer(lineMeasureKey(line.id, 0), node)
    },
    [line.id, registerBarContainer],
  )
  const barPointerMillisRef = useRef(0)
  const timelineChords = useMemo(() => sortedComposeLineChords(line), [line])
  const sortedChords = useMemo(
    () => timelineChords.filter((chord) => isComposeBarDisplayChord(chord)),
    [timelineChords],
  )
  const [resizeState, setResizeState] = useState<{
    chordId: string
    startX: number
    initialWeight: number
    gridMillis: number
    measureCount: number
  } | null>(null)
  const [resizePreview, setResizePreview] = useState<Record<string, number> | null>(null)

  const baseWeights = useMemo(
    () => composeBarWeightsFromChords(timelineChords, timeSignature),
    [timelineChords, timeSignature],
  )
  const displayWeights = useMemo(
    () => composeBarWeightsFromChords(timelineChords, timeSignature, resizePreview ?? undefined),
    [resizePreview, timelineChords, timeSignature],
  )
  const barTotalWeight = useMemo(() => composeBarTotalWeight(displayWeights), [displayWeights])
  const resizeGridMillis = resizeState?.gridMillis
  const segmentLayout = useMemo(
    () => composeBarSegmentLayout(displayWeights, timeSignature, resizeGridMillis),
    [displayWeights, resizeGridMillis, timeSignature],
  )
  const measureCount = useMemo(
    () =>
      resizeState?.measureCount ??
      composeChordBarDisplayMeasureCount(barTotalWeight, timeSignature),
    [barTotalWeight, resizeState?.measureCount, timeSignature],
  )
  const gridMillis = useMemo(
    () =>
      resizeState?.gridMillis ?? composeChordBarDisplayGridMillis(barTotalWeight, timeSignature),
    [barTotalWeight, resizeState?.gridMillis, timeSignature],
  )
  const measureMismatch = useMemo(
    () => composeChordOnlyLineMeasureMismatch(line, timeSignature),
    [line, timeSignature],
  )

  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: lineDragId(line.id, 0),
    data: { type: 'line', lineId: line.id, trackIndex: 0 } satisfies LineDropData,
    disabled: readOnly,
  })

  useEffect(() => {
    const measure: LineMeasureFn = (clientX) => {
      const bar = barRef.current
      if (!bar) return 0
      const rect = bar.getBoundingClientRect()
      if (rect.width <= 0) return 0
      const displayGridMillis = composeChordBarDisplayGridMillis(barTotalWeight, timeSignature)
      const relativeX = Math.max(0, Math.min(rect.width, clientX - rect.left))
      barPointerMillisRef.current = snapComposeBarDurationMillis(
        (relativeX / rect.width) * displayGridMillis,
      )
      return positionFromBarPointer(
        clientX,
        rect.left,
        rect.width,
        timelineChords.length,
        displayWeights,
        timeSignature,
      )
    }
    registerMeasure(lineMeasureKey(line.id, 0), measure)
    return () => registerMeasure(lineMeasureKey(line.id, 0), null)
  }, [barTotalWeight, displayWeights, line.id, registerMeasure, timelineChords.length, timeSignature])

  const updateLine = useCallback(
    (patch: Partial<ComposeLine>) => {
      onChange({ ...line, ...patch })
    },
    [line, onChange],
  )

  useEffect(() => {
    if (!resizeState) return

    function onPointerMove(event: PointerEvent) {
      const bar = barRef.current
      if (!bar || !resizeState) return
      const rect = bar.getBoundingClientRect()
      if (rect.width <= 0 || baseWeights.length === 0 || gridMillis <= 0) return

      const deltaMillis =
        ((event.clientX - resizeState.startX) / rect.width) * resizeState.gridMillis
      const nextDuration = resizeComposeBarDuration(resizeState.initialWeight, deltaMillis)

      setResizePreview({
        [resizeState.chordId]: nextDuration,
      })
    }

    function onPointerUp() {
      setResizePreview((preview) => {
        if (preview) {
          onChange({
            ...line,
            chords: line.chords.map((chord) => {
              const nextDuration = preview[chord.id]
              return nextDuration != null ? { ...chord, durationMillis: nextDuration } : chord
            }),
          })
        }
        return null
      })
      setResizeState(null)
    }

    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
    return () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
    }
  }, [baseWeights, gridMillis, line, onChange, resizeState])

  const removeChord = useCallback(
    (chordId: string) => {
      const nextChords = sortedComposeLineChords(line).filter((chord) => chord.id !== chordId)
      if (nextChords.length === 0) {
        updateLine({ text: '', chords: [], chordBar: undefined })
        return
      }
      onChange(normalizeChordOnlyLine(line, nextChords))
    },
    [line, onChange, updateLine],
  )

  const updateChordSymbol = useCallback(
    (chordId: string, symbol: string) => {
      if (!symbol.trim()) {
        removeChord(chordId)
        return
      }
      updateLine({
        chords: line.chords.map((chord) => (chord.id === chordId ? { ...chord, symbol } : chord)),
      })
    },
    [line.chords, removeChord, updateLine],
  )

  const updateChordDuration = useCallback(
    (chordId: string, durationMillis: number | null) => {
      updateLine({
        chords: line.chords.map((chord) =>
          chord.id === chordId ? { ...chord, durationMillis } : chord,
        ),
      })
    },
    [line.chords, updateLine],
  )

  const chordModeTrackActive =
    Boolean(chordMode?.enabled) && !readOnly && resizeState == null
  const eraserModeTrackActive =
    Boolean(chordMode?.eraserEnabled) && !readOnly && resizeState == null
  const simplifyModeTrackActive =
    Boolean(chordMode?.simplifyEnabled) && !readOnly && resizeState == null
  const composeInteractionTrackActive =
    chordModeTrackActive || eraserModeTrackActive || simplifyModeTrackActive

  const chordModeHover =
    chordModeTrackActive &&
    chordMode?.hover?.lineId === line.id &&
    chordMode.hover.trackIndex === 0
      ? chordMode.hover
      : null

  const effectiveInsertIndex = highlightInsertIndex ?? chordModeHover?.charIndex ?? null
  const effectivePreviewSymbol =
    chordModeTrackActive && chordMode?.selectedSymbol && chordModeHover
      ? chordMode.selectedSymbol
      : previewChordSymbol

  const dropActive = isDropTarget || isOver
  const showInsertMarker =
    effectiveInsertIndex != null &&
    effectivePreviewSymbol &&
    effectiveInsertIndex >= 0 &&
    effectiveInsertIndex <= timelineChords.length

  const insertPreviewLayout = useMemo(() => {
    if (!showInsertMarker || effectiveInsertIndex == null || resizeState) return null
    return composeBarInsertPreviewSegmentLayout(
      displayWeights,
      effectiveInsertIndex,
      timeSignature,
    )
  }, [displayWeights, effectiveInsertIndex, resizeState, showInsertMarker, timeSignature])

  function barInsertIndexFromPointer(clientX: number): number {
    const bar = barRef.current
    if (!bar) return 0
    const rect = bar.getBoundingClientRect()
    if (rect.width <= 0) return 0
    const displayGridMillis = composeChordBarDisplayGridMillis(barTotalWeight, timeSignature)
    const relativeX = Math.max(0, Math.min(rect.width, clientX - rect.left))
    barPointerMillisRef.current = snapComposeBarDurationMillis(
      (relativeX / rect.width) * displayGridMillis,
    )
    return positionFromBarPointer(
      clientX,
      rect.left,
      rect.width,
      timelineChords.length,
      displayWeights,
      timeSignature,
    )
  }

  function updateChordModeHover(clientX: number) {
    if (!chordModeTrackActive || !chordMode) return
    const insertIndex = barInsertIndexFromPointer(clientX)
    const current = chordMode.hover
    if (
      current?.lineId === line.id &&
      current.trackIndex === 0 &&
      current.charIndex === insertIndex
    ) {
      return
    }
    chordMode.setHover({ lineId: line.id, trackIndex: 0, charIndex: insertIndex })
  }

  function clearChordModeHover() {
    if (!chordMode) return
    const current = chordMode.hover
    if (current?.lineId === line.id && current.trackIndex === 0) {
      chordMode.setHover(null)
    }
  }

  function updatePlacedChordHover(clientX: number, clientY: number) {
    if (!chordMode) return
    const target = document.elementFromPoint(clientX, clientY)
    const placedChordEl = target?.closest('[data-compose-bar-chord]')
    const chordId = placedChordEl?.getAttribute('data-chord-id') ?? null
    if (eraserModeTrackActive) {
      if (chordMode.eraserHoverChordId !== chordId) {
        chordMode.setEraserHoverChordId(chordId)
      }
      return
    }
    if (simplifyModeTrackActive) {
      if (chordMode.simplifyHoverChordId !== chordId) {
        chordMode.setSimplifyHoverChordId(chordId)
      }
    }
  }

  function clearEraserHover() {
    if (!chordMode) return
    if (chordMode.eraserHoverChordId) {
      chordMode.setEraserHoverChordId(null)
    }
  }

  function clearSimplifyHover() {
    if (!chordMode) return
    if (chordMode.simplifyHoverChordId) {
      chordMode.setSimplifyHoverChordId(null)
    }
  }

  function handleComposeInteractionPointerMove(event: React.PointerEvent<HTMLElement>) {
    if (chordModeTrackActive) {
      updateChordModeHover(event.clientX)
      return
    }
    if (eraserModeTrackActive || simplifyModeTrackActive) {
      updatePlacedChordHover(event.clientX, event.clientY)
    }
  }

  function clearComposeInteractionHover() {
    if (chordModeTrackActive) {
      chordBarPlacePointerRef.current = null
      clearChordModeHover()
      return
    }
    if (eraserModeTrackActive) {
      clearEraserHover()
      return
    }
    if (simplifyModeTrackActive) {
      clearSimplifyHover()
    }
  }

  function resolveBarInsertIndex(clientX: number): number {
    const hover = chordMode?.hover
    if (hover?.lineId === line.id && hover.trackIndex === 0) {
      return hover.charIndex
    }
    return barInsertIndexFromPointer(clientX)
  }

  function placeChordAtBarInsertIndex(clientX: number) {
    if (!chordMode?.selectedSymbol) return
    chordMode.placeAt(line.id, 0, resolveBarInsertIndex(clientX))
  }

  function handleChordModePointerDown(event: React.PointerEvent<HTMLElement>) {
    if (!chordModeTrackActive || !chordMode?.selectedSymbol) return
    if (
      event.target instanceof Element &&
      event.target.closest('[data-compose-bar-chord]') &&
      !event.target.closest('[data-compose-bar-insert-preview]')
    ) {
      return
    }
    if (event.target instanceof Element && event.target.closest('[data-compose-bar-insert-preview]')) {
      event.preventDefault()
      event.stopPropagation()
      placeChordAtBarInsertIndex(event.clientX)
      return
    }
    event.preventDefault()
    chordBarPlacePointerRef.current = event.pointerId
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function handleChordModePointerUp(event: React.PointerEvent<HTMLElement>) {
    if (!chordModeTrackActive || !chordMode?.selectedSymbol) return
    if (chordBarPlacePointerRef.current !== event.pointerId) return
    chordBarPlacePointerRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    if (
      event.target instanceof Element &&
      event.target.closest('[data-compose-bar-chord]') &&
      !event.target.closest('[data-compose-bar-insert-preview]')
    ) {
      return
    }
    event.preventDefault()
    placeChordAtBarInsertIndex(event.clientX)
  }

  function cancelChordBarPlacePointer(event: React.PointerEvent<HTMLElement>) {
    if (chordBarPlacePointerRef.current === event.pointerId) {
      chordBarPlacePointerRef.current = null
    }
  }

  function handleEraserPointerDown(event: React.PointerEvent<HTMLElement>) {
    if (!eraserModeTrackActive || !chordMode) return
    event.preventDefault()
    const placedChordEl =
      event.target instanceof Element ? event.target.closest('[data-compose-bar-chord]') : null
    if (placedChordEl) {
      const chordId = placedChordEl.getAttribute('data-chord-id')
      if (chordId) {
        chordMode.eraseChord(line.id, 0, chordId)
      }
    }
  }

  function handleSimplifyPointerDown(event: React.PointerEvent<HTMLElement>) {
    if (!simplifyModeTrackActive || !chordMode) return
    event.preventDefault()
    const placedChordEl =
      event.target instanceof Element ? event.target.closest('[data-compose-bar-chord]') : null
    if (placedChordEl) {
      const chordId = placedChordEl.getAttribute('data-chord-id')
      if (chordId) {
        chordMode.simplifyChord(line.id, 0, chordId)
      }
    }
  }

  function handleComposeInteractionPointerDown(event: React.PointerEvent<HTMLElement>) {
    if (chordModeTrackActive) {
      handleChordModePointerDown(event)
      return
    }
    if (eraserModeTrackActive) {
      handleEraserPointerDown(event)
      return
    }
    if (simplifyModeTrackActive) {
      handleSimplifyPointerDown(event)
    }
  }

  function startChordResize(
    chordId: string,
    initialWeight: number,
    event: React.PointerEvent<HTMLButtonElement>,
  ) {
    event.preventDefault()
    event.stopPropagation()

    setResizePreview(null)
    const totalWeight = composeBarTotalWeight(baseWeights)
    setResizeState({
      chordId,
      startX: event.clientX,
      initialWeight,
      gridMillis: composeChordBarDisplayGridMillis(totalWeight, timeSignature),
      measureCount: composeChordBarDisplayMeasureCount(totalWeight, timeSignature),
    })
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function startBoundaryResize(boundaryIndex: number, event: React.PointerEvent<HTMLButtonElement>) {
    const left = sortedChords[boundaryIndex]
    if (!left) return
    startChordResize(left.id, composeChordBarWeight(left.durationMillis, timeSignature), event)
  }

  function startTrailingResize(event: React.PointerEvent<HTMLButtonElement>) {
    const last = sortedChords.at(-1)
    if (!last) return
    startChordResize(last.id, composeChordBarWeight(last.durationMillis, timeSignature), event)
  }

  const trailingBoundaryPercent = useMemo(() => {
    const lastChord = sortedChords.at(-1)
    if (!lastChord) return 0
    const timelineIndex = timelineChords.findIndex((entry) => entry.id === lastChord.id)
    if (timelineIndex < 0) return 0
    return composeBarBoundaryPercent(displayWeights, timelineIndex, timeSignature, resizeGridMillis)
  }, [displayWeights, resizeGridMillis, sortedChords, timelineChords, timeSignature])

  return (
    <div className="grid">
      <div
        ref={setDropRef}
        className={cn(
          'group/bar flex items-stretch transition-colors',
          'min-h-10',
          dropActive && 'bg-[var(--color-primary)]/5',
          resizeState && 'select-none [&_.bar-boundary]:opacity-100',
          measureMismatch && 'bg-[var(--color-danger)]/5',
        )}
      >
        <div className="relative min-w-0 flex-1 px-3 py-1.5">
          <div
            ref={setBarContainerRef}
            className={cn(
              'relative w-full max-w-full',
              resizeState ? 'h-10' : 'h-8',
              chordModeTrackActive && 'cursor-crosshair',
              eraserModeTrackActive && 'cursor-pointer',
              simplifyModeTrackActive && 'cursor-pointer',
            )}
            aria-label={t('songs.editor.compose.chordBarAria')}
            onPointerMove={
              composeInteractionTrackActive ? handleComposeInteractionPointerMove : undefined
            }
            onPointerLeave={
              composeInteractionTrackActive
                ? (event) => {
                    cancelChordBarPlacePointer(event)
                    clearComposeInteractionHover()
                  }
                : undefined
            }
            onPointerDownCapture={
              composeInteractionTrackActive ? handleComposeInteractionPointerDown : undefined
            }
            onPointerUpCapture={
              chordModeTrackActive ? handleChordModePointerUp : undefined
            }
          >
            <ComposeBarBeatGrid timeSignature={timeSignature} measureCount={measureCount} />
            {timelineChords.map((chord, index) => {
              if (!isComposeBarDisplayChord(chord)) return null
              const layout =
                insertPreviewLayout && effectiveInsertIndex != null
                  ? insertPreviewLayout.layouts[
                      previewLayoutIndexForTimelineChord(index, effectiveInsertIndex)
                    ]
                  : segmentLayout[index]
              if (!layout) return null
              return (
                <ComposeBarChordSegment
                  key={chord.id}
                  lineId={line.id}
                  chord={chord}
                  layout={layout}
                  readOnly={readOnly || resizeState != null}
                  showBeats={resizeState != null}
                  beatMillis={displayWeights[index] ?? composeDefaultBarDurationMillis(timeSignature)}
                  chordModeActive={chordModeTrackActive}
                  eraserHover={chordMode?.eraserHoverChordId === chord.id}
                  eraserModeActive={eraserModeTrackActive}
                  simplifyHover={chordMode?.simplifyHoverChordId === chord.id}
                  simplifyModeActive={simplifyModeTrackActive}
                  onRemove={() => removeChord(chord.id)}
                  onUpdateSymbol={(symbol) => updateChordSymbol(chord.id, symbol)}
                  onUpdateDuration={(durationMillis) => updateChordDuration(chord.id, durationMillis)}
                />
              )
            })}
            {!readOnly && sortedChords.length > 1
              ? sortedChords.slice(0, -1).map((chord) => {
                  const timelineIndex = timelineChords.findIndex((entry) => entry.id === chord.id)
                  if (timelineIndex < 0) return null
                  return (
                  <ComposeBarBoundaryHandle
                    key={`boundary-${chord.id}-${timelineChords[timelineIndex + 1]?.id ?? timelineIndex}`}
                    leftPercent={composeBarBoundaryPercent(
                      displayWeights,
                      timelineIndex,
                      timeSignature,
                      resizeGridMillis,
                    )}
                    ariaLabel={t('songs.editor.compose.chordBarResizeAria')}
                    onPointerDown={(event) => {
                      const boundaryIndex = sortedChords.findIndex((entry) => entry.id === chord.id)
                      if (boundaryIndex >= 0) startBoundaryResize(boundaryIndex, event)
                    }}
                  />
                  )
                })
              : null}
            {!readOnly && sortedChords.length > 0 ? (
              <ComposeBarBoundaryHandle
                key={`boundary-trailing-${sortedChords.at(-1)?.id ?? 'last'}`}
                leftPercent={trailingBoundaryPercent}
                ariaLabel={t('songs.editor.compose.chordBarTrailingResizeAria')}
                onPointerDown={startTrailingResize}
              />
            ) : null}
            {showInsertMarker && insertPreviewLayout && effectivePreviewSymbol ? (
              <ComposeBarInsertPreviewSegment
                layout={insertPreviewLayout.layouts[insertPreviewLayout.previewIndex]!}
                symbol={effectivePreviewSymbol}
                interactive={chordModeTrackActive}
              />
            ) : null}
          </div>
        </div>

        {!readOnly ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8 shrink-0 opacity-0 transition-opacity group-hover/bar:opacity-100 group-focus-within/bar:opacity-100"
            aria-label={t('songs.editor.compose.removeLineAria')}
            onClick={onRemove}
          >
            <TrashIcon size={14} />
          </Button>
        ) : null}
      </div>

      {measureMismatch ? (
        <p className="px-3 pb-1.5 text-xs text-[var(--color-danger)]" role="status">
          {t('songs.editor.compose.chordBarMeasureMismatch', measureMismatch)}
        </p>
      ) : null}
    </div>
  )
}

function ComposeLineRow({
  line,
  readOnly,
  autoFocus,
  timeSignature,
  activeDropLineId,
  activeDropTrackIndex,
  highlightCharIndex,
  previewChordSymbol,
  translationLanguages,
  onChange,
  onRemove,
  onInsertLineAfter,
  onReplaceLineWithLines,
  registerMeasure,
}: {
  line: ComposeLine
  readOnly: boolean
  autoFocus?: boolean
  timeSignature: string
  activeDropLineId: string | null
  activeDropTrackIndex: number | null
  highlightCharIndex: number | null
  previewChordSymbol: string | null
  translationLanguages: string[]
  onChange: (line: ComposeLine) => void
  onRemove: () => void
  onInsertLineAfter: (currentLine: ComposeLine, newLine: ComposeLine) => void
  onReplaceLineWithLines: (lines: ComposeLine[], focusLineId: string) => void
  registerMeasure: (measureKey: string, measure: LineMeasureFn | null) => void
}) {
  const { t } = useTranslation()

  const updateLine = useCallback(
    (patch: Partial<ComposeLine>) => {
      onChange({ ...line, ...patch })
    },
    [line, onChange],
  )

  const removeChord = useCallback(
    (trackIndex: number, chordId: string) => {
      const trackChords = composeLineChordsForTrack(line, trackIndex).filter((chord) => chord.id !== chordId)
      updateLine(updateComposeLineChordsForTrack(line, trackIndex, trackChords))
    },
    [line, updateLine],
  )

  const updateChordSymbol = useCallback(
    (trackIndex: number, chordId: string, symbol: string) => {
      if (!symbol.trim()) {
        removeChord(trackIndex, chordId)
        return
      }
      const trackChords = composeLineChordsForTrack(line, trackIndex).map((chord) =>
        chord.id === chordId ? { ...chord, symbol } : chord,
      )
      updateLine(updateComposeLineChordsForTrack(line, trackIndex, trackChords))
    },
    [line, removeChord, updateLine],
  )

  const updateChordDuration = useCallback(
    (trackIndex: number, chordId: string, durationMillis: number | null) => {
      const trackChords = composeLineChordsForTrack(line, trackIndex).map((chord) =>
        chord.id === chordId ? { ...chord, durationMillis } : chord,
      )
      updateLine(updateComposeLineChordsForTrack(line, trackIndex, trackChords))
    },
    [line, updateLine],
  )

  function splitLineAt(caret: number) {
    const { currentLine, newLine } = splitComposeLineAtIndex(line, caret)
    onInsertLineAfter(currentLine, newLine)
  }

  function onPrimaryKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (readOnly || e.key !== 'Enter') return
    e.preventDefault()
    splitLineAt(e.currentTarget.selectionStart ?? line.text.length)
  }

  function onTranslationKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (readOnly || e.key !== 'Enter') return
    e.preventDefault()
    splitLineAt(e.currentTarget.selectionStart ?? e.currentTarget.value.length)
  }

  function onTrackPaste(trackIndex: number) {
    return (event: React.ClipboardEvent<HTMLInputElement>) => {
      if (readOnly) return
      const pastedText = event.clipboardData.getData('text/plain')
      if (!splitPasteIntoLineSegments(pastedText)) return

      event.preventDefault()
      const selectionStart = event.currentTarget.selectionStart ?? 0
      const selectionEnd = event.currentTarget.selectionEnd ?? selectionStart
      const result = buildComposeLinesFromPaste(
        line,
        trackIndex,
        selectionStart,
        selectionEnd,
        pastedText,
      )
      if (!result) return
      onReplaceLineWithLines(result.lines, result.focusLineId)
    }
  }

  const translations = useMemo(
    () => translationLanguages.map((_, index) => line.translations?.[index] ?? ''),
    [line.translations, translationLanguages],
  )

  const showTranslations =
    translationLanguages.length > 0 &&
    line.text.trim().length > 0 &&
    (!readOnly || translations.some((translation) => translation.trim().length > 0))

  const showConvertToChordBar =
    !readOnly &&
    line.text.trim().length === 0 &&
    !composeLineHasTranslationContent(line) &&
    !isComposeChordBarRow(line)

  const hasAnyChords =
    line.chords.length > 0 ||
    (line.translationChords?.some((trackChords) => trackChords.length > 0) ?? false)

  function updateTrackText(trackIndex: number, nextText: string) {
    if (trackIndex === 0) {
      updateLine({
        text: nextText,
        chords: clampComposeLineTrackChords(line.chords, nextText.length),
      })
      return
    }

    const nextTranslations = [...translations]
    nextTranslations[trackIndex - 1] = nextText
    const trackChords = clampComposeLineTrackChords(
      composeLineChordsForTrack(line, trackIndex),
      nextText.length,
    )
    updateLine(
      updateComposeLineChordsForTrack({ ...line, translations: nextTranslations }, trackIndex, trackChords),
    )
  }

  return (
    <div className={cn('group flex items-stretch', hasAnyChords ? 'min-h-10' : 'min-h-6')}>
      <div className="relative min-w-0 flex-1 pb-1">
        <ComposeLyricTrackEditor
          line={line}
          trackIndex={0}
          trackChords={line.chords}
          text={line.text}
          readOnly={readOnly}
          autoFocus={autoFocus}
          timeSignature={timeSignature}
          isDropTarget={activeDropLineId === line.id && activeDropTrackIndex === 0}
          highlightCharIndex={
            activeDropLineId === line.id && activeDropTrackIndex === 0 ? highlightCharIndex : null
          }
          previewChordSymbol={
            activeDropLineId === line.id && activeDropTrackIndex === 0 ? previewChordSymbol : null
          }
          placeholder={t('songs.editor.compose.linePlaceholder')}
          ariaLabel={t('songs.editor.compose.lineAria')}
          registerMeasure={registerMeasure}
          onKeyDown={onPrimaryKeyDown}
          onPaste={onTrackPaste(0)}
          onTextChange={(nextText) => updateTrackText(0, nextText)}
          onRemoveChord={(chordId) => removeChord(0, chordId)}
          onUpdateChordSymbol={(chordId, symbol) => updateChordSymbol(0, chordId, symbol)}
          onUpdateChordDuration={(chordId, durationMillis) =>
            updateChordDuration(0, chordId, durationMillis)
          }
        />

        {showTranslations ? (
          <div className="grid gap-0.5 pt-0.5">
            {translationLanguages.map((languageLabel, index) => {
              const translationText = translations[index] ?? ''
              if (readOnly && !translationText.trim()) return null

              const label =
                languageLabel.trim() ||
                t('songs.editor.compose.translationFallback', { number: index + 2 })
              const trackIndex = index + 1

              return (
                <ComposeLyricTrackEditor
                  key={`${line.id}-translation-${index}`}
                  line={line}
                  trackIndex={trackIndex}
                  trackChords={composeLineChordsForTrack(line, trackIndex)}
                  text={translationText}
                  readOnly={readOnly}
                  isTranslation
                  timeSignature={timeSignature}
                  isDropTarget={activeDropLineId === line.id && activeDropTrackIndex === trackIndex}
                  highlightCharIndex={
                    activeDropLineId === line.id && activeDropTrackIndex === trackIndex
                      ? highlightCharIndex
                      : null
                  }
                  previewChordSymbol={
                    activeDropLineId === line.id && activeDropTrackIndex === trackIndex
                      ? previewChordSymbol
                      : null
                  }
                  placeholder={t('songs.editor.compose.translationPlaceholder', { language: label })}
                  ariaLabel={t('songs.editor.compose.translationAria', { language: label })}
                  registerMeasure={registerMeasure}
                  onKeyDown={onTranslationKeyDown}
                  onPaste={onTrackPaste(trackIndex)}
                  onTextChange={(nextText) => updateTrackText(trackIndex, nextText)}
                  onRemoveChord={(chordId) => removeChord(trackIndex, chordId)}
                  onUpdateChordSymbol={(chordId, symbol) =>
                    updateChordSymbol(trackIndex, chordId, symbol)
                  }
                  onUpdateChordDuration={(chordId, durationMillis) =>
                    updateChordDuration(trackIndex, chordId, durationMillis)
                  }
                />
              )
            })}
          </div>
        ) : null}
      </div>

      {!readOnly ? (
        <div className="flex shrink-0 items-start">
          {showConvertToChordBar ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 shrink-0 px-2 text-xs text-[var(--color-muted-foreground)] opacity-0 transition-opacity hover:text-[var(--color-foreground)] group-hover:opacity-100 group-focus-within:opacity-100"
              onClick={() => onChange(convertComposeLineToChordBar(line))}
            >
              {t('songs.editor.compose.convertToChordBar')}
            </Button>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8 shrink-0 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
            aria-label={t('songs.editor.compose.removeLineAria')}
            onClick={onRemove}
          >
            <TrashIcon size={14} />
          </Button>
        </div>
      ) : null}
    </div>
  )
}

function ComposeSectionCard({
  section,
  readOnly,
  timeSignature,
  activeDropLineId,
  activeDropTrackIndex,
  activeDropLineAfterId,
  activeDropCharIndex,
  previewChordSymbol,
  isComposeDragging,
  translationLanguages,
  onChange,
  onRemove,
  registerMeasure,
  registerBarContainer,
}: {
  section: ComposeSection
  readOnly: boolean
  timeSignature: string
  activeDropLineId: string | null
  activeDropTrackIndex: number | null
  activeDropLineAfterId: string | null
  activeDropCharIndex: number | null
  previewChordSymbol: string | null
  isComposeDragging: boolean
  translationLanguages: string[]
  onChange: (section: ComposeSection) => void
  onRemove: () => void
  registerMeasure: (measureKey: string, measure: LineMeasureFn | null) => void
  registerBarContainer: (measureKey: string, element: HTMLDivElement | null) => void
}) {
  const { t } = useTranslation()
  const [focusLineId, setFocusLineId] = useState<string | null>(null)
  const [repeatDraft, setRepeatDraft] = useState<string | null>(null)

  const updateSection = useCallback(
    (patch: Partial<ComposeSection>) => {
      onChange({ ...section, ...patch })
    },
    [onChange, section],
  )

  const insertLineAfter = useCallback(
    (lineId: string, currentLine: ComposeLine, newLine: ComposeLine) => {
      const index = section.lines.findIndex((item) => item.id === lineId)
      if (index < 0) return
      const lines = [...section.lines]
      lines[index] = currentLine
      lines.splice(index + 1, 0, newLine)
      updateSection({ lines })
      setFocusLineId(newLine.id)
    },
    [section.lines, updateSection],
  )

  const replaceLineWithLines = useCallback(
    (lineId: string, nextLines: ComposeLine[], focusLineId: string) => {
      if (nextLines.length === 0) return
      const index = section.lines.findIndex((item) => item.id === lineId)
      if (index < 0) return
      const lines = [...section.lines]
      lines.splice(index, 1, ...nextLines)
      updateSection({ lines })
      setFocusLineId(focusLineId)
    },
    [section.lines, updateSection],
  )

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: sectionSortId(section.id),
    disabled: readOnly,
  })

  const sectionStyle: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.85 : undefined,
    zIndex: isDragging ? 10 : undefined,
  }

  return (
    <section ref={setNodeRef} style={sectionStyle} className="grid gap-1.5">
      <div className="flex items-center gap-1">
        {!readOnly ? (
          <button
            type="button"
            {...attributes}
            {...listeners}
            className="flex size-7 shrink-0 cursor-grab touch-none items-center justify-center rounded-sm text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)]/40 active:cursor-grabbing"
            aria-label={t('songs.editor.compose.sectionDragHandleAria')}
          >
            ::
          </button>
        ) : null}
        <input
          value={section.title}
          readOnly={readOnly}
          placeholder={t('songs.editor.compose.sectionTitlePlaceholder')}
          aria-label={t('songs.editor.compose.sectionTitleLabel')}
          className="min-w-0 flex-1 truncate bg-transparent px-1 py-0.5 text-sm font-semibold text-[var(--color-foreground)] outline-none placeholder:font-normal placeholder:text-[var(--color-muted-foreground)] focus-visible:rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-primary)]"
          onChange={(e) => updateSection({ title: e.target.value })}
        />
        <div
          className="flex shrink-0 items-center gap-0.5 text-sm text-[var(--color-muted-foreground)]"
          title={t('songs.editor.compose.sectionRepeatLabel')}
        >
          <span aria-hidden className="select-none font-medium">
            ×
          </span>
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            value={repeatDraft ?? String(section.repeatCount)}
            readOnly={readOnly}
            aria-label={t('songs.editor.compose.sectionRepeatLabel')}
            className="w-9 bg-transparent px-0.5 py-0.5 text-center text-sm font-semibold text-[var(--color-foreground)] outline-none focus-visible:rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-primary)]"
            onFocus={() => {
              if (!readOnly) {
                setRepeatDraft(String(section.repeatCount))
              }
            }}
            onChange={(e) => {
              const next = e.target.value.replace(/\D/g, '')
              setRepeatDraft(next)
            }}
            onBlur={() => {
              const parsed = Number.parseInt(repeatDraft ?? String(section.repeatCount), 10)
              updateSection({
                repeatCount: Number.isFinite(parsed) && parsed >= 1 ? parsed : 1,
              })
              setRepeatDraft(null)
            }}
          />
        </div>
        {!readOnly ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-7 shrink-0 text-[var(--color-muted-foreground)]"
            aria-label={t('songs.editor.compose.removeSectionAria')}
            onClick={onRemove}
          >
            <TrashIcon size={15} />
          </Button>
        ) : null}
      </div>

      <div className="overflow-hidden rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] shadow-sm">
        <ul className="divide-y divide-[var(--color-border)]" role="list">
          {section.lines.map((line) => (
            <li key={line.id}>
              {isComposeChordBarRow(line) ? (
                <ComposeChordBarRow
                  line={line}
                  readOnly={readOnly}
                  timeSignature={timeSignature}
                  isDropTarget={activeDropLineId === line.id && activeDropTrackIndex === 0}
                  highlightInsertIndex={
                    activeDropLineId === line.id && activeDropTrackIndex === 0 ? activeDropCharIndex : null
                  }
                  previewChordSymbol={
                    activeDropLineId === line.id && activeDropTrackIndex === 0 ? previewChordSymbol : null
                  }
                  registerMeasure={registerMeasure}
                  registerBarContainer={registerBarContainer}
                  onChange={(nextLine) => {
                    updateSection({
                      lines: section.lines.map((item) => (item.id === line.id ? nextLine : item)),
                    })
                  }}
                  onRemove={() => {
                    const nextLines = section.lines.filter((item) => item.id !== line.id)
                    updateSection({ lines: nextLines.length ? nextLines : [createComposeLine()] })
                  }}
                />
              ) : (
                <ComposeLineRow
                  line={line}
                  readOnly={readOnly}
                  autoFocus={focusLineId === line.id}
                  timeSignature={timeSignature}
                  activeDropLineId={activeDropLineId}
                  activeDropTrackIndex={activeDropTrackIndex}
                  highlightCharIndex={activeDropCharIndex}
                  previewChordSymbol={previewChordSymbol}
                  translationLanguages={translationLanguages}
                  registerMeasure={registerMeasure}
                  onChange={(nextLine) => {
                    if (focusLineId === line.id) setFocusLineId(null)
                    updateSection({
                      lines: section.lines.map((item) => (item.id === line.id ? nextLine : item)),
                    })
                  }}
                  onInsertLineAfter={(currentLine, newLine) =>
                    insertLineAfter(line.id, currentLine, newLine)
                  }
                  onReplaceLineWithLines={(nextLines, focusLineId) =>
                    replaceLineWithLines(line.id, nextLines, focusLineId)
                  }
                  onRemove={() => {
                    const nextLines = section.lines.filter((item) => item.id !== line.id)
                    updateSection({ lines: nextLines.length ? nextLines : [createComposeLine()] })
                  }}
                />
              )}
              <ComposeLineAfterDropZone
                lineId={line.id}
                readOnly={readOnly}
                isActive={activeDropLineAfterId === line.id}
                previewChordSymbol={activeDropLineAfterId === line.id ? previewChordSymbol : null}
                expanded={isComposeDragging}
              />
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

function isDuplicateDragModifier(event: Event | null): boolean {
  return Boolean(event && 'altKey' in event && (event as MouseEvent).altKey)
}

function addChordToSections(
  sections: ComposeSection[],
  lineId: string,
  trackIndex: number,
  symbol: string,
  position: number,
  languageTrackCount: number,
  timeSignature: string,
): ComposeSection[] {
  const found = findComposeLineInSections(sections, lineId)
  if (!found) return sections

  return sections.map((section, sectionIndex) => {
    if (sectionIndex !== found.sectionIndex) return section
    return {
      ...section,
      lines: section.lines.map((line, lineIndex) => {
        if (lineIndex !== found.lineIndex) return line
        const normalized = normalizeComposeLineForLanguageTracks(line, languageTrackCount)
        if (isComposeLineChordBarTarget(normalized, trackIndex)) {
          return addComposeChordAtIndex(normalized, symbol, position, null, timeSignature)
        }
        const trackText = composeLineTrackText(normalized, trackIndex)
        if (trackText.trim().length === 0) return normalized
        const trackChords = composeLineChordsForTrack(normalized, trackIndex)
        const nextChord = createComposeChordForLineTrack(symbol, trackIndex, position, normalized)
        return updateComposeLineChordsForTrack(
          normalized,
          trackIndex,
          [...trackChords, nextChord].sort((a, b) => a.position - b.position),
        )
      }),
    }
  })
}

function removeChordFromSections(
  sections: ComposeSection[],
  lineId: string,
  trackIndex: number,
  chordId: string,
  languageTrackCount: number,
): ComposeSection[] {
  const found = findComposeLineInSections(sections, lineId)
  if (!found) return sections

  return sections.map((section, sectionIndex) => {
    if (sectionIndex !== found.sectionIndex) return section
    return {
      ...section,
      lines: section.lines.map((line, lineIndex) => {
        if (lineIndex !== found.lineIndex) return line
        const normalized = normalizeComposeLineForLanguageTracks(line, languageTrackCount)
        const trackChords = composeLineChordsForTrack(normalized, trackIndex).filter(
          (chord) => chord.id !== chordId,
        )
        if (isComposeLineChordBarTarget(normalized, trackIndex)) {
          if (trackChords.length === 0) {
            return { ...normalized, text: '', chords: [], chordBar: undefined }
          }
          return normalizeChordOnlyLine(normalized, trackChords)
        }
        return updateComposeLineChordsForTrack(normalized, trackIndex, trackChords)
      }),
    }
  })
}

function updateChordSymbolInSections(
  sections: ComposeSection[],
  lineId: string,
  trackIndex: number,
  chordId: string,
  symbol: string,
  languageTrackCount: number,
): ComposeSection[] {
  const found = findComposeLineInSections(sections, lineId)
  if (!found) return sections

  return sections.map((section, sectionIndex) => {
    if (sectionIndex !== found.sectionIndex) return section
    return {
      ...section,
      lines: section.lines.map((line, lineIndex) => {
        if (lineIndex !== found.lineIndex) return line
        const normalized = normalizeComposeLineForLanguageTracks(line, languageTrackCount)
        const trackChords = composeLineChordsForTrack(normalized, trackIndex).map((chord) =>
          chord.id === chordId ? { ...chord, symbol } : chord,
        )
        if (isComposeLineChordBarTarget(normalized, trackIndex)) {
          return normalizeChordOnlyLine(normalized, trackChords)
        }
        return updateComposeLineChordsForTrack(normalized, trackIndex, trackChords)
      }),
    }
  })
}

export function SongEditorCompose({
  sections,
  songKey,
  timeSignature,
  chordFormat,
  readOnly,
  translationLanguages,
  onChange,
}: SongEditorComposeProps) {
  const { t } = useTranslation()
  const [activePoolSymbol, setActivePoolSymbol] = useState<string | null>(null)
  const [activeDragPreviewSymbol, setActiveDragPreviewSymbol] = useState<string | null>(null)
  const [activeBarChordDragOverlay, setActiveBarChordDragOverlay] = useState<BarDragOverlay | null>(
    null,
  )
  const dragPreviewSymbolRef = useRef<string | null>(null)
  const dragSourceBarOverlayRef = useRef<BarDragOverlay | null>(null)
  const [isComposeDragging, setIsComposeDragging] = useState(false)
  const [activeDropLineId, setActiveDropLineId] = useState<string | null>(null)
  const [activeDropTrackIndex, setActiveDropTrackIndex] = useState<number | null>(null)
  const [activeDropLineAfterId, setActiveDropLineAfterId] = useState<string | null>(null)
  const [activeDropCharIndex, setActiveDropCharIndex] = useState<number | null>(null)
  const lineMeasureRef = useRef(new Map<string, LineMeasureFn>())
  const barContainerRef = useRef(new Map<string, HTMLDivElement>())
  const lastDropTargetRef = useRef<{
    lineId: string
    trackIndex: number
    charIndex: number
  } | null>(null)
  const [activeLineChordDragId, setActiveLineChordDragId] = useState<string | null>(null)
  const [duplicateDragSourceId, setDuplicateDragSourceId] = useState<string | null>(null)
  const [chordModeEnabled, setChordModeEnabled] = useState(false)
  const [eraserModeEnabled, setEraserModeEnabled] = useState(false)
  const [simplifyModeEnabled, setSimplifyModeEnabled] = useState(false)
  const [chordModeSelectedIndex, setChordModeSelectedIndex] = useState(0)
  const [chordModeMinorOverride, setChordModeMinorOverride] = useState<boolean | null>(null)
  const [chordModeFlatOverride, setChordModeFlatOverride] = useState<boolean | null>(null)
  const [chordModeBassDegree, setChordModeBassDegree] = useState<number | null>(null)
  const [chordModeExtension, setChordModeExtension] = useState<string | null>(null)
  const [chordModeAwaitingSlashBass, setChordModeAwaitingSlashBass] = useState(false)
  const [chordModeAwaitingExtension, setChordModeAwaitingExtension] =
    useState<ChordModeExtensionKind | null>(null)
  const [chordModePointer, setChordModePointer] = useState<{ x: number; y: number } | null>(null)
  const [chordModeHover, setChordModeHover] = useState<ComposeChordModeHover | null>(null)
  const [eraserModeHoverChordId, setEraserModeHoverChordId] = useState<string | null>(null)
  const [simplifyModeHoverChordId, setSimplifyModeHoverChordId] = useState<string | null>(null)
  const [chordModePoolSymbolOverride, setChordModePoolSymbolOverride] = useState<string | null>(null)

  const languageTrackCount = Math.max(1, translationLanguages.length + 1)

  const pool = useMemo(() => composeChordPool(songKey, chordFormat), [chordFormat, songKey])
  const mixolydianPool = useMemo(
    () => composeMixolydianChordPool(songKey, chordFormat),
    [chordFormat, songKey],
  )
  const otherPool = useMemo(
    () => composeOtherChordPool(songKey, chordFormat),
    [chordFormat, songKey],
  )

  const poolBaseSymbol =
    chordModeSelectedIndex === CHORD_MODE_FLAT7_SELECTED_INDEX
      ? (mixolydianPool[0]?.symbol ?? null)
      : (pool[chordModeSelectedIndex]?.symbol ?? null)
  const chordModeMinor =
    chordModeMinorOverride ??
    (poolBaseSymbol ? isDiatonicPoolSymbolMinor(poolBaseSymbol) : false)
  const chordModeFlat = chordModeFlatOverride ?? false
  const chordModeSelectedSymbol =
    chordModePoolSymbolOverride ??
    buildDiatonicChordModeSymbol({
      selectedIndex: chordModeSelectedIndex,
      minor: chordModeMinor,
      flat: chordModeFlat,
      bassDegree: chordModeBassDegree,
      extension: chordModeExtension,
      chordFormat,
      songKey,
    })

  const clearChordModeAwaitingInput = useCallback(() => {
    setChordModeAwaitingSlashBass(false)
    setChordModeAwaitingExtension(null)
  }, [])

  const selectChordModeIndex = useCallback((index: number) => {
    setChordModePoolSymbolOverride(null)
    setChordModeSelectedIndex(index)
    setChordModeMinorOverride(null)
    setChordModeFlatOverride(null)
    setChordModeBassDegree(null)
    setChordModeExtension(null)
    clearChordModeAwaitingInput()
  }, [clearChordModeAwaitingInput])

  const selectPoolSymbolForPlaceMode = useCallback((symbol: string) => {
    setChordModePoolSymbolOverride(symbol)
    setChordModeMinorOverride(null)
    setChordModeFlatOverride(null)
    setChordModeBassDegree(null)
    setChordModeExtension(null)
    clearChordModeAwaitingInput()
  }, [clearChordModeAwaitingInput])

  const selectDiatonicPoolForPlaceMode = useCallback(
    (index: number) => {
      if (index >= 0 && index <= 5) selectChordModeIndex(index)
    },
    [selectChordModeIndex],
  )

  const selectFlat7Chord = useCallback(() => {
    selectChordModeIndex(CHORD_MODE_FLAT7_SELECTED_INDEX)
  }, [selectChordModeIndex])

  const selectMixolydianPoolForPlaceMode = useCallback(
    (index: number) => {
      if (index === 0) {
        selectFlat7Chord()
        return
      }
      const symbol = mixolydianPool[index]?.symbol
      if (symbol) selectPoolSymbolForPlaceMode(symbol)
    },
    [mixolydianPool, selectFlat7Chord, selectPoolSymbolForPlaceMode],
  )

  const selectOtherPoolForPlaceMode = useCallback(
    (index: number) => {
      const symbol = otherPool[index]?.symbol
      if (symbol) selectPoolSymbolForPlaceMode(symbol)
    },
    [otherPool, selectPoolSymbolForPlaceMode],
  )

  const diatonicPoolSelectedIndex =
    chordModeEnabled && !chordModePoolSymbolOverride && chordModeSelectedIndex <= 5
      ? chordModeSelectedIndex
      : null
  const mixolydianPoolSelectedIndexRaw =
    chordModeEnabled && !chordModePoolSymbolOverride && chordModeSelectedIndex === CHORD_MODE_FLAT7_SELECTED_INDEX
      ? 0
      : chordModeEnabled && chordModePoolSymbolOverride
        ? mixolydianPool.findIndex((chord) => chord.symbol === chordModePoolSymbolOverride)
        : -1
  const mixolydianPoolSelectedIndex =
    mixolydianPoolSelectedIndexRaw >= 0 ? mixolydianPoolSelectedIndexRaw : null
  const otherPoolSelectedIndexRaw =
    chordModeEnabled && chordModePoolSymbolOverride
      ? otherPool.findIndex((chord) => chord.symbol === chordModePoolSymbolOverride)
      : -1
  const otherPoolSelectedIndex = otherPoolSelectedIndexRaw >= 0 ? otherPoolSelectedIndexRaw : null

  useEffect(() => {
    if (!chordModeEnabled) return

    function onPointerMove(event: PointerEvent) {
      setChordModePointer({ x: event.clientX, y: event.clientY })
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setChordModeEnabled(false)
        setEraserModeEnabled(false)
        setSimplifyModeEnabled(false)
        setChordModePointer(null)
        setChordModeHover(null)
        setEraserModeHoverChordId(null)
        setSimplifyModeHoverChordId(null)
        return
      }
      if (
        event.key.toLowerCase() === 'm' &&
        !event.altKey &&
        !event.metaKey &&
        !event.ctrlKey
      ) {
        event.preventDefault()
        clearChordModeAwaitingInput()
        setChordModePoolSymbolOverride(null)
        setChordModeMinorOverride((prev) => {
          const base =
            chordModeSelectedIndex === CHORD_MODE_FLAT7_SELECTED_INDEX
              ? mixolydianPool[0]?.symbol
              : pool[chordModeSelectedIndex]?.symbol
          if (!base) return prev
          const currentMinor = prev ?? isDiatonicPoolSymbolMinor(base)
          return !currentMinor
        })
        return
      }
      if (
        event.key.toLowerCase() === 'b' &&
        !event.altKey &&
        !event.metaKey &&
        !event.ctrlKey
      ) {
        event.preventDefault()
        clearChordModeAwaitingInput()
        setChordModePoolSymbolOverride(null)
        setChordModeFlatOverride((prev) => !(prev ?? false))
        return
      }
      if (
        (event.key.toLowerCase() === 'a' ||
          event.key.toLowerCase() === 's' ||
          event.key.toLowerCase() === 'e') &&
        !event.altKey &&
        !event.metaKey &&
        !event.ctrlKey
      ) {
        event.preventDefault()
        setChordModePoolSymbolOverride(null)
        setChordModeAwaitingSlashBass(false)
        const key = event.key.toLowerCase()
        setChordModeAwaitingExtension(key === 'a' ? 'add' : key === 's' ? 'sus' : 'extend')
        return
      }
      if (event.key === '/' && !event.altKey && !event.metaKey && !event.ctrlKey) {
        event.preventDefault()
        setChordModePoolSymbolOverride(null)
        setChordModeAwaitingExtension(null)
        setChordModeAwaitingSlashBass(true)
        return
      }
      const digit = Number.parseInt(event.key, 10)
      if (
        Number.isFinite(digit) &&
        digit >= 0 &&
        digit <= 9 &&
        chordModeAwaitingExtension
      ) {
        const extension = formatChordModeExtension(chordModeAwaitingExtension, digit)
        if (extension) {
          event.preventDefault()
          setChordModePoolSymbolOverride(null)
          setChordModeExtension(extension)
          setChordModeAwaitingExtension(null)
        }
        return
      }
      if (digit >= 1 && digit <= 7 && chordModeAwaitingSlashBass) {
        event.preventDefault()
        setChordModePoolSymbolOverride(null)
        setChordModeBassDegree(digit)
        setChordModeAwaitingSlashBass(false)
        return
      }
      if (digit >= 1 && digit <= 6 && !chordModeAwaitingSlashBass && !chordModeAwaitingExtension) {
        event.preventDefault()
        selectChordModeIndex(digit - 1)
        return
      }
      if (digit === 7 && !chordModeAwaitingSlashBass && !chordModeAwaitingExtension) {
        event.preventDefault()
        selectFlat7Chord()
      }
    }

    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('keydown', onKeyDown, true)
    return () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('keydown', onKeyDown, true)
    }
  }, [
    chordModeAwaitingExtension,
    chordModeAwaitingSlashBass,
    chordModeEnabled,
    chordModeSelectedIndex,
    clearChordModeAwaitingInput,
    mixolydianPool,
    pool,
    selectChordModeIndex,
    selectFlat7Chord,
  ])

  useEffect(() => {
    if (!eraserModeEnabled && !simplifyModeEnabled) return

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setEraserModeEnabled(false)
        setSimplifyModeEnabled(false)
        setEraserModeHoverChordId(null)
        setSimplifyModeHoverChordId(null)
      }
    }

    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [eraserModeEnabled, simplifyModeEnabled])

  const clearPlacementModeState = useCallback(() => {
    setChordModePointer(null)
    setChordModeHover(null)
    setChordModePoolSymbolOverride(null)
    setChordModeMinorOverride(null)
    setChordModeFlatOverride(null)
    setChordModeBassDegree(null)
    setChordModeExtension(null)
    setChordModeAwaitingSlashBass(false)
    setChordModeAwaitingExtension(null)
  }, [])

  const clearInteractionModeState = useCallback(() => {
    setEraserModeHoverChordId(null)
    setSimplifyModeHoverChordId(null)
  }, [])

  const handleChordModeEnabledChange = useCallback((enabled: boolean) => {
    setChordModeEnabled(enabled)
    if (enabled) {
      setEraserModeEnabled(false)
      setSimplifyModeEnabled(false)
      clearInteractionModeState()
    } else {
      clearPlacementModeState()
    }
  }, [clearInteractionModeState, clearPlacementModeState])

  const toggleChordMode = useCallback(() => {
    setChordModeEnabled((prev) => {
      const next = !prev
      if (next) {
        setEraserModeEnabled(false)
        setSimplifyModeEnabled(false)
        clearInteractionModeState()
      } else {
        clearPlacementModeState()
      }
      return next
    })
  }, [clearInteractionModeState, clearPlacementModeState])

  const toggleEraserMode = useCallback(() => {
    setEraserModeEnabled((prev) => {
      const next = !prev
      if (next) {
        setChordModeEnabled(false)
        setSimplifyModeEnabled(false)
        clearPlacementModeState()
        setSimplifyModeHoverChordId(null)
      } else {
        setEraserModeHoverChordId(null)
      }
      return next
    })
  }, [clearPlacementModeState])

  const toggleSimplifyMode = useCallback(() => {
    setSimplifyModeEnabled((prev) => {
      const next = !prev
      if (next) {
        setChordModeEnabled(false)
        setEraserModeEnabled(false)
        clearPlacementModeState()
        setEraserModeHoverChordId(null)
      } else {
        setSimplifyModeHoverChordId(null)
      }
      return next
    })
  }, [clearPlacementModeState])

  useEffect(() => {
    if (readOnly) return

    function onKeyDown(event: KeyboardEvent) {
      if (isChordPlacementModeShortcut(event)) {
        event.preventDefault()
        toggleChordMode()
        return
      }
      if (isChordEraserModeShortcut(event)) {
        event.preventDefault()
        toggleEraserMode()
        return
      }
      if (isChordSimplifyModeShortcut(event)) {
        event.preventDefault()
        toggleSimplifyMode()
      }
    }

    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [readOnly, toggleChordMode, toggleEraserMode, toggleSimplifyMode])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 160, tolerance: 6 } }),
  )

  const registerMeasure = useCallback((measureKey: string, measure: LineMeasureFn | null) => {
    if (measure) lineMeasureRef.current.set(measureKey, measure)
    else lineMeasureRef.current.delete(measureKey)
  }, [])

  const registerBarContainer = useCallback(
    (measureKey: string, element: HTMLDivElement | null) => {
      if (element) barContainerRef.current.set(measureKey, element)
      else barContainerRef.current.delete(measureKey)
    },
    [],
  )

  useEffect(() => {
    if (!isComposeDragging) return

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Alt' && activeLineChordDragId) {
        setDuplicateDragSourceId(activeLineChordDragId)
      }
    }

    function onKeyUp(event: KeyboardEvent) {
      if (event.key === 'Alt') setDuplicateDragSourceId(null)
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [activeLineChordDragId, isComposeDragging])

  const updateSections = useCallback(
    (next: ComposeSection[]) => {
      onChange(next)
    },
    [onChange],
  )

  const placeChordAt = useCallback(
    (lineId: string, trackIndex: number, charIndex: number) => {
      if (!chordModeSelectedSymbol) return
      updateSections(
        addChordToSections(
          sections,
          lineId,
          trackIndex,
          chordModeSelectedSymbol,
          charIndex,
          languageTrackCount,
          timeSignature,
        ),
      )
    },
    [chordModeSelectedSymbol, languageTrackCount, sections, timeSignature, updateSections],
  )

  const eraseChordAt = useCallback(
    (lineId: string, trackIndex: number, chordId: string) => {
      updateSections(
        removeChordFromSections(sections, lineId, trackIndex, chordId, languageTrackCount),
      )
    },
    [languageTrackCount, sections, updateSections],
  )

  const eraseAtPosition = useCallback(
    (lineId: string, trackIndex: number, charIndex: number) => {
      const found = findComposeLineInSections(sections, lineId)
      if (!found) return
      const line = sections[found.sectionIndex]!.lines[found.lineIndex]!
      const normalized = normalizeComposeLineForLanguageTracks(line, languageTrackCount)
      const trackChords = composeLineChordsForTrack(normalized, trackIndex)
      const chord = trackChords.find(
        (entry) => entry.position === charIndex && entry.symbol.trim().length > 0,
      )
      if (chord) {
        eraseChordAt(lineId, trackIndex, chord.id)
      }
    },
    [eraseChordAt, languageTrackCount, sections],
  )

  const simplifyChordAt = useCallback(
    (lineId: string, trackIndex: number, chordId: string) => {
      const found = findComposeLineInSections(sections, lineId)
      if (!found) return
      const line = sections[found.sectionIndex]!.lines[found.lineIndex]!
      const normalized = normalizeComposeLineForLanguageTracks(line, languageTrackCount)
      const chord = composeLineChordsForTrack(normalized, trackIndex).find(
        (entry) => entry.id === chordId,
      )
      if (!chord || !hasChordModeExtension(chord.symbol)) return
      const nextSymbol = stripChordModeExtension(chord.symbol)
      if (nextSymbol === chord.symbol) return
      updateSections(
        updateChordSymbolInSections(
          sections,
          lineId,
          trackIndex,
          chordId,
          nextSymbol,
          languageTrackCount,
        ),
      )
    },
    [languageTrackCount, sections, updateSections],
  )

  const chordModeContext = useMemo<ComposeChordModeContextValue>(
    () => ({
      enabled: chordModeEnabled,
      eraserEnabled: eraserModeEnabled,
      simplifyEnabled: simplifyModeEnabled,
      selectedIndex: chordModeSelectedIndex,
      selectedSymbol: chordModeEnabled ? chordModeSelectedSymbol : null,
      hover: chordModeHover,
      eraserHoverChordId: eraserModeHoverChordId,
      simplifyHoverChordId: simplifyModeHoverChordId,
      setEnabled: handleChordModeEnabledChange,
      selectIndex: selectChordModeIndex,
      setHover: setChordModeHover,
      setEraserHoverChordId: setEraserModeHoverChordId,
      setSimplifyHoverChordId: setSimplifyModeHoverChordId,
      placeAt: placeChordAt,
      eraseAt: eraseAtPosition,
      eraseChord: eraseChordAt,
      simplifyChord: simplifyChordAt,
    }),
    [
      chordModeEnabled,
      eraserModeEnabled,
      simplifyModeEnabled,
      chordModeHover,
      eraserModeHoverChordId,
      simplifyModeHoverChordId,
      chordModeSelectedIndex,
      chordModeSelectedSymbol,
      eraseAtPosition,
      eraseChordAt,
      handleChordModeEnabledChange,
      simplifyChordAt,
      placeChordAt,
      selectChordModeIndex,
    ],
  )

  const addSection = useCallback(() => {
    updateSections([...sections, createComposeSection(defaultSectionTitle(sections.length))])
  }, [sections, updateSections])

  function restoreBarDragOverlayWhenNotOverTarget() {
    if (dragSourceBarOverlayRef.current) {
      setActiveBarChordDragOverlay(dragSourceBarOverlayRef.current)
      return
    }
    setActiveBarChordDragOverlay(null)
  }

  function updateBarDragOverlayForDropTarget(
    lineId: string,
    trackIndex: number,
    overWidth: number | undefined,
  ) {
    const symbol = dragPreviewSymbolRef.current
    if (!symbol) {
      restoreBarDragOverlayWhenNotOverTarget()
      return
    }

    const line = sections.flatMap((section) => section.lines).find((item) => item.id === lineId)
    if (!line || !isComposeLineChordBarTarget(line, trackIndex)) {
      restoreBarDragOverlayWhenNotOverTarget()
      return
    }

    const barContainer = barContainerRef.current.get(lineMeasureKey(lineId, trackIndex)) ?? null
    setActiveBarChordDragOverlay(
      composeBarDragOverlayForLine(line, timeSignature, symbol, barContainer, overWidth),
    )
  }

  function updateDropTarget(event: DragOverEvent | DragMoveEvent) {
    const clientX = dragPointerClientX(event)
    const overData = event.over?.data.current
    const overWidth = event.over?.rect.width

    if (overData && typeof overData === 'object' && 'type' in overData) {
      if (overData.type === 'line-after') {
        setActiveDropLineAfterId((overData as LineAfterDropData).lineId)
        setActiveDropLineId(null)
        setActiveDropTrackIndex(null)
        setActiveDropCharIndex(null)
        restoreBarDragOverlayWhenNotOverTarget()
        return
      }

      if (overData.type === 'line' && clientX != null) {
        const { lineId, trackIndex } = overData as LineDropData
        const measure = lineMeasureRef.current.get(lineMeasureKey(lineId, trackIndex))
        const charIndex = measure?.(clientX) ?? 0
        lastDropTargetRef.current = { lineId, trackIndex, charIndex }
        setActiveDropLineAfterId(null)
        setActiveDropLineId(lineId)
        setActiveDropTrackIndex(trackIndex)
        setActiveDropCharIndex(charIndex)
        updateBarDragOverlayForDropTarget(lineId, trackIndex, overWidth)
        return
      }
    }

    lastDropTargetRef.current = null

    setActiveDropLineId(null)
    setActiveDropTrackIndex(null)
    setActiveDropLineAfterId(null)
    setActiveDropCharIndex(null)
    restoreBarDragOverlayWhenNotOverTarget()
  }

  function findDraggedChordSymbol(lineId: string, chordId: string): string | null {
    for (const section of sections) {
      for (const line of section.lines) {
        if (line.id !== lineId) continue
        const primary = line.chords.find((item) => item.id === chordId)
        if (primary) return composeChordDisplayLabel(primary)
        for (const trackChords of line.translationChords ?? []) {
          const translation = trackChords.find((item) => item.id === chordId)
          if (translation) return composeChordDisplayLabel(translation)
        }
      }
    }
    return null
  }

  function onDragStart(event: DragStartEvent) {
    if (isSectionSortId(event.active.id)) return

    setIsComposeDragging(true)
    const data = event.active.data.current
    if (data && typeof data === 'object' && 'type' in data) {
      if (data.type === 'pool') {
        const symbol = (data as PoolDragData).symbol
        dragPreviewSymbolRef.current = symbol
        dragSourceBarOverlayRef.current = null
        setActivePoolSymbol(symbol)
        setActiveDragPreviewSymbol(symbol)
        setActiveBarChordDragOverlay(null)
        return
      }
      if (data.type === 'line-chord') {
        const { lineId, chordId } = data as LineChordDragData
        setActiveLineChordDragId(chordId)
        if (isDuplicateDragModifier(event.activatorEvent)) {
          setDuplicateDragSourceId(chordId)
        }
        const symbol = findDraggedChordSymbol(lineId, chordId)
        dragPreviewSymbolRef.current = symbol
        setActiveDragPreviewSymbol(symbol)

        const draggedLine = sections
          .flatMap((section) => section.lines)
          .find((item) => item.id === lineId)
        const draggedChord = draggedLine?.chords.find((item) => item.id === chordId)
        const rect = event.active.rect.current?.initial
        if (draggedLine && draggedChord && isComposeChordOnlyLine(draggedLine) && rect) {
          const sourceOverlay: BarDragOverlay = {
            symbol: draggedChord.symbol.trim(),
            width: rect.width,
            height: rect.height,
          }
          dragSourceBarOverlayRef.current = sourceOverlay
          setActiveBarChordDragOverlay(sourceOverlay)
        } else {
          dragSourceBarOverlayRef.current = null
          setActiveBarChordDragOverlay(null)
        }
      }
    }
  }

  function onDragMove(event: DragMoveEvent) {
    if (isSectionSortId(event.active.id)) return
    updateDropTarget(event)
  }

  function onDragOver(event: DragOverEvent) {
    if (isSectionSortId(event.active.id)) return
    updateDropTarget(event)
  }

  function onDragEnd(event: DragEndEvent) {
    if (isSectionSortId(event.active.id)) {
      const over = event.over
      if (over && isSectionSortId(over.id) && event.active.id !== over.id) {
        const activeId = parseSectionSortId(String(event.active.id))
        const overId = parseSectionSortId(String(over.id))
        if (activeId && overId) {
          const oldIndex = sections.findIndex((item) => item.id === activeId)
          const newIndex = sections.findIndex((item) => item.id === overId)
          if (oldIndex >= 0 && newIndex >= 0) {
            updateSections(arrayMove(sections, oldIndex, newIndex))
          }
        }
      }
      return
    }

    const dropLineId = activeDropLineId ?? lastDropTargetRef.current?.lineId ?? null
    const dropTrackIndex =
      activeDropTrackIndex ?? lastDropTargetRef.current?.trackIndex ?? null
    const dropLineAfterId = activeDropLineAfterId
    const dropCharIndex =
      activeDropCharIndex ?? lastDropTargetRef.current?.charIndex ?? null
    const duplicateDrag = duplicateDragSourceId != null

    setActivePoolSymbol(null)
    setActiveDragPreviewSymbol(null)
    setActiveBarChordDragOverlay(null)
    dragPreviewSymbolRef.current = null
    dragSourceBarOverlayRef.current = null
    setIsComposeDragging(false)
    setActiveLineChordDragId(null)
    setDuplicateDragSourceId(null)
    setActiveDropLineId(null)
    setActiveDropTrackIndex(null)
    setActiveDropLineAfterId(null)
    setActiveDropCharIndex(null)
    lastDropTargetRef.current = null

    const activeData = event.active.data.current
    const overData = event.over?.data.current

    if (
      activeData &&
      typeof activeData === 'object' &&
      'type' in activeData &&
      activeData.type === 'pool' &&
      overData &&
      typeof overData === 'object' &&
      'type' in overData
    ) {
      if (overData.type === 'line-after' && dropLineAfterId) {
        const symbol = (activeData as PoolDragData).symbol
        updateSections(
          insertComposeLineAfter(
            sections,
            dropLineAfterId,
            createComposeChordOnlyLine(symbol),
          ),
        )
        return
      }

      if (
        overData.type === 'line' &&
        dropLineId &&
        dropTrackIndex != null &&
        dropCharIndex != null
      ) {
        const symbol = (activeData as PoolDragData).symbol
        updateSections(
          addChordToSections(
            sections,
            dropLineId,
            dropTrackIndex,
            symbol,
            dropCharIndex,
            languageTrackCount,
            timeSignature,
          ),
        )
        return
      }
    }

    const parsed = parseLineChordDragId(String(event.active.id))
    if (parsed && overData && typeof overData === 'object' && 'type' in overData) {
      if (overData.type === 'line-after' && dropLineAfterId) {
        updateSections(
          duplicateDrag
            ? duplicateComposeChordToLineAfter(
                sections,
                dropLineAfterId,
                parsed.lineId,
                parsed.chordId,
              )
            : moveComposeChordToLineAfter(sections, dropLineAfterId, parsed.lineId, parsed.chordId),
        )
        return
      }

      const draggedTrackIndex =
        activeData &&
        typeof activeData === 'object' &&
        'type' in activeData &&
        activeData.type === 'line-chord'
          ? (activeData as LineChordDragData).trackIndex
          : null
      const moveTrackIndex = dropTrackIndex ?? draggedTrackIndex

      if (dropCharIndex != null && dropLineId && moveTrackIndex != null) {
        updateSections(
          duplicateDrag
            ? duplicateComposeChordBetweenLines(
                sections,
                parsed.lineId,
                dropLineId,
                moveTrackIndex,
                parsed.chordId,
                dropCharIndex,
                languageTrackCount,
              )
            : moveComposeChordBetweenLines(
                sections,
                parsed.lineId,
                dropLineId,
                moveTrackIndex,
                parsed.chordId,
                dropCharIndex,
                languageTrackCount,
              ),
        )
      }
    }
  }

  function onDragCancel() {
    setActiveLineChordDragId(null)
    setDuplicateDragSourceId(null)
    setActivePoolSymbol(null)
    setActiveDragPreviewSymbol(null)
    setActiveBarChordDragOverlay(null)
    dragPreviewSymbolRef.current = null
    dragSourceBarOverlayRef.current = null
    setIsComposeDragging(false)
    setActiveDropLineId(null)
    setActiveDropTrackIndex(null)
    setActiveDropLineAfterId(null)
    setActiveDropCharIndex(null)
    lastDropTargetRef.current = null
  }

  const lineChordDragContext = useMemo(
    () => ({
      activeChordId: activeLineChordDragId,
      duplicateSourceId: duplicateDragSourceId,
    }),
    [activeLineChordDragId, duplicateDragSourceId],
  )
  const lineDropPreviewSymbol =
    activeLineChordDragId && !duplicateDragSourceId ? null : activeDragPreviewSymbol

  const chordModeBarPreviewOverlay = useMemo((): BarDragOverlay | null => {
    if (!chordModeEnabled || !chordModeSelectedSymbol || !chordModeHover) return null

    const line = sections
      .flatMap((section) => section.lines)
      .find((item) => item.id === chordModeHover.lineId)
    if (!line || !isComposeLineChordBarTarget(line, chordModeHover.trackIndex)) return null

    return composeBarDragOverlayForLine(
      line,
      timeSignature,
      chordModeSelectedSymbol,
      null,
      undefined,
    )
  }, [chordModeEnabled, chordModeHover, chordModeSelectedSymbol, sections, timeSignature])

  return (
    <ComposeLineChordDragContext.Provider value={lineChordDragContext}>
    <ComposeChordModeContext.Provider value={chordModeContext}>
    <DndContext
      sensors={sensors}
      collisionDetection={composeCollisionDetection}
      onDragStart={onDragStart}
      onDragMove={onDragMove}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={onDragCancel}
    >
      <div className={cn('grid gap-4', !readOnly && COMPOSE_CHORD_BELT_SCROLL_PAD_CLASS)}>
          {sections.length === 0 ? (
            <p className="text-sm text-[var(--color-muted-foreground)]">
              {t('songs.editor.compose.empty')}
            </p>
          ) : (
            <>
              <SortableContext
                items={sections.map((item) => sectionSortId(item.id))}
                strategy={verticalListSortingStrategy}
              >
                {sections.map((section) => (
                  <ComposeSectionCard
                    key={section.id}
                    section={section}
                    readOnly={readOnly}
                    timeSignature={timeSignature}
                    activeDropLineId={activeDropLineId}
                    activeDropTrackIndex={activeDropTrackIndex}
                    activeDropLineAfterId={activeDropLineAfterId}
                    activeDropCharIndex={activeDropCharIndex}
                    previewChordSymbol={lineDropPreviewSymbol}
                    isComposeDragging={isComposeDragging}
                    translationLanguages={translationLanguages}
                    registerMeasure={registerMeasure}
                    registerBarContainer={registerBarContainer}
                    onChange={(nextSection) =>
                      updateSections(
                        sections.map((item) => (item.id === section.id ? nextSection : item)),
                      )
                    }
                    onRemove={() =>
                      updateSections(sections.filter((item) => item.id !== section.id))
                    }
                  />
                ))}
              </SortableContext>
            </>
          )}

          {!readOnly ? (
            <Button type="button" variant="outline" size="sm" className="h-8" onClick={addSection}>
              <PlusIcon size={16} />
              {t('songs.editor.compose.addSection')}
            </Button>
          ) : null}
        </div>

      {!readOnly ? (
        <ComposeChordPools
          diatonicChords={pool}
          mixolydianChords={mixolydianPool}
          otherChords={otherPool}
          readOnly={readOnly}
          chordModeEnabled={chordModeEnabled}
          eraserModeEnabled={eraserModeEnabled}
          simplifyModeEnabled={simplifyModeEnabled}
          diatonicSelectedIndex={diatonicPoolSelectedIndex}
          mixolydianSelectedIndex={mixolydianPoolSelectedIndex}
          otherSelectedIndex={otherPoolSelectedIndex}
          onChordModeToggle={toggleChordMode}
          onEraserModeToggle={toggleEraserMode}
          onSimplifyModeToggle={toggleSimplifyMode}
          onDiatonicPlaceModeSelect={selectDiatonicPoolForPlaceMode}
          onMixolydianPlaceModeSelect={selectMixolydianPoolForPlaceMode}
          onOtherPlaceModeSelect={selectOtherPoolForPlaceMode}
        />
      ) : null}

      {chordModeEnabled && chordModePointer && chordModeSelectedSymbol ? (
        <div
          className="pointer-events-none fixed z-30 -translate-x-1/2 -translate-y-full pb-1"
          style={{ left: chordModePointer.x, top: chordModePointer.y }}
          aria-hidden
        >
          {chordModeBarPreviewOverlay ? (
            <div
              style={{
                width: chordModeBarPreviewOverlay.width,
                height: chordModeBarPreviewOverlay.height,
              }}
              className="flex min-w-0 items-center justify-center overflow-hidden rounded-sm border border-[var(--color-primary)]/35 bg-[var(--color-primary)]/10 px-1 shadow-md"
            >
              <span className={COMPOSE_CHORD_TEXT}>{chordModeBarPreviewOverlay.symbol}</span>
            </div>
          ) : (
            <span
              className={cn(
                COMPOSE_CHORD_TEXT,
                'rounded-md border border-[var(--color-primary)]/40 bg-[var(--color-surface)] px-2 shadow-md',
              )}
            >
              {chordModeSelectedSymbol}
            </span>
          )}
        </div>
      ) : null}

      <DragOverlay dropAnimation={null}>
        {activeBarChordDragOverlay ? (
          <div
            style={{
              width: activeBarChordDragOverlay.width,
              height: activeBarChordDragOverlay.height,
            }}
            className="flex min-w-0 items-center justify-center overflow-hidden rounded-sm border border-[var(--color-primary)]/35 bg-[var(--color-primary)]/10 px-1 shadow-md"
          >
            <span className={COMPOSE_CHORD_TEXT}>{activeBarChordDragOverlay.symbol}</span>
          </div>
        ) : activePoolSymbol ? (
          <span
            className={cn(
              COMPOSE_CHORD_TEXT,
              'rounded-md border border-[var(--color-primary)]/40 bg-[var(--color-surface)] px-2 shadow-md',
            )}
          >
            {activePoolSymbol}
          </span>
        ) : activeLineChordDragId && activeDragPreviewSymbol ? (
          <span
            className={cn(
              COMPOSE_CHORD_TEXT,
              'rounded-md border border-[var(--color-primary)]/40 bg-[var(--color-surface)] px-2 shadow-md',
            )}
          >
            {activeDragPreviewSymbol}
          </span>
        ) : null}
      </DragOverlay>
    </DndContext>
    </ComposeChordModeContext.Provider>
    </ComposeLineChordDragContext.Provider>
  )
}
