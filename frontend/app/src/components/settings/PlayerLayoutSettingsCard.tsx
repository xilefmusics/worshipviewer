import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  DEFAULT_PLAYER_LAYOUT_PREFERENCE,
  type PlayerLayoutColumnCount,
  type PlayerLayoutMode,
  type PlayerLayoutPreference,
  type PlayerOverflowStyle,
} from '@/lib/player/effective-scroll-type'
import { cn } from '@/lib/utils'

type SettingsOption<T extends string | number> = {
  value: T
  label: string
  description: string
}

function OptionButton<T extends string | number>({
  option,
  selected,
  onSelect,
}: {
  option: SettingsOption<T>
  selected: boolean
  onSelect: (value: T) => void
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      className={cn(
        'flex w-full items-start justify-between gap-3 border-b border-[var(--color-border)] px-3 py-3 text-left transition-colors last:border-b-0 hover:bg-[var(--color-muted)]/55',
        selected && 'bg-[var(--color-primary)]/8',
      )}
      onClick={() => onSelect(option.value)}
    >
      <span className="min-w-0">
        <span className="block text-sm font-medium text-[var(--color-foreground)]">
          {option.label}
        </span>
        <span className="mt-0.5 block text-xs text-[var(--color-muted-foreground)]">
          {option.description}
        </span>
      </span>
      <span
        className={cn(
          'mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border border-[var(--color-border)]',
          selected && 'border-[var(--color-primary)] bg-[var(--color-primary)]',
        )}
        aria-hidden
      >
        {selected ? (
          <span className="size-1.5 rounded-full bg-[var(--color-primary-foreground)]" />
        ) : null}
      </span>
    </button>
  )
}

type PlayerLayoutSettingsCardProps = {
  title: string
  description: string
  value: PlayerLayoutPreference
  onChange: (value: PlayerLayoutPreference) => void
}

