import { useNavigate, useRouterState } from '@tanstack/react-router'
import { motion, useReducedMotion } from 'motion/react'
import { useTranslation } from 'react-i18next'

import { HUB_TAB_LABEL_CLASS } from '@/components/hub/hub-list-styles'
import { parsePlayerEditorReturnSearch } from '@/lib/player/player-editor-return'
import { buildSettingsSearch, parseRoomSettingsReturnSearch, parseSettingsTab, type SettingsTab } from '@/lib/settings-route'
import { cn } from '@/lib/utils'

const tabs: { tab: SettingsTab; paths: string[] }[] = [
  { tab: 'general', paths: ['M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z', 'M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42'] },
  { tab: 'player', paths: ['M6 3h9l4 4v14H6z', 'M14 3v5h5M9 12h7M9 16h7'] },
  { tab: 'playerRoles', paths: ['M3 5h18v12H3z', 'M8 21h8m-4-4v4', 'm10 8 5 3-5 3z'] },
  { tab: 'audio', paths: ['M4 10v4m4-7v10m4-14v18m4-14v10m4-7v4'] },
  { tab: 'midi', paths: ['M3 6h18v12H3z', 'M7 6v7h3V6m4 0v7h3V6M7 13v5m10-5v5'] },
  { tab: 'connections', paths: ['M10 13a5 5 0 0 0 7.1 0l2-2A5 5 0 0 0 12 3.9l-1.1 1.1', 'M14 11a5 5 0 0 0-7.1 0l-2 2A5 5 0 0 0 12 20.1l1.1-1.1'] },
]

export function SettingsTabBar() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const search = useRouterState({ select: (state) => state.location.search }) as Record<string, unknown>
  const active = parseSettingsTab(search.tab)
  const reduceMotion = useReducedMotion()

  function selectTab(tab: SettingsTab) {
    void navigate({
      to: '/settings',
      search: buildSettingsSearch(tab, parsePlayerEditorReturnSearch(search), parseRoomSettingsReturnSearch(search)),
    })
  }

  return (
    <nav role="tablist" aria-label={t('settings.tabs.aria')} className="flex h-[3.6rem] w-full min-w-0 flex-1 items-stretch justify-between rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] p-[0.18rem] shadow-[var(--shadow-elevated)]">
      {tabs.map(({ tab, paths }, index) => (
        <button
          key={tab}
          type="button"
          role="tab"
          id={`settings-tab-${tab}`}
          aria-selected={active === tab}
          aria-controls={`settings-panel-${tab}`}
          tabIndex={active === tab ? 0 : -1}
          onClick={() => selectTab(tab)}
          onKeyDown={(event) => {
            let next: number
            if (event.key === 'ArrowRight') next = (index + 1) % tabs.length
            else if (event.key === 'ArrowLeft') next = (index + tabs.length - 1) % tabs.length
            else if (event.key === 'Home') next = 0
            else if (event.key === 'End') next = tabs.length - 1
            else return
            event.preventDefault()
            selectTab(tabs[next].tab)
            document.getElementById(`settings-tab-${tabs[next].tab}`)?.focus()
          }}
          className={cn('relative flex h-full min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-full px-0.5 text-center', HUB_TAB_LABEL_CLASS, active === tab ? 'text-[var(--color-primary-foreground)]' : 'text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)]')}
        >
          {active === tab ? <motion.span layoutId="settings-tab-pill" className="absolute inset-0 rounded-full bg-[var(--color-primary)]" aria-hidden transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 460, damping: 38, mass: 0.9 }} /> : null}
          <span className="relative z-10 flex min-w-0 w-full flex-col items-center justify-center gap-0.5">
            <svg aria-hidden="true" width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{paths.map((path) => <path key={path} d={path} />)}</svg>
            <span className="line-clamp-1 w-full min-w-0 px-0.5">{t(`settings.tabs.${tab}`)}</span>
          </span>
        </button>
      ))}
    </nav>
  )
}
