import type { components } from '@/api/schema'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  TocSortAlphabeticalIcon,
  TocSortLikedIcon,
  TocSortOrderIcon,
} from '@/components/icons/toc-sort-icons'
import { displayTocEntries, type TocDisplayMode } from '@/lib/player/toc-display'
import { cn } from '@/lib/utils'

type TocItem = components['schemas']['TocItem']

type PlayerTocSidebarProps = {
  toc: TocItem[]
  currentIndex: number
  onSelect: (idx: number) => void
}

const MODES: TocDisplayMode[] = ['order', 'alphabetical', 'liked']

const MODE_ICONS = {
  order: TocSortOrderIcon,
  alphabetical: TocSortAlphabeticalIcon,
  liked: TocSortLikedIcon,
} as const

export function PlayerTocSidebar({ toc, currentIndex, onSelect }: PlayerTocSidebarProps) {
  const { t } = useTranslation()
  const [mode, setMode] = useState<TocDisplayMode>('order')
  const [hoveredMode, setHoveredMode] = useState<TocDisplayMode | null>(null)

  const entries = useMemo(() => displayTocEntries(toc, mode), [toc, mode])

  const modeLabels: Record<TocDisplayMode, string> = {
    order: t('player.toc.sortOrder'),
    alphabetical: t('player.toc.sortAlphabetical'),
    liked: t('player.toc.sortLiked'),
  }

  return (
    <nav
      className="flex h-full min-h-0 w-44 shrink-0 flex-col border-r border-[var(--color-border)] bg-[var(--color-surface)] sm:w-56"
      aria-label={t('player.toc.title')}
    >
      <div
        className="shrink-0 border-b border-[var(--color-border)] p-2"
        role="radiogroup"
        aria-label={t('player.toc.sortGroup')}
      >
        <div className="flex gap-1">
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
      </div>

      <ul
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2 touch-pan-y"
        role="listbox"
        aria-label={t('player.toc.title')}
      >
        {entries.length === 0 ? (
          <li className="px-2 py-4 text-center text-xs text-[var(--color-muted-foreground)]">
            {t('player.toc.emptyLiked')}
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
                  className={cn(
                    'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors',
                    active
                      ? 'border border-[var(--color-primary)] bg-[var(--color-primary)]/10'
                      : 'hover:bg-[var(--color-muted)]',
                  )}
                  onClick={() => onSelect(row.idx)}
                >
                  <span className="shrink-0 rounded-md bg-[var(--color-muted)] px-2 py-0.5 text-xs font-medium">
                    {row.nr}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{row.title}</span>
                  {row.liked ? (
                    <span aria-label={t('player.toc.liked')} className="shrink-0 text-[var(--color-danger)]">
                      ♥
                    </span>
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
