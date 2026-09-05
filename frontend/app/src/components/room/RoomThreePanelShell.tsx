import { useRef, useState, type ReactNode } from 'react'
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

const panels: Panel[] = ['queue', 'player', 'details']

export function RoomThreePanelShell({ queue, player, details, desktopOverlay = false }: Props) {
  const { t } = useTranslation()
  const [active, setActive] = useState<Panel>('player')
  const viewportRef = useRef<HTMLDivElement>(null)

  const selectPanel = (panel: Panel) => {
    setActive(panel)
    const index = panels.indexOf(panel)
    viewportRef.current?.scrollTo({ left: index * viewportRef.current.clientWidth, behavior: 'smooth' })
  }

  const panelLabel = (panel: Panel) => t(`rooms.panel.${panel}`)

  return (
    <div className="flex h-dvh min-h-0 flex-col overflow-hidden bg-[var(--color-background)]">
      <nav className="flex shrink-0 border-b border-[var(--color-border)] bg-[var(--color-surface)] md:hidden" role="tablist" aria-label={t('rooms.panels')}>
        {panels.map((panel) => (
          <button
            key={panel}
            type="button"
            role="tab"
            aria-selected={active === panel}
            className={cn(
              'min-w-0 flex-1 px-3 py-2 text-xs font-medium transition-colors',
              active === panel
                ? 'border-b-2 border-[var(--color-primary)] text-[var(--color-foreground)]'
                : 'text-[var(--color-muted-foreground)]',
            )}
            onClick={() => selectPanel(panel)}
          >
            {panelLabel(panel)}
          </button>
        ))}
      </nav>

      <div
        ref={viewportRef}
        className={cn(
          'flex min-h-0 min-w-0 flex-1 snap-x snap-mandatory overflow-x-auto overscroll-x-contain scroll-smooth',
          desktopOverlay
            ? 'md:relative md:grid md:grid-cols-1 md:overflow-hidden md:overscroll-none md:snap-none'
            : 'md:grid md:grid-cols-[minmax(16rem,20rem)_minmax(0,1fr)_minmax(16rem,20rem)] md:overflow-hidden md:snap-none',
        )}
        onScroll={(event) => {
          const element = event.currentTarget
          if (element.clientWidth === 0) return
          const index = Math.max(0, Math.min(panels.length - 1, Math.round(element.scrollLeft / element.clientWidth)))
          setActive(panels[index]!)
        }}
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
