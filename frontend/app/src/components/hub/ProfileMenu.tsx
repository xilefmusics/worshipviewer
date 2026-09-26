import * as Dialog from '@radix-ui/react-dialog'
import { useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import type { User } from '@/api/session'
import {
  IconAdminDashboard,
  IconAbout,
  IconInstall,
  IconLogout,
  IconMedia,
  IconSettings,
  IconTutorials,
  IconUsers,
} from '@/components/icons/profile-menu-icons'
import {
  HubActionItem,
  HubActionSeparator,
  HubRightDrawer,
} from '@/components/hub/HubActionsDrawer'
import { Button } from '@/components/ui/button'
import { useSongEditorNavigationBridge } from '@/context/SongEditorNavigationBridgeContext'
import { useUserAvatarDisplay } from '@/hooks/useUserAvatarDisplay'
import { cn } from '@/lib/utils'
import { performLogout } from '@/lib/logout-queue'
import { usePwaInstall } from '@/pwa/pwa-install-context'
import { Route as RootRoute } from '@/routes/__root'

const TUTORIALS_URL = 'https://www.worshipviewer.com/tutorials'

type ProfileMenuProps = {
  user: User
  /** When true, show a red ring on the avatar and an Offline line at the top of the menu. */
  offline?: boolean
}

export function ProfileMenu({ user, offline = false }: ProfileMenuProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { queryClient } = RootRoute.useRouteContext()
  const { canShowInstall, openInstall } = usePwaInstall()
  const songEditorNavigationBridge = useSongEditorNavigationBridge()
  const { imageSrc, onImageError, initials } = useUserAvatarDisplay(user)
  const [hoveredRow, setHoveredRow] = useState<
    'teams' | 'media' | 'settings' | 'admin' | 'about' | 'tutorials' | 'install' | 'logout' | null
  >(null)

  async function leaveSongEditorIfNeeded(): Promise<boolean> {
    const ok = (await songEditorNavigationBridge?.flushBeforeLeave()) ?? true
    return ok !== false
  }

  async function onLogout() {
    await performLogout(queryClient)
    void navigate({ to: '/login', search: { return_to: undefined } })
  }

  // Flow: M0 — open the combined Media and background library from the profile menu.
  return (
    <HubRightDrawer
      title={user.email}
      triggerAriaLabel={offline ? t('hub.profile.openMenuOffline') : t('hub.profile.openMenu')}
      trigger={
        <Button
          type="button"
          variant="outline"
          size="icon"
          className={cn(
            'size-[3.6rem] shrink-0 overflow-hidden rounded-full border-[var(--color-border)] bg-[var(--color-surface)] p-0 text-[0.7875rem] font-semibold shadow-[var(--shadow-elevated)]',
            'focus-visible:outline-none',
            offline && 'border-2 border-[var(--color-danger)]',
          )}
          aria-label={offline ? t('hub.profile.openMenuOffline') : t('hub.profile.openMenu')}
        >
          {imageSrc ? (
            <img
              src={imageSrc}
              alt=""
              className="size-full object-cover"
              onError={onImageError}
            />
          ) : (
            <span className="leading-none">{initials}</span>
          )}
        </Button>
      }
    >
      {offline ? (
        <div className="mb-2 border-b border-[var(--color-border)] px-2 pb-2">
          <p className="text-sm font-medium text-[var(--color-danger)]">{t('hub.profile.offline')}</p>
        </div>
      ) : null}
      <HubActionItem
        onSelect={() => void navigate({ to: '/teams' })}
        onHoverChange={(hot) => setHoveredRow(hot ? 'teams' : null)}
      >
        <IconUsers isHovered={hoveredRow === 'teams'} />
        {t('hub.profile.teams')}
      </HubActionItem>
      <HubActionItem
        onSelect={() => {
          void (async () => {
            if (!(await leaveSongEditorIfNeeded())) return
            void navigate({ to: '/media' })
          })()
        }}
        onHoverChange={(hot) => setHoveredRow(hot ? 'media' : null)}
      >
        <IconMedia isHovered={hoveredRow === 'media'} />
        {t('hub.profile.media')}
      </HubActionItem>
      <HubActionItem
        onSelect={() => {
          void (async () => {
            if (!(await leaveSongEditorIfNeeded())) return
            void navigate({ to: '/settings' })
          })()
        }}
        onHoverChange={(hot) => setHoveredRow(hot ? 'settings' : null)}
      >
        <IconSettings isHovered={hoveredRow === 'settings'} />
        {t('hub.profile.settings')}
      </HubActionItem>
      {user.role === 'admin' ? (
        <HubActionItem
          onSelect={() => {
            void (async () => {
              if (!(await leaveSongEditorIfNeeded())) return
              void navigate({
                to: '/admin/users',
              })
            })()
          }}
          onHoverChange={(hot) => setHoveredRow(hot ? 'admin' : null)}
        >
          <IconAdminDashboard isHovered={hoveredRow === 'admin'} />
          {t('hub.profile.admin')}
        </HubActionItem>
      ) : null}
      <HubActionItem
        onSelect={() => {
          void (async () => {
            if (!(await leaveSongEditorIfNeeded())) return
            void navigate({ to: '/about' })
          })()
        }}
        onHoverChange={(hot) => setHoveredRow(hot ? 'about' : null)}
      >
        <IconAbout isHovered={hoveredRow === 'about'} />
        {t('hub.profile.about')}
      </HubActionItem>
      <Dialog.Close asChild>
        <a
          href={TUTORIALS_URL}
          target="_blank"
          rel="noopener noreferrer"
          role="menuitem"
          className="relative flex w-full cursor-default select-none items-center gap-2 rounded-sm px-2 py-2 text-left text-sm outline-none hover:bg-[var(--color-muted)] focus:bg-[var(--color-muted)]"
          onMouseEnter={() => setHoveredRow('tutorials')}
          onMouseLeave={() => setHoveredRow(null)}
          onFocus={() => setHoveredRow('tutorials')}
          onBlur={() => setHoveredRow(null)}
        >
          <IconTutorials isHovered={hoveredRow === 'tutorials'} />
          {t('hub.profile.tutorials')}
        </a>
      </Dialog.Close>
      {canShowInstall ? (
        <HubActionItem
          onSelect={() => {
            openInstall()
          }}
          onHoverChange={(hot) => setHoveredRow(hot ? 'install' : null)}
        >
          <IconInstall isHovered={hoveredRow === 'install'} />
          {t('hub.profile.install')}
        </HubActionItem>
      ) : null}
      <HubActionSeparator />
      <HubActionItem
        onSelect={() => {
          void (async () => {
            if (!(await leaveSongEditorIfNeeded())) return
            await onLogout()
          })()
        }}
        onHoverChange={(hot) => setHoveredRow(hot ? 'logout' : null)}
      >
        <IconLogout isHovered={hoveredRow === 'logout'} />
        {t('hub.profile.logout')}
      </HubActionItem>
    </HubRightDrawer>
  )
}
