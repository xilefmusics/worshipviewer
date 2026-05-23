import type { components } from '@/api/schema'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  TocSortAlphabeticalIcon,
  TocSortLikedIcon,
  TocSortOrderIcon,
} from '@/components/icons/toc-sort-icons'
import { displayTocEntries, type TocDisplayMode } from '@/lib/player/toc-display'
import {
  buildTocMetadataBySongId,
  collectTocLanguageFilterOptions,
  collectTocTagFilterOptions,
} from '@/lib/player/toc-filters'
import { cn } from '@/lib/utils'

import './player-outline-list.css'

type TocItem = components['schemas']['TocItem']
type PlayerItem = components['schemas']['PlayerItem']

type PlayerTocSidebarProps = {
  toc: TocItem[]
  items: PlayerItem[]
  currentIndex: number
  onSelect: (idx: number) => void
}

const MODES: TocDisplayMode[] = ['order', 'alphabetical', 'liked']

const MODE_ICONS = {
  order: TocSortOrderIcon,
  alphabetical: TocSortAlphabeticalIcon,
  liked: TocSortLikedIcon,
} as const

function toggleSetValue<T>(set: Set<T>, value: T): Set<T> {
  const next = new Set(set)
  if (next.has(value)) next.delete(value)
  else next.add(value)
  return next
}

