import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

export function RoomPlayerShell({ player }: { player: ReactNode }) {
  const { t } = useTranslation()

  return (
    <div className="flex h-dvh min-h-0 flex-col overflow-hidden bg-[var(--color-background)]">
      <main className="min-h-0 min-w-0 flex-1 overflow-hidden" aria-label={t('rooms.panel.player')}>
        {player}
      </main>
    </div>
  )
}
