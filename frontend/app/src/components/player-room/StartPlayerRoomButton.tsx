import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { UsersIcon } from '@/components/icons/lucide-animated/users-icon'
import { Button } from '@/components/ui/button'
import { useOnline } from '@/hooks/use-online'
import { createPlayerRoom } from '@/lib/player-room'
import { readPlayerViewState } from '@/lib/player/player-view-state'
import type { PlayerMode } from '@/lib/player/player-mode'
import type { PlayerEntityType } from '@/lib/player-route'
import { songLanguageOptions } from '@/lib/player/song-language'
import { getAvProjectionSessionId, readAvProjectionSnapshot } from '@/lib/player/av-projection-sync'
import {
  PLAYER_HEADER_ICON_SIZE,
  playerHeaderIconButtonClass,
  playerHeaderIconClass,
} from '@/lib/player/player-chrome'
import type { components } from '@/api/schema'

export function StartPlayerRoomButton({
  type,
  id,
  mode,
  player,
}: {
  type: PlayerEntityType
  id: string
  mode: PlayerMode
  player: components['schemas']['Player']
}) {
  const { t } = useTranslation()
  const online = useOnline()
  const [pending, setPending] = useState(false)

  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      disabled={!online || pending || player.items.length === 0}
      className={playerHeaderIconButtonClass}
      aria-label={t('playerRooms.start')}
      aria-busy={pending}
      title={!online ? t('playerRooms.onlineRequired') : undefined}
      onClick={() => {
        setPending(true)
        const view = readPlayerViewState(type, id)
        const requestedIndex = view.itemIndex ?? player.index
        const itemIndex = Math.max(0, Math.min(
          Number.isInteger(requestedIndex) ? requestedIndex : 0,
          player.items.length - 1,
        ))
        const item = player.items[itemIndex]
        const languageIndex = view.languageByItem?.[itemIndex] ?? 0
        const languageOptions =
          item?.type === 'chords'
            ? songLanguageOptions(item.song.data as Record<string, unknown>)
            : []
        const language = languageOptions[languageIndex]?.label ?? null
        const latest = mode === 'av' ? readAvProjectionSnapshot(getAvProjectionSessionId()) : null
        const projection = latest
          ? {
              content_text: latest.contentText,
              content_lines: latest.contentLines,
              content_layer: latest.contentLayer,
              background_layer: latest.backgroundLayer,
              transition: latest.transition,
              screen_state: latest.screenState,
              item_title: latest.itemTitle,
              next_preview: latest.nextPreview,
            }
          : null
        void createPlayerRoom({
          source_type: type,
          source_id: id,
          host_mode: mode === 'av' ? 'av' : 'sheet',
          musical_state: {
            item_index: itemIndex,
            language,
            transposition: item?.type === 'chords' ? (view.transposeByItem[itemIndex] ?? null) : null,
          },
          projection,
        })
          .then((created) => {
            window.location.assign(`/player/room/${encodeURIComponent(created.room.id)}`)
          })
          .catch(() => {
            toast.error(t('playerRooms.createFailed'))
            setPending(false)
          })
      }}
    >
      <UsersIcon size={PLAYER_HEADER_ICON_SIZE} className={playerHeaderIconClass} />
    </Button>
  )
}
