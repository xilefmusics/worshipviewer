import type { HTMLAttributes } from 'react'

import { AudioLinesIcon } from '@/components/icons/lucide-animated/audio-lines-icon'
import { LayersIcon } from '@/components/icons/lucide-animated/layers-icon'
import { ListMusicIcon } from '@/components/icons/lucide-animated/list-music-icon'
import { PlusIcon } from '@/components/icons/lucide-animated/plus-icon'
import { SessionsIcon } from '@/components/icons/lucide-animated/sessions-icon'
import { SettingsIcon } from '@/components/icons/lucide-animated/settings-icon'
import { UsersIcon } from '@/components/icons/lucide-animated/users-icon'
import { cn } from '@/lib/utils'

/** ~90% of prior 26px; matches scaled hub tab / Neu button chrome. */
const HUB_TAB_ICON_PX = 23

type HubTabIconProps = {
  className?: string
  /** When set, plays animation when the parent row (e.g. full tab link) is hovered. */
  isHovered?: boolean
} & Omit<HTMLAttributes<HTMLDivElement>, 'children'>

/** Collections / “Sammlungen” — Lucide Animated `layers` */
export function IconHubCollections({ className, isHovered, ...rest }: HubTabIconProps) {
  return (
    <LayersIcon
      className={cn('inline-flex shrink-0', className)}
      isHovered={isHovered}
      size={HUB_TAB_ICON_PX}
      {...rest}
    />
  )
}

/** Songs / “Lieder” — Lucide Animated `audio-lines` */
export function IconHubSongs({ className, isHovered, ...rest }: HubTabIconProps) {
  return (
    <AudioLinesIcon
      className={cn('inline-flex shrink-0', className)}
      isHovered={isHovered}
      size={HUB_TAB_ICON_PX}
      {...rest}
    />
  )
}

/** Setlists — Lucide `list-music` paths, animated (Lucide Animated pattern) */
export function IconHubSetlists({ className, isHovered, ...rest }: HubTabIconProps) {
  return (
    <ListMusicIcon
      className={cn('inline-flex shrink-0', className)}
      isHovered={isHovered}
      size={HUB_TAB_ICON_PX}
      {...rest}
    />
  )
}

/** Settings — matches profile menu glyph at hub tab size */
export function IconHubSettings({ className, isHovered, ...rest }: HubTabIconProps) {
  return (
    <SettingsIcon
      className={cn('inline-flex shrink-0', className)}
      isHovered={isHovered}
      size={HUB_TAB_ICON_PX}
      {...rest}
    />
  )
}

/** Teams — `users` */
export function IconHubTeams({ className, isHovered, ...rest }: HubTabIconProps) {
  return (
    <UsersIcon
      className={cn('inline-flex shrink-0', className)}
      isHovered={isHovered}
      size={HUB_TAB_ICON_PX}
      {...rest}
    />
  )
}

/** Sessions */
export function IconHubSessions({ className, isHovered, ...rest }: HubTabIconProps) {
  return (
    <SessionsIcon
      className={cn('inline-flex shrink-0', className)}
      isHovered={isHovered}
      size={HUB_TAB_ICON_PX}
      {...rest}
    />
  )
}

/** Plus — Lucide Animated `plus` */
export function IconHubPlus({ className, isHovered, ...rest }: HubTabIconProps) {
  return (
    <PlusIcon
      className={cn('inline-flex shrink-0', className)}
      isHovered={isHovered}
      size={HUB_TAB_ICON_PX}
      {...rest}
    />
  )
}
