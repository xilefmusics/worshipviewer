import { createFileRoute } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { PlayerRouteInner } from '@/components/player/PlayerRoute'
import { requireSession } from '@/lib/auth-guard'
import type { PlayerEntityType } from '@/lib/player-route'

function parsePlayerType(raw: unknown): PlayerEntityType | undefined {
  if (raw === 'song' || raw === 'setlist' || raw === 'collection') return raw
  return undefined
}

export const Route = createFileRoute('/player')({
  validateSearch: (search: Record<string, unknown>) => {
    const id = typeof search.id === 'string' ? search.id : ''
    const type = parsePlayerType(search.type)
    return { type, id }
  },
  beforeLoad: async ({ context }) => {
    await requireSession(context)
  },
  component: PlayerPageComponent,
})

function PlayerPageComponent() {
  const { t } = useTranslation()
  const { type, id } = Route.useSearch()
  if (!type || !id) {
    return (
      <div className="flex min-h-dvh items-center justify-center p-6 text-[var(--color-muted-foreground)]">
        {t('player.invalidLink')}
      </div>
    )
  }
  return <PlayerRouteInner type={type} id={id} />
}
