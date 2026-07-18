import { useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import type { User } from '@/api/session'
import {
  IconAdminDashboard,
  IconAbout,
  IconInstall,
  IconLogout,
  IconSettings,
} from '@/components/icons/profile-menu-icons'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useSongEditorNavigationBridge } from '@/context/SongEditorNavigationBridgeContext'
import { useUserAvatarDisplay } from '@/hooks/useUserAvatarDisplay'
import { performLogout } from '@/lib/logout-queue'
import { usePwaInstall } from '@/pwa/pwa-install-context'
import { Route as RootRoute } from '@/routes/__root'
import { formatAdminDateInputValue, resolveAdminQuickRange } from '@/lib/admin-dashboard'
import { cn } from '@/lib/utils'

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
    'settings' | 'admin' | 'about' | 'install' | 'logout' | null
  >(null)

  async function leaveSongEditorIfNeeded(): Promise<boolean> {
    const ok = (await songEditorNavigationBridge?.flushBeforeLeave()) ?? true
    return ok !== false
  }

  async function onLogout() {
    await performLogout(queryClient)
    void navigate({ to: '/login', search: { return_to: undefined } })
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
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
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-56 overflow-hidden"
        style={{
          transformOrigin: 'var(--radix-dropdown-menu-content-transform-origin, right top)',
        }}
      >
        {offline ? (
          <div className="border-b border-[var(--color-border)] px-2 py-2">
            <p className="text-sm font-medium text-[var(--color-danger)]">{t('hub.profile.offline')}</p>
          </div>
        ) : null}
        <DropdownMenuLabel className="font-normal">
          <span className="block truncate text-sm text-[var(--color-foreground)]">{user.email}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => {
            void (async () => {
              if (!(await leaveSongEditorIfNeeded())) return
              void navigate({ to: '/settings' })
            })()
          }}
          onMouseEnter={() => setHoveredRow('settings')}
          onMouseLeave={() => setHoveredRow(null)}
        >
          <IconSettings isHovered={hoveredRow === 'settings'} />
          {t('hub.profile.settings')}
        </DropdownMenuItem>
        {user.role === 'admin' ? (
          <DropdownMenuItem
            onSelect={() => {
              void (async () => {
                if (!(await leaveSongEditorIfNeeded())) return
                const range = resolveAdminQuickRange('30d')
                void navigate({
                  to: '/admin',
                  search: {
                    start: formatAdminDateInputValue(range.start),
                    end: formatAdminDateInputValue(range.end),
                  },
                  replace: true,
                })
              })()
            }}
            onMouseEnter={() => setHoveredRow('admin')}
            onMouseLeave={() => setHoveredRow(null)}
          >
            <IconAdminDashboard isHovered={hoveredRow === 'admin'} />
            {t('hub.profile.admin')}
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem
          onSelect={() => {
            void (async () => {
              if (!(await leaveSongEditorIfNeeded())) return
              void navigate({ to: '/about' })
            })()
          }}
          onMouseEnter={() => setHoveredRow('about')}
          onMouseLeave={() => setHoveredRow(null)}
        >
          <IconAbout isHovered={hoveredRow === 'about'} />
          {t('hub.profile.about')}
        </DropdownMenuItem>
        {canShowInstall ? (
          <DropdownMenuItem
            onSelect={() => {
              openInstall()
            }}
            onMouseEnter={() => setHoveredRow('install')}
            onMouseLeave={() => setHoveredRow(null)}
          >
            <IconInstall isHovered={hoveredRow === 'install'} />
            {t('hub.profile.install')}
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => {
            void (async () => {
              if (!(await leaveSongEditorIfNeeded())) return
              await onLogout()
            })()
          }}
          onMouseEnter={() => setHoveredRow('logout')}
          onMouseLeave={() => setHoveredRow(null)}
        >
          <IconLogout isHovered={hoveredRow === 'logout'} />
          {t('hub.profile.logout')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
