import type { ComponentType } from 'react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import {
  IconHubCollections,
  IconHubSetlists,
  IconHubSongs,
} from '@/components/icons/hub-tab-icons'
import { PencilIcon } from '@/components/icons/lucide-animated/pencil-icon'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  PLAYER_HEADER_ICON_SIZE,
  playerHeaderIconButtonClass,
  playerHeaderIconClass,
} from '@/lib/player/player-chrome'
import type { PlayerEntityType } from '@/lib/player-route'

const MENU_ICON_SIZE = 16

type HubMenuIconProps = {
  className?: string
  size?: number
  isHovered?: boolean
}

type PlayerEditMenuProps = {
  playerType: PlayerEntityType
  canEditSong: boolean
  onEditSong: () => void
  onEditResource: () => void
}

export function PlayerEditMenu({
  playerType,
  canEditSong,
  onEditSong,
  onEditResource,
}: PlayerEditMenuProps) {
  const { t } = useTranslation()

  const items = useMemo(() => {
    const list: ReadonlyArray<{
      key: string
      label: string
      onSelect: () => void
      Icon: ComponentType<HubMenuIconProps>
    }> = [
      ...(canEditSong
        ? [{ key: 'song', label: t('player.editSong'), onSelect: onEditSong, Icon: IconHubSongs }]
        : []),
      ...(playerType === 'setlist'
        ? [
            {
              key: 'setlist',
              label: t('player.editSetlist'),
              onSelect: onEditResource,
              Icon: IconHubSetlists,
            },
          ]
        : []),
      ...(playerType === 'collection'
        ? [
            {
              key: 'collection',
              label: t('player.editCollection'),
              onSelect: onEditResource,
              Icon: IconHubCollections,
            },
          ]
        : []),
    ]
    return list
  }, [canEditSong, onEditResource, onEditSong, playerType, t])

  if (items.length === 0) return null

  if (items.length === 1) {
    const { label, onSelect, Icon } = items[0]!
    return (
      <Button
        type="button"
        variant="outline"
        size="icon"
        className={playerHeaderIconButtonClass}
        aria-label={label}
        onClick={onSelect}
      >
        <Icon size={PLAYER_HEADER_ICON_SIZE} className={playerHeaderIconClass} />
      </Button>
    )
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className={playerHeaderIconButtonClass}
          aria-label={t('player.editMenuAria')}
        >
          <PencilIcon size={PLAYER_HEADER_ICON_SIZE} className={playerHeaderIconClass} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        {items.map(({ key, label, onSelect, Icon }) => (
          <DropdownMenuItem key={key} className="gap-2" onSelect={onSelect}>
            <Icon size={MENU_ICON_SIZE} className="shrink-0 text-[var(--color-foreground)]" />
            {label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