export function PlayerLayoutSettingsCard({
  title,
  description,
  value,
  onChange,
}: PlayerLayoutSettingsCardProps) {
  const { t } = useTranslation()

  const modeOptions = useMemo<SettingsOption<PlayerLayoutMode>[]>(
    () => [
      {
        value: 'page',
        label: t('settings.playerScroll.layoutModePage'),
        description: t('settings.playerScroll.layoutModePageDescription'),
      },
      {
        value: 'free',
        label: t('settings.playerScroll.layoutModeFree'),
        description: t('settings.playerScroll.layoutModeFreeDescription'),
      },
    ],
    [t],
  )

  const pageCountOptions = useMemo<SettingsOption<1 | 2>[]>(
    () => [
      {
        value: 1,
        label: t('settings.playerScroll.pageCount1'),
        description: t('settings.playerScroll.pageCount1Description'),
      },
      {
        value: 2,
        label: t('settings.playerScroll.pageCount2'),
        description: t('settings.playerScroll.pageCount2Description'),
      },
    ],
    [t],
  )

  const columnCountOptions = useMemo<SettingsOption<PlayerLayoutColumnCount>[]>(
    () => [
      {
        value: 'adaptive',
        label: t('settings.playerScroll.columnCountAdaptive'),
        description: t('settings.playerScroll.columnCountAdaptiveDescription'),
      },
      {
        value: 1,
        label: t('settings.playerScroll.columnCount1'),
        description: t('settings.playerScroll.columnCount1Description'),
      },
      {
        value: 2,
        label: t('settings.playerScroll.columnCount2'),
        description: t('settings.playerScroll.columnCount2Description'),
      },
      {
        value: 3,
        label: t('settings.playerScroll.columnCount3'),
        description: t('settings.playerScroll.columnCount3Description'),
      },
    ],
    [t],
  )

  const overflowOptions = useMemo<SettingsOption<PlayerOverflowStyle>[]>(
    () => [
      {
        value: 'cut',
        label: t('settings.playerScroll.overflowCut'),
        description: t('settings.playerScroll.overflowCutDescription'),
      },
      {
        value: 'scroll',
        label: t('settings.playerScroll.overflowScroll'),
        description: t('settings.playerScroll.overflowScrollDescription'),
      },
    ],
    [t],
  )

  function setMode(mode: PlayerLayoutMode) {
    if (mode === value.mode) return
    onChange({
      ...DEFAULT_PLAYER_LAYOUT_PREFERENCE,
      mode,
    })
  }

  function setPageCount(pageCount: 1 | 2) {
    onChange({ ...value, pageCount })
  }

  function setColumnCount(columnCount: PlayerLayoutColumnCount) {
    onChange({ ...value, columnCount })
  }

  function setNextSongPreview(nextSongPreview: boolean) {
    onChange({ ...value, nextSongPreview })
  }

  function setOverflowStyle(overflowStyle: PlayerOverflowStyle) {
    onChange({ ...value, overflowStyle })
  }

  function setExpandSections(expandSections: boolean) {
    onChange({ ...value, expandSections })
  }

  const countOptions = value.mode === 'page' ? pageCountOptions : columnCountOptions
  const countValue = value.mode === 'page' ? value.pageCount : value.columnCount
  const countLabel =
    value.mode === 'page'
      ? t('settings.playerScroll.pageCountTitle')
      : t('settings.playerScroll.columnCountTitle')

  return (
    <Card>
      <CardHeader className="p-4 pb-3">
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <div role="radiogroup" aria-label={title}>
          {modeOptions.map((option) => (
            <OptionButton
              key={option.value}
              option={option}
              selected={value.mode === option.value}
              onSelect={setMode}
            />
          ))}
        </div>
      </CardContent>
      <CardContent className="border-t border-[var(--color-border)] p-0">
        <div className="border-b border-[var(--color-border)] px-3 py-2">
          <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-muted-foreground)]">
            {countLabel}
          </p>
        </div>
        <div role="radiogroup" aria-label={countLabel}>
          {countOptions.map((option) => (
            <OptionButton
              key={option.value}
              option={option}
              selected={countValue === option.value}
              onSelect={(next) => {
                if (value.mode === 'page') setPageCount(next as 1 | 2)
                else setColumnCount(next as PlayerLayoutColumnCount)
              }}
            />
          ))}
        </div>
      </CardContent>
      {value.mode === 'free' ? (
        <>
          <CardContent className="border-t border-[var(--color-border)] p-4">
            <label className="flex items-start gap-3 text-sm">
              <input
                type="checkbox"
                className="mt-0.5 size-4 shrink-0 accent-[var(--color-primary)]"
                checked={value.nextSongPreview}
                onChange={(e) => setNextSongPreview(e.target.checked)}
              />
              <span className="flex flex-col gap-0.5">
                <span>{t('settings.playerScroll.nextSongPreview')}</span>
                <span className="text-xs text-[var(--color-muted-foreground)]">
                  {t('settings.playerScroll.nextSongPreviewDescription')}
                </span>
              </span>
            </label>
            <label className="mt-4 flex items-start gap-3 text-sm">
              <input
                type="checkbox"
                className="mt-0.5 size-4 shrink-0 accent-[var(--color-primary)]"
                checked={value.expandSections}
                onChange={(e) => setExpandSections(e.target.checked)}
              />
              <span className="flex flex-col gap-0.5">
                <span>{t('settings.playerScroll.expandSections')}</span>
                <span className="text-xs text-[var(--color-muted-foreground)]">
                  {t('settings.playerScroll.expandSectionsDescription')}
                </span>
              </span>
            </label>
          </CardContent>
          <CardContent className="border-t border-[var(--color-border)] p-0">
            <div className="border-b border-[var(--color-border)] px-3 py-2">
              <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-muted-foreground)]">
                {t('settings.playerScroll.overflowTitle')}
              </p>
            </div>
            <div role="radiogroup" aria-label={t('settings.playerScroll.overflowTitle')}>
              {overflowOptions.map((option) => (
                <OptionButton
                  key={option.value}
                  option={option}
                  selected={value.overflowStyle === option.value}
                  onSelect={setOverflowStyle}
                />
              ))}
            </div>
          </CardContent>
        </>
      ) : null}
    </Card>
  )
}
