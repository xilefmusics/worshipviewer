import type { HTMLAttributes } from 'react'

import { DownloadIcon } from '@/components/icons/lucide-animated/download-icon'
import { InfoIcon } from '@/components/icons/lucide-animated/info-icon'
import { LogoutIcon } from '@/components/icons/lucide-animated/logout-icon'
import { SessionsIcon } from '@/components/icons/lucide-animated/sessions-icon'
import { SettingsIcon } from '@/components/icons/lucide-animated/settings-icon'
import { UsersIcon } from '@/components/icons/lucide-animated/users-icon'
import { cn } from '@/lib/utils'

/** Matches `size-4` (1rem) at default root font size. */
const PROFILE_MENU_ICON_PX = 16

const iconClass = 'size-4 shrink-0 text-[var(--color-muted-foreground)]'

type ProfileMenuIconProps = {
  className?: string
  isHovered?: boolean
} & Omit<HTMLAttributes<HTMLDivElement>, 'children'>

export function IconSettings({ className, isHovered, ...rest }: ProfileMenuIconProps) {
  return (
    <SettingsIcon
      className={cn(iconClass, className)}
      isHovered={isHovered}
      size={PROFILE_MENU_ICON_PX}
      {...rest}
    />
  )
}

export function IconUsers({ className, isHovered, ...rest }: ProfileMenuIconProps) {
  return (
    <UsersIcon
      className={cn(iconClass, className)}
      isHovered={isHovered}
      size={PROFILE_MENU_ICON_PX}
      {...rest}
    />
  )
}

export function IconSessions({ className, isHovered, ...rest }: ProfileMenuIconProps) {
  return (
    <SessionsIcon
      className={cn(iconClass, className)}
      isHovered={isHovered}
      size={PROFILE_MENU_ICON_PX}
      {...rest}
    />
  )
}

/** Install app — same glyph as Lucide `download`. */
export function IconInstall({ className, isHovered, ...rest }: ProfileMenuIconProps) {
  return (
    <DownloadIcon
      className={cn(iconClass, className)}
      isHovered={isHovered}
      size={PROFILE_MENU_ICON_PX}
      {...rest}
    />
  )
}

export function IconAbout({ className, isHovered, ...rest }: ProfileMenuIconProps) {
  return (
    <InfoIcon
      className={cn(iconClass, className)}
      isHovered={isHovered}
      size={PROFILE_MENU_ICON_PX}
      {...rest}
    />
  )
}

export function IconAdminDashboard({ className, isHovered, ...rest }: ProfileMenuIconProps) {
  return (
    <div className={cn(iconClass, className)} data-hovered={isHovered ? 'true' : undefined} {...rest}>
      <svg
        aria-hidden
        fill="none"
        height={PROFILE_MENU_ICON_PX}
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        viewBox="0 0 24 24"
        width={PROFILE_MENU_ICON_PX}
        xmlns="http://www.w3.org/2000/svg"
      >
        <path d="M3 19h18" />
        <path d="M5 17V9" />
        <path d="M11 17V5" />
        <path d="M17 17v-6" />
        <path d="M5 9l6-4 6 4 4-2" />
      </svg>
    </div>
  )
}

export function IconLogout({ className, isHovered, ...rest }: ProfileMenuIconProps) {
  return (
    <LogoutIcon
      className={cn(iconClass, className)}
      isHovered={isHovered}
      size={PROFILE_MENU_ICON_PX}
      {...rest}
    />
  )
}
