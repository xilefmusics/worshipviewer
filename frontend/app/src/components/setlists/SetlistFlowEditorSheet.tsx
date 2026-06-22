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
import * as Dialog from '@radix-ui/react-dialog'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import type { CSSProperties } from 'react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { getChordEngine } from '@/lib/chord-engine'
import { isSongFlowValid } from '@/lib/player/resolve-song-flow'
import type { SongFlowItem } from '@/ports/chord-engine'
import type { components } from '@/api/schema'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'

type Song = components['schemas']['Song']

type FlowRow = {
  id: string
  item: SongFlowItem
}

function newFlowRow(item: SongFlowItem): FlowRow {
  return { id: globalThis.crypto.randomUUID(), item: { ...item } }
}

function cloneFlowItem(item: SongFlowItem): SongFlowItem {
  return {
    title: item.title,
    occurrence_index: item.occurrence_index,
    repeats: item.repeats,
  }
}

function flowItemKey(item: SongFlowItem): string {
  return JSON.stringify([item.title, item.occurrence_index])
}

function flowItemLabel(item: SongFlowItem): { title: string; suffix: string | null } {
  return {
    title: item.title,
    suffix: item.occurrence_index > 0 ? `(${item.occurrence_index + 1})` : null,
  }
}

function flowRowLabel(row: FlowRow): string {
  const { title, suffix } = flowItemLabel(row.item)
  return suffix ? `${title} ${suffix}` : title
}

function flowRowsToItems(rows: FlowRow[]): SongFlowItem[] {
  return rows.map((row) => cloneFlowItem(row.item))
}

function flowItemInPool(item: SongFlowItem, pool: SongFlowItem[]): boolean {
  return pool.some(
    (candidate) =>
      candidate.title === item.title && candidate.occurrence_index === item.occurrence_index,
  )
}

function flowRowsFromItems(items: SongFlowItem[]): FlowRow[] {
  return items.map((item) => newFlowRow(item))
}

function sortableRowKey(index: number): string {
  return String(index)
}

function FlowSortableRow({
  row,
  index,
  pool,
  onChangeItem,
  onChangeRepeats,
  onRemove,
  canEdit,
}: {
  row: FlowRow
  index: number
  pool: SongFlowItem[]
  onChangeItem: (next: SongFlowItem) => void
  onChangeRepeats: (next: number) => void
  onRemove: () => void
  canEdit: boolean
}) {
  const { t } = useTranslation()
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: sortableRowKey(index),
    disabled: !canEdit,
  })

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.85 : undefined,
    zIndex: isDragging ? 20 : undefined,
  }

  const selectedKey = flowItemKey(row.item)
  const selectedLabel = flowRowLabel(row)
  const rowInPool = flowItemInPool(row.item, pool)
  const rowLabel = rowInPool ? selectedLabel : t('setlists.editor.flowStaleRowMissing', { section: selectedLabel })

  return (
    <li
      ref={setNodeRef}
      style={style}
      className="flex rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)]"
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        className={cn(
          'flex w-10 shrink-0 cursor-grab touch-none items-center justify-center self-stretch rounded-l-lg border-0 border-r border-[var(--color-border)] bg-transparent text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)]/40 active:cursor-grabbing',
          !canEdit && 'pointer-events-none opacity-35',
        )}
        aria-label={t('setlists.editor.dragHandleAria')}
      >
        ::
      </button>

      <div className="grid min-w-0 flex-1 gap-2 px-3 py-3">
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
          {rowInPool ? (
            <Select
              value={selectedKey}
              onValueChange={(value) => {
                const [title, occurrence] = JSON.parse(value) as [string, number]
                const source = pool.find(
                  (item) => item.title === title && item.occurrence_index === occurrence,
                )
                if (!source) return
                onChangeItem(source)
              }}
              disabled={!canEdit}
            >
              <SelectTrigger className="min-w-0 font-normal shadow-sm">
                <SelectValue placeholder={selectedLabel} />
              </SelectTrigger>
              <SelectContent>
                {pool.map((item) => {
                  const label = flowItemLabel(item)
                  const key = flowItemKey(item)
                  return (
                    <SelectItem key={key} value={key}>
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="truncate">{label.title}</span>
                        {label.suffix ? <span className="text-xs text-[var(--color-muted-foreground)]">{label.suffix}</span> : null}
                      </span>
                    </SelectItem>
                  )
                })}
              </SelectContent>
            </Select>
          ) : (
            <div
              className="flex h-9 min-w-0 items-center rounded-md border border-[var(--color-danger)]/50 bg-[var(--color-danger)]/10 px-3 text-sm text-[var(--color-danger)]"
              title={rowLabel}
            >
              <span className="truncate">{rowLabel}</span>
            </div>
          )}

          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={t('setlists.editor.removeAria')}
            onClick={onRemove}
            disabled={!canEdit}
          >
            ×
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-[var(--color-muted-foreground)]">
            {t('setlists.editor.flowRepeats')}
          </span>
          <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label={t('setlists.editor.flowRepeatsDecrease')}
            disabled={!canEdit || row.item.repeats <= 1}
            onClick={() => onChangeRepeats(Math.max(1, row.item.repeats - 1))}
          >
            −
          </Button>
            <span className="min-w-8 text-center text-sm tabular-nums">{row.item.repeats}</span>
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label={t('setlists.editor.flowRepeatsIncrease')}
              disabled={!canEdit}
              onClick={() => onChangeRepeats(row.item.repeats + 1)}
            >
              +
            </Button>
          </div>
        </div>
      </div>
    </li>
  )
}

