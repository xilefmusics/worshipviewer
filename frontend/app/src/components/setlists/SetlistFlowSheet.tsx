import * as Dialog from '@radix-ui/react-dialog'
import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import { restrictToParentElement, restrictToVerticalAxis } from '@dnd-kit/modifiers'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import type { CSSProperties } from 'react'
import { useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import type { components } from '@/api/schema'
import { Button } from '@/components/ui/button'
import { buildFlowSourcePool, type FlowSourceSection } from '@/lib/player/custom-song-flow'
import { type FlowSlot, type SongFlow } from '@/lib/setlist-song-links'
import { cn } from '@/lib/utils'

type Song = components['schemas']['Song']

type DraftRow = {
  rowId: string
  slot: FlowSlot
}

type SetlistFlowSheetProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  song: Song | null | undefined
  value: SongFlow
  canEditUi: boolean
  blockingAll: boolean
  onApply: (flow: FlowSlot[]) => void
  onReset: () => void
}

function newRowId(): string {
  return globalThis.crypto.randomUUID()
}

function makeDraftRow(slot: FlowSlot): DraftRow {
  return {
    rowId: newRowId(),
    slot,
  }
}

function draftFromValue(pool: FlowSourceSection[], value: SongFlow): DraftRow[] {
  if (Array.isArray(value) && value.length > 0) {
    return value.map((slot) => makeDraftRow(slot))
  }
  return pool.map((source) =>
    makeDraftRow({
      section_title: source.section_title,
      occurrence_index: source.occurrence_index,
      repeat_count: 1,
    }),
  )
}

function sourceLabelForSlot(pool: FlowSourceSection[], slot: FlowSlot): string {
  return (
    pool.find(
      (source) =>
        source.section_title === slot.section_title &&
        source.occurrence_index === slot.occurrence_index,
    )?.label ?? slot.section_title
  )
}

