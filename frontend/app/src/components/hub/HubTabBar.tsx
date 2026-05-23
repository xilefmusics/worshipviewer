import { Link, useRouterState } from '@tanstack/react-router'
import { motion, useReducedMotion } from 'motion/react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  IconHubCollections,
  IconHubSessions,
  IconHubSetlists,
  IconHubSettings,
  IconHubSongs,
  IconHubTeams,
} from '@/components/icons/hub-tab-icons'
import { cn } from '@/lib/utils'

type HubMainTabTo = '/collections' | '/songs' | '/setlists'
type HubSecondaryTabTo = '/settings' | '/teams' | '/sessions'
type HubTabTo = HubMainTabTo | HubSecondaryTabTo

const mainTabs = [
  { to: '/collections' as const, labelKey: 'hub.tabs.collections' as const, Icon: IconHubCollections },
  { to: '/songs' as const, labelKey: 'hub.tabs.songs' as const, Icon: IconHubSongs },
  { to: '/setlists' as const, labelKey: 'hub.tabs.setlists' as const, Icon: IconHubSetlists },
] satisfies ReadonlyArray<{
  to: HubMainTabTo
  labelKey: 'hub.tabs.collections' | 'hub.tabs.songs' | 'hub.tabs.setlists'
  Icon: typeof IconHubCollections
}>

const secondaryTabs: Record<
  HubSecondaryTabTo,
  {
    to: HubSecondaryTabTo
    labelKey: 'hub.profile.settings' | 'hub.profile.teams' | 'hub.profile.sessions'
    Icon: typeof IconHubSettings
  }
> = {
  '/settings': { to: '/settings', labelKey: 'hub.profile.settings', Icon: IconHubSettings },
  '/teams': { to: '/teams', labelKey: 'hub.profile.teams', Icon: IconHubTeams },
  '/sessions': { to: '/sessions', labelKey: 'hub.profile.sessions', Icon: IconHubSessions },
}

/** When set, bottom nav adds this destination as a fourth tab (library + current screen). */
function hubSecondaryTabPath(pathname: string): HubSecondaryTabTo | null {
  if (pathname === '/settings' || pathname.startsWith('/settings/')) return '/settings'
  if (pathname === '/teams' || pathname.startsWith('/teams/')) return '/teams'
  if (pathname === '/sessions' || pathname.startsWith('/sessions/')) return '/sessions'
  return null
}

export function HubTabBar() {
  const { t } = useTranslation()
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const secondary = hubSecondaryTabPath(pathname)
  const tabs = secondary ? [...mainTabs, secondaryTabs[secondary]] : mainTabs

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
        'my-[0.36rem] flex h-[3.6rem] w-fit max-w-full shrink-0 items-stretch gap-[0.9rem] rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] p-[0.18rem]',
        'shadow-[var(--shadow-elevated)]',
      )}
      aria-label={t('hub.tabs.aria')}
    >
      {tabs.map(({ to, labelKey, Icon }) => {
        const active =
          to === '/settings' || to === '/teams' || to === '/sessions'
            ? hubSecondaryTabPath(pathname) === to
            : pathname === to
        return (
          <Link
            key={to}
            to={to}
            onMouseEnter={() => setHoveredTab(to)}
            onMouseLeave={() => setHoveredTab(null)}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'relative flex aspect-[3/2] h-full w-auto flex-none flex-col items-center justify-center gap-0.5 rounded-full px-1 text-center',
              'text-[6.48px] font-medium leading-none tracking-tight sm:text-[7.2px]',
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