export function SetlistFlowEditorSheet({
  open,
  onOpenChange,
  song,
  flow,
  isStale = false,
  canEdit,
  blockingAll,
  onSave,
  onReset,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  song: Song | null
  flow: SongFlowItem[] | null | undefined
  isStale?: boolean
  canEdit: boolean
  blockingAll: boolean
  onSave: (flow: SongFlowItem[]) => void
  onReset: () => void
}) {
  const { t } = useTranslation()
  const shouldReduceMotion = useReducedMotion()
  const [pool, setPool] = useState<SongFlowItem[]>([])
  const [draftRows, setDraftRows] = useState<FlowRow[]>([])
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [dragOffset, setDragOffset] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const pointerStartY = useRef<number | null>(null)

  useEffect(() => {
    if (!open || !song) {
      queueMicrotask(() => {
        setPool([])
        setDraftRows([])
        setLoading(false)
        setLoadError(null)
        setSaveError(null)
      })
      return
    }

    let cancelled = false
    queueMicrotask(() => {
      if (cancelled) return
      setLoading(true)
      setLoadError(null)
      setSaveError(null)
    })
    void (async () => {
      try {
        const engine = await getChordEngine()
        const available = engine.flowItems(song.data as Record<string, unknown>)
        const base = flow ?? engine.customFlow(song.data as Record<string, unknown>)
        if (cancelled) return
        setPool(available)
        setDraftRows(flowRowsFromItems(base))
      } catch (error) {
        if (cancelled) return
        setLoadError(error instanceof Error ? error.message : String(error))
        setPool([])
        setDraftRows([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [flow, open, song])

  const canInteract = canEdit && !blockingAll && !loading && !loadError && pool.length > 0
  const canSave = canInteract && draftRows.length > 0
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const items = draftRows.map((_, index) => sortableRowKey(index))

  function onDragEnd(evt: DragEndEvent) {
    if (!canInteract) return
    const { active, over } = evt
    if (!over || active.id === over.id) return
    const oldIndex = Number(active.id)
    const newIndex = Number(over.id)
    if (!Number.isInteger(oldIndex) || !Number.isInteger(newIndex)) return
    setDraftRows((rows) => arrayMove(rows, oldIndex, newIndex))
  }

  const sourceMissing = pool.length === 0

  function closeDrawer() {
    onOpenChange(false)
    setDragOffset(0)
    setIsDragging(false)
    pointerStartY.current = null
  }

  const body = (
    <>
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
            closeDrawer()
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

      <div className="flex items-start justify-between gap-4 border-b border-[var(--color-border)] pb-4">
        <div className="min-w-0">
          <Dialog.Title className="text-lg font-semibold">{t('setlists.editor.flowEditorTitle')}</Dialog.Title>
          <Dialog.Description className="mt-1 text-sm text-[var(--color-muted-foreground)]">
            {t('setlists.editor.flowEditorDescription')}
          </Dialog.Description>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={closeDrawer}>
          {t('setlists.editor.flowCancel')}
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto py-4">
        {loading ? (
          <p className="text-sm text-[var(--color-muted-foreground)]">{t('common.load')}</p>
        ) : null}
        {loadError ? (
          <div className="rounded-lg border border-[var(--color-danger)]/50 bg-[var(--color-danger)]/10 px-3 py-2 text-sm">
            {loadError}
          </div>
        ) : null}
        {!loading && !loadError ? (
          <>
            {isStale ? (
              <div className="mb-3 rounded-lg border border-[var(--color-danger)]/50 bg-[var(--color-danger)]/10 px-3 py-2 text-sm">
                <p className="font-medium text-[var(--color-danger)]">
                  {t('setlists.editor.flowStaleWarning')}
                </p>
                <p className="mt-1 text-[var(--color-muted-foreground)]">
                  {t('setlists.editor.flowStalePlaybackNote')}
                </p>
              </div>
            ) : null}
            <p className="text-sm text-[var(--color-muted-foreground)]">
              {sourceMissing
                ? t('setlists.editor.flowUnsupported')
                : t('setlists.editor.flowPoolHint', { count: pool.length })}
            </p>

            {draftRows.length === 0 ? (
              <p className="mt-3 text-sm text-[var(--color-danger)]">
                {t('setlists.editor.flowEmptyWarning')}
              </p>
            ) : null}

            {saveError ? (
              <p className="mt-3 text-sm text-[var(--color-danger)]">{saveError}</p>
            ) : null}

            {draftRows.length > 0 ? (
              <div className="mt-4">
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  modifiers={[restrictToVerticalAxis, restrictToParentElement]}
                  onDragEnd={onDragEnd}
                >
                  <SortableContext items={items} strategy={verticalListSortingStrategy}>
                    <ul className="flex flex-col gap-2">
                      {draftRows.map((row, index) => (
                        <FlowSortableRow
                          key={row.id}
                          row={row}
                          index={index}
                          pool={pool}
                          canEdit={canInteract}
                          onChangeItem={(next) => {
                            setDraftRows((rows) => {
                              const copy = [...rows]
                              const current = copy[index]
                              if (!current) return rows
                              copy[index] = { ...current, item: cloneFlowItem(next) }
                              return copy
                            })
                          }}
                          onChangeRepeats={(next) => {
                            setDraftRows((rows) => {
                              const copy = [...rows]
                              const current = copy[index]
                              if (!current) return rows
                              copy[index] = {
                                ...current,
                                item: { ...current.item, repeats: Math.max(1, Math.floor(next)) },
                              }
                              return copy
                            })
                          }}
                          onRemove={() => {
                            setDraftRows((rows) => rows.filter((_, i) => i !== index))
                          }}
                        />
                      ))}
                    </ul>
                  </SortableContext>
                </DndContext>
              </div>
            ) : null}
          </>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--color-border)] pt-4">
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={!canInteract || pool.length === 0}
            onClick={() => {
              const base = pool[0]
              if (!base) return
              setDraftRows((rows) => [...rows, newFlowRow({ ...base, repeats: 1 })])
            }}
          >
            {t('setlists.editor.flowAddSection')}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={!canEdit || blockingAll}
            onClick={() => {
              onReset()
              closeDrawer()
            }}
          >
            {t('setlists.editor.flowReset')}
          </Button>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={blockingAll}
            onClick={closeDrawer}
          >
            {t('setlists.editor.flowCancel')}
          </Button>
          <Button
            type="button"
            disabled={!canSave}
            onClick={() => {
              void (async () => {
                if (!song) return
                try {
                  const engine = await getChordEngine()
                  const items = flowRowsToItems(draftRows)
                  if (!isSongFlowValid(engine, song.data as Record<string, unknown>, items)) {
                    setSaveError(t('setlists.editor.flowStaleSaveBlocked'))
                    return
                  }
                  setSaveError(null)
                  onSave(items)
                  closeDrawer()
                } catch (error) {
                  setSaveError(error instanceof Error ? error.message : String(error))
                }
              })()
            }}
          >
            {t('setlists.editor.flowSave')}
          </Button>
        </div>
      </div>
    </>
  )

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
                    'fixed inset-x-0 bottom-0 z-[61] flex max-h-[min(44rem,92dvh)] w-full flex-col gap-4 rounded-t-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] text-[var(--color-foreground)] shadow-[var(--shadow-elevated)]',
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
                  {body}
                </motion.div>
              </Dialog.Content>
            </>
          ) : null}
        </AnimatePresence>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
