import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { ListMusicIcon } from '@/components/icons/lucide-animated/list-music-icon'
import { Button } from '@/components/ui/button'
import { ALL_SONGS_LIBRARY_ID } from '@/lib/all-songs-player'
import { buildPlayerSearch } from '@/lib/player-route'

export function PlayAllSongsButton() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const label = t('hub.actions.playAllSongs')

  return (
    <Button
      type="button"
      className="mb-3 w-full justify-center"
      aria-label={label}
      onClick={() => {
        void navigate({
          to: '/player',
          search: buildPlayerSearch({
            type: 'library',
            id: ALL_SONGS_LIBRARY_ID,
            toc: 'order',
          }),
        })
      }}
    >
      <ListMusicIcon size={18} />
      {label}
    </Button>
  )
}
