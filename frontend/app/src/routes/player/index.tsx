import { createFileRoute } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { PlayerRouteInner } from '@/components/player/PlayerRoute'
import { resolvePlayerMode } from '@/lib/player/player-mode'
import { readPlayerDefaultMode } from '@/lib/player/player-mode-preference'
import { parsePlayerRouteSearch } from '@/lib/player-route'
import {
  serializeTocLangSearch,
  serializeTocTagsSearch,
} from '@/lib/player/player-toc-search'

export const Route = createFileRoute('/player/')({
  validateSearch: (search: Record<string, unknown>) => {
    const parsed = parsePlayerRouteSearch(search)
    return {
      type: parsed.type,
      id: parsed.id,
      index: parsed.index,
      mode: parsed.mode,
      toc: parsed.toc,
      tocLang: serializeTocLangSearch(parsed.tocLang),
      tocTags: serializeTocTagsSearch(parsed.tocTags),
    }
  },
  component: PlayerPageComponent,
})

function PlayerPageComponent() {
  const { t } = useTranslation()
  const { type, id, index, mode: searchMode } = Route.useSearch()
  if (!type || !id) {
    return (
      <div className="flex min-h-dvh items-center justify-center p-6 text-[var(--color-muted-foreground)]">
        {t('player.invalidLink')}
      </div>
    )
  }
  const mode = resolvePlayerMode(searchMode, readPlayerDefaultMode())
  return <PlayerRouteInner type={type} id={id} initialIndex={index} mode={mode} />
}
