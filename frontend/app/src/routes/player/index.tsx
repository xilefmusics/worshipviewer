import { createFileRoute } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { PlayerRouteInner } from '@/components/player/PlayerRoute'
import { parsePlayerMode, resolvePlayerMode } from '@/lib/player/player-mode'
import { readPlayerDefaultMode } from '@/lib/player/player-mode-preference'
import { parseOptionalPlayerIndex } from '@/lib/player/player-editor-return'
import type { PlayerEntityType } from '@/lib/player-route'

function parsePlayerType(raw: unknown): PlayerEntityType | undefined {
  if (raw === 'song' || raw === 'setlist' || raw === 'collection') return raw
  return undefined
}

export const Route = createFileRoute('/player/')({
  validateSearch: (search: Record<string, unknown>) => {
    const id = typeof search.id === 'string' ? search.id : ''
    const type = parsePlayerType(search.type)
    const index = parseOptionalPlayerIndex(search.index)
    const mode = parsePlayerMode(search.mode)
    return { type, id, index, mode }
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
