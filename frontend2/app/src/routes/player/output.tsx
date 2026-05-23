import { createFileRoute } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { AvOutputPage } from '@/components/player/av/AvOutputPage'
import { readAvPreferences } from '@/lib/player/av-preferences'

export const Route = createFileRoute('/player/output')({
  validateSearch: (search: Record<string, unknown>) => {
    const sessionId = typeof search.s === 'string' ? search.s : ''
    return { s: sessionId }
  },
  component: PlayerOutputRoute,
})

function PlayerOutputRoute() {
  const { t } = useTranslation()
  const { s: sessionId } = Route.useSearch()
  const prefs = readAvPreferences()
  if (!sessionId) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-black p-6 text-sm text-neutral-400">
        {t('player.av.outputMissingSession')}
      </div>
    )
  }
  return (
    <AvOutputPage
      sessionId={sessionId}
      allowFullscreenOnDblClick={prefs.projection.outputFullscreenOnDblClick}
    />
  )
}
