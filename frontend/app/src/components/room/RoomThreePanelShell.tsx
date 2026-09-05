import { useLayoutEffect, useRef, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { PLAYER_TOC_WIDTH_CLASS } from '@/lib/player/player-chrome'
import { cn } from '@/lib/utils'

type Panel = 'queue' | 'player' | 'details'

type Props = {
  queue: ReactNode
  player: ReactNode
  details: ReactNode
  desktopOverlay?: boolean
}

export function RoomThreePanelShell({ queue, player, details, desktopOverlay = false }: Props) {
  const { t } = useTranslation()
  const viewportRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const viewport = viewportRef.current
    if (!viewport || viewport.scrollWidth <= viewport.clientWidth) return
    viewport.scrollLeft = viewport.clientWidth
  }, [])

  const panelLabel = (panel: Panel) => t(`rooms.panel.${panel}`)

  return (
    <div className="flex h-dvh min-h-0 flex-col overflow-hidden bg-[var(--color-background)]">
      <div
        ref={viewportRef}
        className={cn(
          'flex min-h-0 min-w-0 flex-1 snap-x snap-mandatory touch-pan-x overflow-x-auto overscroll-x-contain',
          desktopOverlay
            ? 'md:relative md:grid md:grid-cols-1 md:overflow-hidden md:overscroll-none md:snap-none'
            : 'md:grid md:grid-cols-[minmax(16rem,20rem)_minmax(0,1fr)_minmax(16rem,20rem)] md:overflow-hidden md:snap-none',
        )}
      >
        <section
          className={cn(
            'min-h-0 min-w-full snap-center md:min-w-0',
            desktopOverlay && `md:absolute md:inset-y-0 md:left-0 md:z-10 md:flex ${PLAYER_TOC_WIDTH_CLASS} md:shadow-[var(--shadow-elevated)]`,
          )}
          aria-label={panelLabel('queue')}
        >
          {queue}
        </section>
        <main className="min-h-0 min-w-full snap-center overflow-hidden md:min-w-0" aria-label={panelLabel('player')}>
          {player}
        </main>
        <section
          className={cn(
            'min-h-0 min-w-full snap-center md:min-w-0',
            desktopOverlay && `md:absolute md:inset-y-0 md:right-0 md:z-10 md:flex ${PLAYER_TOC_WIDTH_CLASS} md:shadow-[var(--shadow-elevated)]`,
          )}
          aria-label={panelLabel('details')}
        >
          {details}
        </section>
      </div>
    </div>
  )
}