export function PlayerTocSidebar({ toc, items, currentIndex, onSelect }: PlayerTocSidebarProps) {
  const { t } = useTranslation()
  const [mode, setMode] = useState<TocDisplayMode>('order')
  const [hoveredMode, setHoveredMode] = useState<TocDisplayMode | null>(null)
  const [activeLanguageIds, setActiveLanguageIds] = useState<Set<string>>(() => new Set())
  const [activeTagIds, setActiveTagIds] = useState<Set<string>>(() => new Set())

  const metadataBySongId = useMemo(() => buildTocMetadataBySongId(items), [items])
  const languageFilters = useMemo(
    () => collectTocLanguageFilterOptions(metadataBySongId),
    [metadataBySongId],
  )
  const tagFilters = useMemo(
    () => collectTocTagFilterOptions(metadataBySongId),
    [metadataBySongId],
  )

  useEffect(() => {
    const validLanguages = new Set(languageFilters.map((row) => row.id))
    setActiveLanguageIds((current) => {
      const next = new Set([...current].filter((id) => validLanguages.has(id)))
      return next.size === current.size ? current : next
    })
  }, [languageFilters])

  useEffect(() => {
    const validTags = new Set(tagFilters.map((row) => row.id))
    setActiveTagIds((current) => {
      const next = new Set([...current].filter((id) => validTags.has(id)))
      return next.size === current.size ? current : next
    })
  }, [tagFilters])

  const entries = useMemo(
    () =>
      displayTocEntries(toc, mode, {
        items,
        metadataBySongId,
        activeLanguageIds,
        activeTagIds,
      }),
    [activeLanguageIds, activeTagIds, items, metadataBySongId, mode, toc],
  )

  const modeLabels: Record<TocDisplayMode, string> = {
    order: t('player.toc.sortOrder'),
    alphabetical: t('player.toc.sortAlphabetical'),
    liked: t('player.toc.sortLiked'),
  }

  const hasMetadataFilters = languageFilters.length > 0 || tagFilters.length > 0
  const filtersActive = activeLanguageIds.size > 0 || activeTagIds.size > 0
  const emptyMessage =
    mode === 'liked' && !filtersActive
      ? t('player.toc.emptyLiked')
      : t('player.toc.emptyFiltered')

  return (
    <nav
      className="flex h-full min-h-0 w-44 shrink-0 flex-col border-r border-[var(--color-border)] bg-[var(--color-surface)] sm:w-56"
      aria-label={t('player.toc.title')}
    >
      <div className="shrink-0 border-b border-[var(--color-border)] p-2">
        <div
          role="radiogroup"
          aria-label={t('player.toc.sortGroup')}
          className="flex gap-1"
        >
          {MODES.map((value) => {
            const selected = mode === value
            const Icon = MODE_ICONS[value]
            const label = modeLabels[value]
            const animateIcon = selected || hoveredMode === value
            return (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={selected}
                aria-label={label}
                title={label}
                className={cn(
                  'flex min-w-0 flex-1 items-center justify-center rounded-md p-2 transition-colors',
                  selected
                    ? 'bg-[var(--color-primary)] text-[var(--color-primary-foreground)]'
                    : 'bg-[var(--color-muted)] text-[var(--color-foreground)] hover:bg-[var(--color-muted)]/80',
                )}
                onClick={() => setMode(value)}
                onMouseEnter={() => setHoveredMode(value)}
                onMouseLeave={() => setHoveredMode(null)}
              >
                <Icon size={16} isHovered={animateIcon} />
              </button>
            )
          })}
        </div>

        {hasMetadataFilters ? (
          <div className="mt-2 space-y-2">
            {languageFilters.length > 0 ? (
              <div
                role="group"
                aria-label={t('player.toc.languageFilterGroup')}
                className="flex flex-wrap gap-1"
              >
                {languageFilters.map((filter) => {
                  const selected = activeLanguageIds.has(filter.id)
                  return (
                    <button
                      key={filter.id}
                      type="button"
                      aria-pressed={selected}
                      title={t('player.toc.languageFilterAria', { language: filter.label })}
                      className={cn(
                        'rounded-md px-2 py-1 text-xs font-medium transition-colors',
                        selected
                          ? 'bg-[var(--color-primary)] text-[var(--color-primary-foreground)]'
                          : 'bg-[var(--color-muted)] text-[var(--color-foreground)] hover:bg-[var(--color-muted)]/80',
                      )}
                      onClick={() => setActiveLanguageIds((current) => toggleSetValue(current, filter.id))}
                    >
                      {filter.label}
                    </button>
                  )
                })}
              </div>
            ) : null}

            {tagFilters.length > 0 ? (
              <div
                role="group"
                aria-label={t('player.toc.tagFilterGroup')}
                className="flex flex-wrap gap-1"
              >
                {tagFilters.map((filter) => {
                  const selected = activeTagIds.has(filter.id)
                  return (
                    <button
                      key={filter.id}
                      type="button"
                      aria-pressed={selected}
                      title={t('player.toc.tagFilterAria', { tag: filter.label })}
                      className={cn(
                        'max-w-full truncate rounded-md px-2 py-1 text-xs font-medium transition-colors',
                        selected
                          ? 'bg-[var(--color-primary)] text-[var(--color-primary-foreground)]'
                          : 'bg-[var(--color-muted)] text-[var(--color-foreground)] hover:bg-[var(--color-muted)]/80',
                      )}
                      onClick={() => setActiveTagIds((current) => toggleSetValue(current, filter.id))}
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

      <ul
        className="player-outline-list player-outline-list--fill"
        role="listbox"
        aria-label={t('player.toc.title')}
      >
        {entries.length === 0 ? (
          <li className="px-2 py-4 text-center text-xs text-[var(--color-muted-foreground)]">
            {emptyMessage}
          </li>
        ) : (
          entries.map((row) => {
            const active = row.idx === currentIndex
            return (
              <li key={`${row.idx}-${row.title}`}>
                <button
                  type="button"
                  role="option"
                  aria-current={active ? 'true' : undefined}
                  aria-label={row.title}
                  className={cn(
                    'player-outline-list__item',
                    active && 'player-outline-list__item--selected',
                  )}
                  onClick={() => onSelect(row.idx)}
                >
                  {row.nr}. {row.title}
                  {row.liked ? (
                    <>
                      {' '}
                      <span aria-label={t('player.toc.liked')} className="text-[var(--color-danger)]">
                        ♥
                      </span>
                    </>
                  ) : null}
                </button>
              </li>
            )
          })
        )}
      </ul>
    </nav>
  )
}