export function SetlistFlowSheet({
  open,
  onOpenChange,
  song,
  value,
  canEditUi,
  blockingAll,
  onApply,
  onReset,
}: SetlistFlowSheetProps) {
  const { t } = useTranslation()
  const shouldReduceMotion = useReducedMotion()
  const pool = useMemo(() => buildFlowSourcePool(song?.data), [song?.data])
  const [draftRows, setDraftRows] = useState<DraftRow[]>(() => draftFromValue(pool, value))
  const [dragOffset, setDragOffset] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const pointerStartY = useRef<number | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  function onDragEnd(evt: DragEndEvent) {
    if (!canEditUi || blockingAll) return
    const { active, over } = evt
    if (!over || active.id === over.id) return
    setDraftRows((rows) => {
      const oldIndex = rows.findIndex((r) => r.rowId === active.id)
      const newIndex = rows.findIndex((r) => r.rowId === over.id)
      if (oldIndex < 0 || newIndex < 0) return rows
      return arrayMove(rows, oldIndex, newIndex)
    })
  }

  const canApply = canEditUi && !blockingAll && draftRows.length > 0

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next)
        if (!next) {
          setDragOffset(0)
          setIsDragging(false)
          pointerStartY.current = null
        }
      }}
    >
      <Dialog.Portal forceMount>
        <AnimatePresence>
          {open ? (
            <>
              <Dialog.Overlay forceMount asChild>
                <motion.div
                  className="fixed inset-0 z-[60] bg-black/40"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: shouldReduceMotion ? 0 : 0.18 }}
                />
              </Dialog.Overlay>
              <Dialog.Content forceMount asChild>
                <motion.div
                  className={cn(
                    'fixed inset-x-0 bottom-0 z-[61] flex max-h-[min(42rem,90dvh)] w-full flex-col gap-3 rounded-t-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-[var(--color-foreground)] shadow-[var(--shadow-elevated)]',
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
                      const nextOffset = Math.max(0, event.clientY - pointerStartY.current)
                      setDragOffset(nextOffset)
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
                  <Dialog.Title className="text-base font-semibold">
                    {t('setlists.editor.flowTitle')}
                  </Dialog.Title>
                  <p className="text-sm text-[var(--color-muted-foreground)]">
                    {t('setlists.editor.flowSubtitle')}
                  </p>

                  <div className="min-h-0 flex-1 overflow-y-auto pb-2">
                    <div className="grid gap-3">
                      <section className="grid gap-2">
                        <h3 className="text-sm font-medium">{t('setlists.editor.flowSourceTitle')}</h3>
                        {pool.length === 0 ? (
                          <p className="text-sm text-[var(--color-muted-foreground)]">
                            {t('setlists.editor.flowNoSources')}
                          </p>
                        ) : (
                          <div className="grid grid-cols-2 gap-2">
                            {pool.map((source) => (
                              <Button
                                key={`${source.section_title}-${source.occurrence_index}`}
                                type="button"
                                variant="outline"
                                size="sm"
                                className="justify-start"
                                disabled={!canEditUi || blockingAll}
                                onClick={() => {
                                  setDraftRows((rows) => [
                                    ...rows,
                                    makeDraftRow({
                                      section_title: source.section_title,
                                      occurrence_index: source.occurrence_index,
                                      repeat_count: 1,
                                    }),
                                  ])
                                }}
                              >
                                <span className="truncate">{source.label}</span>
                              </Button>
                            ))}
                          </div>
                        )}
                      </section>

                      <section className="grid gap-2">
                        <div className="flex items-center justify-between gap-2">
                          <h3 className="text-sm font-medium">{t('setlists.editor.flowSlotsTitle')}</h3>
                          <span className="text-xs text-[var(--color-muted-foreground)]">
                            {t('setlists.editor.flowSlotsCount', { count: draftRows.length })}
                          </span>
                        </div>
                        {draftRows.length === 0 ? (
                          <p className="text-sm text-[var(--color-muted-foreground)]">
                            {t('setlists.editor.flowEmpty')}
                          </p>
                        ) : (
                          <DndContext
                            sensors={sensors}
                            collisionDetection={closestCenter}
                            modifiers={[restrictToVerticalAxis, restrictToParentElement]}
                            onDragEnd={onDragEnd}
                          >
                            <SortableContext
                              items={draftRows.map((row) => row.rowId)}
                              strategy={verticalListSortingStrategy}
                            >
                              <ul className="flex flex-col gap-2">
                                {draftRows.map((row, index) => (
                                  <FlowRow
                                    key={row.rowId}
                                    row={row}
                                    index={index}
                                    sourceLabel={sourceLabelForSlot(pool, row.slot)}
                                    canEditUi={canEditUi}
                                    blockingAll={blockingAll}
                                    onRemove={() =>
                                      setDraftRows((rows) => rows.filter((candidate) => candidate.rowId !== row.rowId))
                                    }
                                    onRepeatChange={(delta) =>
                                      setDraftRows((rows) =>
                                        rows.map((candidate) => {
                                          if (candidate.rowId !== row.rowId) return candidate
                                          const nextRepeat = Math.max(1, candidate.slot.repeat_count + delta)
                                          return {
                                            ...candidate,
                                            slot: { ...candidate.slot, repeat_count: nextRepeat },
                                          }
                                        }),
                                      )
                                    }
                                  />
                                ))}
                              </ul>
                            </SortableContext>
                          </DndContext>
                        )}
                      </section>
                    </div>
                  </div>

                  <div className="flex flex-col gap-2 pt-1">
                    {!canApply ? (
                      <p className="text-xs text-[var(--color-muted-foreground)]">
                        {draftRows.length === 0
                          ? t('setlists.editor.flowApplyEmpty')
                          : t('setlists.editor.waitForSave')}
                      </p>
                    ) : null}
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        className="flex-1"
                        onClick={() => {
                          if (!canApply) return
                          onApply(draftRows.map((row) => row.slot))
                          onOpenChange(false)
                        }}
                        disabled={!canApply}
                      >
                        {t('setlists.editor.flowApply')}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="flex-1"
                        disabled={!canEditUi || blockingAll}
                        onClick={() => {
                          onReset()
                          onOpenChange(false)
                        }}
                      >
                        {t('setlists.editor.flowReset')}
                      </Button>
                    </div>
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

type FlowRowProps = {
  row: DraftRow
  index: number
  sourceLabel: string
  canEditUi: boolean
  blockingAll: boolean
  onRemove: () => void
  onRepeatChange: (delta: number) => void
}

const FlowRow = function FlowRow({
  row,
  index,
  sourceLabel,
  canEditUi,
  blockingAll,
  onRemove,
  onRepeatChange,
}: FlowRowProps) {
  const { t } = useTranslation()
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: row.rowId,
    disabled: blockingAll || !canEditUi,
  })

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.85 : undefined,
    zIndex: isDragging ? 20 : undefined,
  }

  return (
    <li
      ref={setNodeRef}
      style={style}
      className="flex rounded-lg border border-[var(--color-border)] bg-[var(--color-background)]"
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        className={cn(
          'flex w-10 shrink-0 cursor-grab touch-none items-center justify-center self-stretch rounded-l-lg border-0 border-r border-[var(--color-border)] bg-transparent text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)]/40 active:cursor-grabbing',
          (blockingAll || !canEditUi) && 'pointer-events-none opacity-35',
        )}
        aria-label={t('setlists.editor.dragHandleAria')}
      >
        ::
      </button>
      <div className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{sourceLabel}</p>
          <p className="text-xs text-[var(--color-muted-foreground)]">
            {t('setlists.editor.flowOccurrence', { index: index + 1 })}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="outline"
            size="icon"
            disabled={blockingAll || !canEditUi || row.slot.repeat_count <= 1}
            aria-label={t('setlists.editor.flowRepeatDown')}
            onClick={() => onRepeatChange(-1)}
          >
            −
          </Button>
          <span className="min-w-9 text-center text-sm tabular-nums">{row.slot.repeat_count}</span>
          <Button
            type="button"
            variant="outline"
            size="icon"
            disabled={blockingAll || !canEditUi}
            aria-label={t('setlists.editor.flowRepeatUp')}
            onClick={() => onRepeatChange(1)}
          >
            +
          </Button>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          disabled={blockingAll || !canEditUi}
          aria-label={t('setlists.editor.removeAria')}
          onClick={onRemove}
        >
          ×
        </Button>
      </div>
    </li>
  )
}
