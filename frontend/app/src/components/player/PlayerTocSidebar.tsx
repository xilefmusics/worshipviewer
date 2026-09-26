import type { components } from '@/api/schema'
import { useTranslation } from 'react-i18next'

import { TocSidebar } from '@/components/player/TocSidebar'
import { usePlayerTocSearchSync } from '@/hooks/usePlayerIndexSearchSync'
import { useTocMultilingualPreference } from '@/hooks/useTocMultilingualPreference'

type TocItem = components['schemas']['TocItem']
type PlayerItem = components['schemas']['PlayerItem']

type PlayerTocSidebarProps = {
  toc: TocItem[]
  items: PlayerItem[]
  currentSourceIdx: number
  currentLanguageIndex: number | null
  onSelect: (sourceIdx: number, languageIndex: number | null) => void
  primaryTitleOnly?: boolean
  className?: string
}

export function PlayerTocSidebar({
  toc,
  items,
  currentSourceIdx,
  currentLanguageIndex,
  onSelect,
  primaryTitleOnly = false,
  className,
}: PlayerTocSidebarProps) {
  const { t } = useTranslation()
  const multilingual = useTocMultilingualPreference()
  const {
    mode,
    setMode,
    setLanguageIds,
    activeLanguageIds,
    activeTagIds,
    toggleTagId,
  } = usePlayerTocSearchSync()
  const languageAwareSelection = !primaryTitleOnly && (multilingual || mode === 'alphabetical')

  return (
    <TocSidebar
      toc={toc}
      items={items}
      currentSourceIdx={currentSourceIdx}
      currentLanguageIndex={currentLanguageIndex}
      onSelect={(sourceIdx, languageIndex) =>
        onSelect(sourceIdx, languageAwareSelection ? languageIndex : null)
      }
      expandAlphabeticalTranslations={!primaryTitleOnly}
      primaryTitleOnly={primaryTitleOnly}
      mode={mode}
      onModeChange={setMode}
      activeLanguageIds={activeLanguageIds}
      onLanguageIdsChange={setLanguageIds}
      activeTagIds={activeTagIds}
      onTagIdsChange={(ids) => {
        const next = new Set(ids)
        for (const id of activeTagIds) if (!next.has(id)) toggleTagId(id)
        for (const id of next) if (!activeTagIds.has(id)) toggleTagId(id)
      }}
      className={className}
      ariaLabel={t('player.toc.title')}
    />
  )
}
