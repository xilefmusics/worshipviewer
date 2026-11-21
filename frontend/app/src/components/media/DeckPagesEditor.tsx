import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { SortableContext, arrayMove, rectSortingStrategy, sortableKeyboardCoordinates, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Fragment, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { AvSlideView } from '@/components/player/av/AvSlideView'
import { readAvPreferences } from '@/lib/player/av-preferences'
import { DeckPagePreview } from '@/components/media/DeckPagePreview'
import { PencilIcon } from '@/components/icons/lucide-animated/pencil-icon'
import { TrashIcon } from '@/components/icons/lucide-animated/trash-icon'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'

// Flow: M3 — pointer, touch, and keyboard reorder of draft pages

export type DeckEditorPage = { id: string; blob_id: string; markdown?: string; section_title?: string | null }

function normalizeSectionTitle(value: string): string | null {
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function sectionStartCount(pages: DeckEditorPage[], pageIndex: number): number {
  let count = 0
  for (let index = 0; index < pageIndex; index += 1) {
    const page = pages[index]
    if (!page) continue
    if (index === 0 || normalizeSectionTitle(page.section_title ?? '') !== null) {
      count += 1
    }
  }
  return count
}

function sectionNumberForPage(pages: DeckEditorPage[], pageIndex: number): number {
  return sectionStartCount(pages, pageIndex) + 1
}

export function DeckPagesEditor({
  mediaId,
  pages,
  disabled,
  uploadsDisabled,
  onReorder,
  onAddMarkdown,
  onMarkdownChange,
  onRemove,
  onReplace,
  onAdd,
  onSectionTitleChange,
  onRemoveSection,
}: {
  mediaId: string
  pages: DeckEditorPage[]
  disabled?: boolean
  uploadsDisabled?: boolean
  onReorder: (pages: DeckEditorPage[]) => void
  onAddMarkdown: () => void
  onMarkdownChange: (id: string, markdown: string) => void
  onRemove: (id: string) => void
  onReplace: (id: string, file: File) => void
  onAdd: (files: File[], insertionIndex: number) => void
  onSectionTitleChange: (id: string, sectionTitle: string | null) => void
  onRemoveSection: (id: string) => void
}) {
  const { t } = useTranslation()
  const addRef = useRef<HTMLInputElement>(null)
  const addAtIndex = useRef(0)
  const replaceRef = useRef<HTMLInputElement>(null)
  const replaceId = useRef<string | null>(null)
  const [hoveredSectionBreak, setHoveredSectionBreak] = useState<number | null>(null)
  const [openAddMenu, setOpenAddMenu] = useState<string | null>(null)
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(() => new Set())
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  function onDragEnd(event: DragEndEvent) {
    if (disabled) return
    const { active, over } = event
    if (!over || active.id === over.id) return
    if (active.data.current?.type === 'section') {
      const sourceIndex = pages.findIndex((page) => page.id === active.data.current?.pageId)
      const targetId = String(over.id).replace(/^section:/, '')
      const targetIndex = pages.findIndex((page) => page.id === targetId)
      if (sourceIndex < 0 || targetIndex < 0) return
      const sourceEnd = pages.findIndex(
        (page, index) => index > sourceIndex && normalizeSectionTitle(page.section_title ?? '') !== null,
      )
      const sourceLimit = sourceEnd < 0 ? pages.length : sourceEnd
      if (targetIndex >= sourceIndex && targetIndex < sourceLimit) return
      const sourcePages = pages.slice(sourceIndex, sourceEnd < 0 ? pages.length : sourceEnd)
      const remaining = pages.filter((_, index) => index < sourceIndex || index >= (sourceEnd < 0 ? pages.length : sourceEnd))
      let targetStart = targetIndex
      while (targetStart > 0 && normalizeSectionTitle(pages[targetStart]?.section_title ?? '') === null) {
        targetStart -= 1
      }
      let insertionIndex = targetStart
      if (sourceIndex < targetStart) {
        const targetEnd = pages.findIndex(
          (page, index) => index > targetStart && normalizeSectionTitle(page.section_title ?? '') !== null,
        )
        insertionIndex = (targetEnd < 0 ? pages.length : targetEnd) - sourcePages.length
      }
      onReorder([
        ...remaining.slice(0, insertionIndex),
        ...sourcePages,
        ...remaining.slice(insertionIndex),
      ])
      return
    }
    const oldIndex = pages.findIndex((page) => page.id === active.id)
    const newIndex = pages.findIndex((page) => page.id === over.id)
    if (oldIndex < 0 || newIndex < 0) return
    onReorder(arrayMove(pages, oldIndex, newIndex))
  }

  return (
    <div className="grid gap-3 pb-4">
      <input
        ref={addRef}
        disabled={disabled || uploadsDisabled}
        type="file"
        className="hidden"
        accept="image/png,image/jpeg,image/svg+xml,application/pdf,.png,.jpg,.jpeg,.svg,.pdf"
        multiple
        onChange={(event) => {
          const files = [...(event.target.files ?? [])]
          if (files.length) onAdd(files, addAtIndex.current)
          event.target.value = ''
        }}
      />
      <input
        ref={replaceRef}
        disabled={disabled || uploadsDisabled}
        type="file"
        className="hidden"
        accept="image/png,image/jpeg,image/svg+xml,application/pdf,.png,.jpg,.jpeg,.svg,.pdf"
        onChange={(event) => {
          const file = event.target.files?.[0]
          const pageId = replaceId.current
          if (file && pageId) onReplace(pageId, file)
          event.target.value = ''
          replaceId.current = null
        }}
      />
      <div className="grid gap-2 sm:grid-cols-2">
        <Button type="button" variant="outline" disabled={disabled} onClick={onAddMarkdown}>
          {t('media.deck.addMarkdown')}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={disabled || uploadsDisabled}
          onClick={() => {
            addAtIndex.current = pages.length
            addRef.current?.click()
          }}
        >
          {t('media.deck.uploadSlides')}
        </Button>
      </div>
      {pages.length === 0 ? (
        <p className="text-sm text-[var(--color-muted-foreground)]">{t('media.deck.empty')}</p>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={pages.map((page) => page.id)} strategy={rectSortingStrategy}>
            <ol className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-label={t('media.deck.listAria')}>
              {pages.map((page, index) => {
                let sectionStartIndex = index
                while (
                  sectionStartIndex > 0 &&
                  normalizeSectionTitle(pages[sectionStartIndex]?.section_title ?? '') === null
                ) {
                  sectionStartIndex -= 1
                }
                const sectionStart = pages[sectionStartIndex]
                const hasSectionMarker = normalizeSectionTitle(sectionStart?.section_title ?? '') !== null
                const sectionCollapsed = hasSectionMarker && collapsedSections.has(sectionStart?.id ?? '')
                return (
                  <Fragment key={page.id}>
                    {normalizeSectionTitle(page.section_title ?? '') ? (
                      <SectionHeader
                        page={page}
                        number={sectionNumberForPage(pages, index)}
                        disabled={disabled}
                        collapsed={sectionCollapsed}
                        onToggleCollapsed={() => {
                          setCollapsedSections((current) => {
                            const next = new Set(current)
                            if (next.has(page.id)) next.delete(page.id)
                            else next.add(page.id)
                            return next
                          })
                        }}
                        onTitleChange={(sectionTitle) => onSectionTitleChange(page.id, sectionTitle)}
                        onRemove={() => onRemoveSection(page.id)}
                        onRemoveSlides={() => {
                          const sectionEnd = pages.findIndex(
                            (candidate, candidateIndex) =>
                              candidateIndex > index && normalizeSectionTitle(candidate.section_title ?? '') !== null,
                          )
                          const end = sectionEnd < 0 ? pages.length : sectionEnd
                          onReorder(pages.filter((_, pageIndex) => pageIndex < index || pageIndex >= end))
                        }}
                      />
                    ) : null}
                    {!sectionCollapsed ? (
                      <DeckPageGroup
                        mediaId={mediaId}
                        page={page}
                        index={index}
                        disabled={disabled}
                        onMarkdownChange={(markdown) => onMarkdownChange(page.id, markdown)}
                        onRemove={() => onRemove(page.id)}
                        onReplace={() => {
                          replaceId.current = page.id
                          replaceRef.current?.click()
                        }}
                        onSectionTitleChange={onSectionTitleChange}
                        sectionBreakHovered={hoveredSectionBreak === index + 1}
                        sectionBreakBeforeHovered={hoveredSectionBreak === index}
                        onSectionBreakEnter={() => setHoveredSectionBreak(index + 1)}
                        onBeforeSectionBreakEnter={() => setHoveredSectionBreak(index)}
                        onSectionBreakLeave={() => {
                          setHoveredSectionBreak(null)
                        }}
                        onBeforeSectionBreakLeave={() => setHoveredSectionBreak(null)}
                        addMenuOpen={openAddMenu === `after:${index}`}
                        beforeAddMenuOpen={openAddMenu === `before:${index}`}
                        onToggleAddMenu={() =>
                          setOpenAddMenu((current) => (current === `after:${index}` ? null : `after:${index}`))
                        }
                        onToggleBeforeAddMenu={() => {
                          const boundaryKey = `before:${index}`
                          setOpenAddMenu((current) => (current === boundaryKey ? null : boundaryKey))
                        }}
                        onAddSlides={(insertionIndex) => {
                          setOpenAddMenu(null)
                          addAtIndex.current = insertionIndex
                          addRef.current?.click()
                        }}
                        nextPage={pages[index + 1]}
                        onStartSection={() => {
                          setOpenAddMenu(null)
                          if (pages[index + 1]) {
                            onSectionTitleChange(
                              pages[index + 1].id,
                              `Section ${sectionNumberForPage(pages, index + 1)}`,
                            )
                          }
                        }}
                        onStartBeforeSection={() => {
                          setOpenAddMenu(null)
                          onSectionTitleChange(page.id, `Section ${sectionNumberForPage(pages, index)}`)
                        }}
                      />
                    ) : null}
                  </Fragment>
                )
              })}
            </ol>
          </SortableContext>
        </DndContext>
      )}
    </div>
  )
}

function SectionHeader({
  page,
  number,
  disabled,
  collapsed,
  onToggleCollapsed,
  onTitleChange,
  onRemove,
  onRemoveSlides,
}: {
  page: DeckEditorPage
  number: number
  disabled?: boolean
  collapsed: boolean
  onToggleCollapsed: () => void
  onTitleChange: (sectionTitle: string | null) => void
  onRemove: () => void
  onRemoveSlides: () => void
}) {
  const { t } = useTranslation()
  const [removeDialogOpen, setRemoveDialogOpen] = useState(false)
  const { attributes, listeners, setNodeRef } = useDraggable({
    id: `section:${page.id}`,
    data: { type: 'section', pageId: page.id },
    disabled,
  })
  const { setNodeRef: setDropNodeRef } = useDroppable({
    id: `section:${page.id}`,
    disabled,
  })
  return (
    <li ref={setDropNodeRef} className="col-span-full flex min-w-0 items-center gap-2">
      <button
        ref={setNodeRef}
        type="button"
        className="flex size-8 shrink-0 cursor-grab items-center justify-center rounded text-lg text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)] active:cursor-grabbing"
        aria-label={t('media.deck.sectionHandle', { number })}
        disabled={disabled}
        {...attributes}
        {...listeners}
      >
        <span aria-hidden>⋮⋮</span>
      </button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-8 shrink-0 text-[var(--color-muted-foreground)]"
        aria-label={t(collapsed ? 'media.deck.expandSection' : 'media.deck.collapseSection', { number })}
        aria-expanded={!collapsed}
        disabled={disabled}
        onClick={onToggleCollapsed}
      >
        <span aria-hidden>{collapsed ? '▸' : '▾'}</span>
      </Button>
      <Input
        value={page.section_title ?? ''}
        onChange={(event) => onTitleChange(event.target.value || null)}
        disabled={disabled}
        aria-label={t('media.deck.sectionTitleAria', { number })}
        placeholder={t('media.deck.sectionDefault', { number })}
        className="h-9 min-w-0 flex-1 border-0 border-b border-[var(--color-border)] bg-transparent px-0 text-sm font-medium shadow-none focus-visible:outline-none focus-visible:ring-0"
      />
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-8 shrink-0 text-[var(--color-muted-foreground)] hover:text-[var(--color-destructive)]"
        aria-label={t('media.deck.removeSection')}
        title={t('media.deck.removeSection')}
        disabled={disabled}
        onClick={() => setRemoveDialogOpen(true)}
      >
        <span aria-hidden>×</span>
      </Button>
      <AlertDialog open={removeDialogOpen} onOpenChange={setRemoveDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('media.deck.removeSectionTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('media.deck.removeSectionDescription')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="sm:flex-col sm:items-stretch">
            <AlertDialogCancel className="w-full">{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction className="w-full" onClick={onRemove}>
              {t('media.deck.removeSectionMarker')}
            </AlertDialogAction>
            <AlertDialogAction
              className="w-full bg-[var(--color-danger)] text-white hover:bg-[var(--color-danger)]/90"
              onClick={onRemoveSlides}
            >
              {t('media.deck.removeSectionSlides')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </li>
  )
}

function DeckPageGroup({
  mediaId,
  page,
  index,
  disabled,
  onRemove,
  onReplace,
  onMarkdownChange,
  onSectionTitleChange,
  sectionBreakHovered,
  sectionBreakBeforeHovered,
  onSectionBreakEnter,
  onBeforeSectionBreakEnter,
  onSectionBreakLeave,
  onBeforeSectionBreakLeave,
  addMenuOpen,
  beforeAddMenuOpen,
  onToggleAddMenu,
  onToggleBeforeAddMenu,
  onAddSlides,
  nextPage,
  onStartSection,
  onStartBeforeSection,
}: {
  mediaId: string
  page: DeckEditorPage
  index: number
  disabled?: boolean
  onRemove: () => void
  onReplace: () => void
  onMarkdownChange: (markdown: string) => void
  onSectionTitleChange: (id: string, sectionTitle: string | null) => void
  sectionBreakHovered: boolean
  sectionBreakBeforeHovered: boolean
  onSectionBreakEnter: () => void
  onBeforeSectionBreakEnter: () => void
  onSectionBreakLeave: () => void
  onBeforeSectionBreakLeave: () => void
  addMenuOpen: boolean
  beforeAddMenuOpen: boolean
  onToggleAddMenu: () => void
  onToggleBeforeAddMenu: () => void
  onAddSlides: (insertionIndex: number) => void
  nextPage?: DeckEditorPage
  onStartSection: () => void
  onStartBeforeSection: () => void
}) {
  const { t } = useTranslation()
  const [preferences] = useState(readAvPreferences)
  const [clearSectionHot, setClearSectionHot] = useState(false)
  const [replaceHot, setReplaceHot] = useState(false)
  const [removeHot, setRemoveHot] = useState(false)
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: page.id,
    disabled,
  })
  const sectionTitle = normalizeSectionTitle(page.section_title ?? '')
  const isSectionStart = index === 0 || sectionTitle !== null
  const label = t('media.deck.pageLabel', { number: index + 1 })
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild disabled={disabled}>
        <li
          ref={setNodeRef}
          style={{ transform: CSS.Transform.toString(transform), transition }}
          className={`group relative cursor-grab select-none outline-none active:cursor-grabbing focus-visible:ring-2 focus-visible:ring-[var(--color-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-background)] ${isDragging ? 'z-10 opacity-70' : ''}`}
          aria-label={t('media.deck.reorderHandle', { number: index + 1 })}
          {...attributes}
          {...listeners}
        >
          {page.markdown !== undefined ? (
            <div onPointerDown={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()} className="grid gap-2">
              <div className="aspect-video overflow-hidden bg-black">
                <AvSlideView preview markdown={page.markdown} contentLayer={preferences.contentLayer} backgroundLayer={preferences.backgroundLayer} geometryOverlay={preferences.geometryOverlay} geometryOverlayOpacity={preferences.geometryOverlayOpacity} geometryOverlayColor={preferences.geometryOverlayColor} geometryOverlaySize={preferences.geometryOverlaySize} geometryOverlayThickness={preferences.geometryOverlayThickness} geometryOverlayRotatedBackground={preferences.geometryOverlayRotatedBackground} transition={preferences.transition} screenState="live" />
              </div>
              <textarea aria-label={t('media.deck.markdownSource', { number: index + 1 })} value={page.markdown} disabled={disabled} onChange={(event) => onMarkdownChange(event.target.value)} className="min-h-28 w-full rounded border border-[var(--color-border)] bg-[var(--color-background)] p-2 text-sm" />
            </div>
          ) : (
            <DeckPagePreview mediaId={mediaId} blobId={page.blob_id} label={label} className={`transition-transform duration-200 ease-out ${sectionBreakHovered ? 'max-sm:-translate-y-2 sm:-translate-x-4' : ''} ${sectionBreakBeforeHovered ? 'max-sm:translate-y-2 sm:translate-x-4' : ''}`} />
          )}
          <AddBoundaryControl
            placement="before"
            menuOpen={beforeAddMenuOpen}
            disabled={disabled}
            onMouseEnter={onBeforeSectionBreakEnter}
            onMouseLeave={onBeforeSectionBreakLeave}
            onToggleMenu={onToggleBeforeAddMenu}
            onAddSlides={() => onAddSlides(index)}
            onStartSection={onStartBeforeSection}
          />
          <AddBoundaryControl
            placement="after"
            menuOpen={addMenuOpen}
            disabled={disabled}
            onMouseEnter={onSectionBreakEnter}
            onMouseLeave={onSectionBreakLeave}
            onToggleMenu={onToggleAddMenu}
            onAddSlides={() => onAddSlides(index + 1)}
            onStartSection={nextPage ? onStartSection : undefined}
          />
        </li>
      </ContextMenuTrigger>
      <ContextMenuContent>
        {isSectionStart ? (
          <>
            <ContextMenuItem
              className="gap-2"
              disabled={disabled}
              onSelect={() => onSectionTitleChange(page.id, null)}
              onMouseEnter={() => setClearSectionHot(true)}
              onMouseLeave={() => setClearSectionHot(false)}
              onFocus={() => setClearSectionHot(true)}
              onBlur={() => setClearSectionHot(false)}
            >
              <TrashIcon isHovered={clearSectionHot} size={16} className="shrink-0" />
              {t('media.deck.clearSection')}
            </ContextMenuItem>
            <ContextMenuSeparator />
          </>
        ) : null}
        <ContextMenuItem
          className="gap-2"
          disabled={disabled || page.markdown !== undefined}
          onSelect={onReplace}
          onMouseEnter={() => setReplaceHot(true)}
          onMouseLeave={() => setReplaceHot(false)}
          onFocus={() => setReplaceHot(true)}
          onBlur={() => setReplaceHot(false)}
        >
          <PencilIcon isHovered={replaceHot} size={16} className="shrink-0" />
          {t('media.deck.replacePage')}
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          className="text-[var(--color-destructive)] focus:bg-[var(--color-destructive)]/10 focus:text-[var(--color-destructive)]"
          disabled={disabled}
          onSelect={onRemove}
          onMouseEnter={() => setRemoveHot(true)}
          onMouseLeave={() => setRemoveHot(false)}
          onFocus={() => setRemoveHot(true)}
          onBlur={() => setRemoveHot(false)}
        >
          <TrashIcon isHovered={removeHot} size={16} className="mr-2 shrink-0" />
          {t('media.deck.removePage')}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}

function AddBoundaryControl({
  placement,
  menuOpen,
  disabled,
  onMouseEnter,
  onMouseLeave,
  onToggleMenu,
  onAddSlides,
  onStartSection,
}: {
  placement: 'before' | 'after'
  menuOpen: boolean
  disabled?: boolean
  onMouseEnter: () => void
  onMouseLeave: () => void
  onToggleMenu: () => void
  onAddSlides: () => void
  onStartSection?: () => void
}) {
  const { t } = useTranslation()
  const isBefore = placement === 'before'
  return (
    <div
      className={`group/section-break pointer-events-auto absolute z-20 flex items-center justify-center opacity-0 transition-opacity hover:opacity-100 focus-within:opacity-100 ${
        isBefore
          ? '-left-6 top-1/2 h-8 w-8 -translate-y-1/2'
          : '-right-6 top-1/2 h-8 w-8 -translate-y-1/2'
      }`}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="z-10 size-6 border-0 bg-transparent p-0 text-xl leading-none"
        disabled={disabled}
        onClick={onToggleMenu}
        aria-label={t('media.deck.startSection')}
      >
        <span aria-hidden>+</span>
      </Button>
      {menuOpen ? (
        <div className="absolute left-1/2 top-full z-30 mt-2 flex min-w-36 -translate-x-1/2 flex-col gap-0.5 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-1 shadow-[var(--shadow-elevated)]">
          <Button type="button" variant="ghost" size="sm" className="justify-start whitespace-nowrap text-xs" disabled={disabled} onClick={onAddSlides}>
            {t('media.deck.addSlides')}
          </Button>
          {onStartSection ? (
            <Button type="button" variant="ghost" size="sm" className="justify-start whitespace-nowrap text-xs" disabled={disabled} onClick={onStartSection}>
              {t('media.deck.startSection')}
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
