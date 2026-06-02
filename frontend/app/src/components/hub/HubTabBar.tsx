import { Link, useRouterState } from '@tanstack/react-router'
import { motion, useReducedMotion } from 'motion/react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  IconHubCollections,
  IconHubSetlists,
  IconHubSongs,
  IconHubTeams,
} from '@/components/icons/hub-tab-icons'
import { HUB_TAB_LABEL_CLASS } from '@/components/hub/hub-list-styles'
import { cn } from '@/lib/utils'

type HubTabTo = '/collections' | '/songs' | '/setlists' | '/teams'

const tabs = [
  { to: '/collections' as const, labelKey: 'hub.tabs.collections' as const, Icon: IconHubCollections },
  { to: '/songs' as const, labelKey: 'hub.tabs.songs' as const, Icon: IconHubSongs },
  { to: '/setlists' as const, labelKey: 'hub.tabs.setlists' as const, Icon: IconHubSetlists },
  { to: '/teams' as const, labelKey: 'hub.tabs.teams' as const, Icon: IconHubTeams },
] satisfies ReadonlyArray<{
  to: HubTabTo
  labelKey: 'hub.tabs.collections' | 'hub.tabs.songs' | 'hub.tabs.setlists' | 'hub.tabs.teams'
  Icon: typeof IconHubCollections
}>

function isTeamsTabActive(pathname: string): boolean {
  return pathname === '/teams' || pathname.startsWith('/teams/')
}

export function HubTabBar() {
  const { t } = useTranslation()
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const [hoveredTab, setHoveredTab] = useState<HubTabTo | null>(null)
  const reduceMotion = useReducedMotion()

  const barSpring =
    reduceMotion
      ? { duration: 0 }
      : { type: 'spring' as const, stiffness: 380, damping: 34, mass: 0.92 }

  return (
    <motion.nav
      layout={!reduceMotion}
      initial={false}
      transition={barSpring}
      className={cn(
        'flex h-[3.6rem] w-full min-w-0 flex-1 items-stretch justify-between rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] p-[0.18rem]',
        'shadow-[var(--shadow-elevated)]',
      )}
      aria-label={t('hub.tabs.aria')}
    >
      {tabs.map(({ to, labelKey, Icon }) => {
        const active =
          to === '/teams' ? isTeamsTabActive(pathname) : pathname === to || pathname.startsWith(`${to}/`)
        return (
          <Link
            key={to}
            to={to}
            onMouseEnter={() => setHoveredTab(to)}
            onMouseLeave={() => setHoveredTab(null)}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'relative flex h-full shrink-0 flex-none flex-col items-center justify-center gap-0.5 rounded-full px-1 text-center [aspect-ratio:var(--hub-tab-aspect)]',
              HUB_TAB_LABEL_CLASS,
              active
                ? 'text-[var(--color-primary-foreground)]'
                : 'text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)]',
            )}
          >
            {active ? (
              <motion.span
                layoutId="hub-tab-pill"
                className="absolute inset-0 rounded-full bg-[var(--color-primary)]"
                aria-hidden
                transition={
                  reduceMotion
                    ? { duration: 0 }
                    : { type: 'spring', stiffness: 460, damping: 38, mass: 0.9 }
                }
              />
            ) : null}
            <span className="relative z-10 flex min-h-0 w-full flex-col items-center justify-center gap-0.5">
              <Icon isHovered={hoveredTab === to} />
              <span className="line-clamp-1 w-full min-w-0 px-0.5 [overflow-wrap:anywhere]">
                {t(labelKey)}
              </span>
            </span>
          </Link>
        )
      })}
    </motion.nav>
  )
}
