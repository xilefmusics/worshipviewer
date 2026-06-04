import { createFileRoute } from '@tanstack/react-router'

import { AvOutputPage } from '@/components/player/av/AvOutputPage'
import { readAvPreferences } from '@/lib/player/av-preferences'
import { getAvProjectionSessionId } from '@/lib/player/av-projection-sync'

export const Route = createFileRoute('/player/output')({
  validateSearch: (search: Record<string, unknown>) => {
    const raw = typeof search.s === 'string' ? search.s.trim() : ''
    const sessionId = raw || getAvProjectionSessionId()
    return { s: sessionId }
  },
  component: PlayerOutputRoute,
})

function PlayerOutputRoute() {
  const { s: sessionId } = Route.useSearch()
  const prefs = readAvPreferences()
  return (
    <AvOutputPage
      sessionId={sessionId}
      allowFullscreenOnDblClick={prefs.projection.outputFullscreenOnDblClick}
    />
  )
}
