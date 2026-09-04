import type { components } from '@/api/schema'
import { Fragment, useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { TocSortAlphabeticalIcon, TocSortLikedIcon, TocSortOrderIcon } from '@/components/icons/toc-sort-icons'
import { useTocMultilingualPreference } from '@/hooks/useTocMultilingualPreference'
import { PLAYER_TOC_WIDTH_CLASS } from '@/lib/player/player-chrome'
import { displayTocEntries, tocDisplayNr, type TocDisplayEntry, type TocDisplayMode } from '@/lib/player/toc-display'
import { buildTocMetadataBySongId, collectTocLanguageFilterOptions, collectTocTagFilterOptions } from '@/lib/player/toc-filters'
import { cn } from '@/lib/utils'

import './player-outline-list.css'

type TocItem = components['schemas']['TocItem']
type PlayerItem = components['schemas']['PlayerItem']

export type TocSidebarProps = {
  toc: TocItem[]
  items: PlayerItem[]
  currentSourceIdx?: number
  currentLanguageIndex?: number | null
  onSelect: (sourceIdx: number, languageIndex: number | null) => void
  mode: TocDisplayMode
  onModeChange: (mode: TocDisplayMode) => void
  displayModes?: readonly TocDisplayMode[]
  activeLanguageIds: ReadonlySet<string>
  onLanguageIdsChange: (ids: readonly string[]) => void
  activeTagIds: ReadonlySet<string>
  onTagIdsChange: (ids: readonly string[]) => void
  isEntryActive?: (entry: TocDisplayEntry) => boolean
  renderRowSuffix?: (entry: TocDisplayEntry) => ReactNode
  renderSeparatorBefore?: (entry: TocDisplayEntry, previousEntry: TocDisplayEntry | undefined, visibleEntries: readonly TocDisplayEntry[]) => ReactNode
  getRowAriaLabel?: (entry: TocDisplayEntry) => string
  emptyMessage?: string
  footer?: ReactNode
  className?: string
  ariaLabel?: string
}

const MODES: TocDisplayMode[] = ['order', 'alphabetical', 'liked']
const MODE_ICONS = { order: TocSortOrderIcon, alphabetical: TocSortAlphabeticalIcon, liked: TocSortLikedIcon } as const
const TOC_SORT_BUTTON_CLASS = 'flex min-w-0 flex-1 items-center justify-center rounded-md px-[0.6rem] py-[0.7rem] transition-colors'
const TOC_FILTER_CHIP_CLASS = 'rounded-md px-[0.72rem] py-[0.36rem] text-sm leading-snug font-medium transition-colors'

export function TocSidebar({
  toc,
  items,
  currentSourceIdx,
  currentLanguageIndex,
  onSelect,
  mode,
  onModeChange,
  displayModes,
  activeLanguageIds,
  onLanguageIdsChange,
  activeTagIds,
  onTagIdsChange,
  isEntryActive,
  renderRowSuffix,
  renderSeparatorBefore,
  getRowAriaLabel,
  emptyMessage: emptyMessageOverride,
  footer,
  className,
  ariaLabel,
}: TocSidebarProps) {
  const { t } = useTranslation()
  const multilingual = useTocMultilingualPreference()
  const [hoveredMode, setHoveredMode] = useState<TocDisplayMode | null>(null)
  const metadata = useMemo(() => buildTocMetadataBySongId(items), [items])
  const languages = useMemo(() => collectTocLanguageFilterOptions(metadata), [metadata])
  const tags = useMemo(() => collectTocTagFilterOptions(metadata), [metadata])
  const visibleLanguages = useMemo(() => {
    const valid = new Set(languages.map((row) => row.id))
    const selected = [...activeLanguageIds].filter((id) => valid.has(id))
    if (!multilingual) return new Set(selected)
    return selected[0] ? new Set([selected[0]]) : new Set<string>()
  }, [activeLanguageIds, languages, multilingual])
  const visibleTags = useMemo(() => {
    const valid = new Set(tags.map((row) => row.id))
    return new Set([...activeTagIds].filter((id) => valid.has(id)))
  }, [activeTagIds, tags])
  const entries = useMemo(
    () => displayTocEntries(toc, mode, {
      items,
      metadataBySongId: metadata,
      activeLanguageIds: visibleLanguages,
      activeTagIds: visibleTags,
      multilingualToc: multilingual,
    }),
    [items, metadata, mode, toc, visibleLanguages, visibleTags, multilingual],
  )
  const labels: Record<TocDisplayMode, string> = {
    order: t('player.toc.sortOrder'),
    alphabetical: t('player.toc.sortAlphabetical'),
    liked: t('player.toc.sortLiked'),
  }
  const hasFilters = languages.length > 0 || tags.length > 0
  const filtersActive = visibleLanguages.size > 0 || visibleTags.size > 0
  const emptyMessage = mode === 'liked' && !filtersActive ? t('player.toc.emptyLiked') : t('player.toc.emptyFiltered')

  return (
    <nav
      className={cn('flex h-full min-h-0 shrink-0 flex-col border-r border-[var(--color-border)] bg-[var(--color-surface)]', className ?? PLAYER_TOC_WIDTH_CLASS)}
      aria-label={ariaLabel ?? t('player.toc.title')}
    >
      <div className="shrink-0 border-b border-[var(--color-border)] p-2">
        <div role="radiogroup" aria-label={t('player.toc.sortGroup')} className="flex gap-1">
          {(displayModes ?? MODES).map((value) => {
            const selected = mode === value
            const Icon = MODE_ICONS[value]
            return (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={selected}
                aria-label={labels[value]}
                title={labels[value]}
                className={cn(TOC_SORT_BUTTON_CLASS, selected ? 'bg-[var(--color-primary)] text-[var(--color-primary-foreground)]' : 'bg-[var(--color-muted)] text-[var(--color-foreground)] hover:bg-[var(--color-muted)]/80')}
                onClick={() => onModeChange(value)}
                onMouseEnter={() => setHoveredMode(value)}
                onMouseLeave={() => setHoveredMode(null)}
              >
                <Icon size={16} isHovered={selected || hoveredMode === value} />
              </button>
            )
          })}
        </div>
        {hasFilters ? (
          <div className="mt-2 space-y-2">
            {languages.length > 0 ? (
              <div role="group" aria-label={t('player.toc.languageFilterGroup')} className="flex flex-wrap gap-1">
                {languages.map((filter) => {
                  const selected = visibleLanguages.has(filter.id)
                  return (
                    <button
                      key={filter.id}
                      type="button"
                      aria-pressed={selected}
                      title={t('player.toc.languageFilterAria', { language: filter.label })}
                      className={cn(TOC_FILTER_CHIP_CLASS, selected ? 'bg-[var(--color-primary)] text-[var(--color-primary-foreground)]' : 'bg-[var(--color-muted)] text-[var(--color-foreground)] hover:bg-[var(--color-muted)]/80')}
                      onClick={() => {
                        if (multilingual) onLanguageIdsChange(selected && visibleLanguages.size === 1 ? [] : [filter.id])
                        else {
                          const next = new Set(activeLanguageIds)
                          if (next.has(filter.id)) next.delete(filter.id)
                          else next.add(filter.id)
                          onLanguageIdsChange([...next])
                        }
                      }}
                    >
                      {filter.label}
                    </button>
                  )
                })}
              </div>
            ) : null}
            {tags.length > 0 ? (
              <div role="group" aria-label={t('player.toc.tagFilterGroup')} className="flex flex-wrap gap-1">
                {tags.map((filter) => {
                  const selected = visibleTags.has(filter.id)
                  return (
                    <button
                      key={filter.id}
                      type="button"
                      aria-pressed={selected}
                      title={t('player.toc.tagFilterAria', { tag: filter.label })}
                      className={cn(TOC_FILTER_CHIP_CLASS, 'max-w-full truncate', selected ? 'bg-[var(--color-primary)] text-[var(--color-primary-foreground)]' : 'bg-[var(--color-muted)] text-[var(--color-foreground)] hover:bg-[var(--color-muted)]/80')}
                      onClick={() => {
                        const next = new Set(activeTagIds)
                        if (next.has(filter.id)) next.delete(filter.id)
                        else next.add(filter.id)
                        onTagIdsChange([...next])
                      }}
                    >
                      {filter.label}
                    </button>
                  )
                })}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
      <ul className="player-outline-list player-outline-list--fill" role="listbox" aria-label={ariaLabel ?? t('player.toc.title')}>
        {entries.length === 0 ? (
          <li className="px-2 py-4 text-center text-xs text-[var(--color-muted-foreground)]">{emptyMessageOverride ?? emptyMessage}</li>
        ) : entries.map((row, index) => {
          const active = isEntryActive ? isEntryActive(row) : row.sourceIdx === currentSourceIdx && row.languageIndex === currentLanguageIndex
          return (
            <Fragment key={row.key}>
              {renderSeparatorBefore?.(row, entries[index - 1], entries)}
              <li className={renderRowSuffix ? 'flex items-center gap-1 pr-2' : undefined}>
                <button
                  type="button"
                  role="option"
                  aria-current={active ? 'true' : undefined}
                  aria-label={getRowAriaLabel?.(row) ?? row.title}
                  className={cn('player-outline-list__item', renderRowSuffix && 'min-w-0 flex-1', active && 'player-outline-list__item--selected')}
                  onClick={() => onSelect(row.sourceIdx, row.languageIndex)}
                >
                  {row.showNumber ? `${tocDisplayNr(toc, row.sourceIdx)}. ` : ''}{row.title}
                  {row.liked ? <>{' '}<span aria-label={t('player.toc.liked')} className="text-[var(--color-danger)]">♥</span></> : null}
                </button>
                {renderRowSuffix?.(row)}
              </li>
            </Fragment>
          )
        })}
      </ul>
      {footer}
    </nav>
  )
}
