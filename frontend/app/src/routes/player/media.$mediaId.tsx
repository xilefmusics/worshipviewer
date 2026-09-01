import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { fetchMedia, mediaDetailKey } from '@/api/media'
import type { components } from '@/api/schema'
import { PlayerAv } from '@/components/player/av/PlayerAv'
import { Button } from '@/components/ui/button'

type Player = components['schemas']['Player']

export const Route = createFileRoute('/player/media/$mediaId')({
  component: DirectMediaPlayerPage,
})

export function playerFromReadyMedia(media: components['schemas']['Media']): Player | null {
  return {
    items: [{ type: 'media', id: media.id, title: media.title, content: media.content }],
    toc: [{ idx: 0, id: media.id, title: media.title, nr: '', liked: false }],
    scroll_type: 'one_page',
    scroll_type_cache_other_orientation: 'book',
    orientation: 'portrait',
    between_items: false,
    index: 0,
  }
}

function DirectMediaPlayerPage() {
  const { t } = useTranslation()
  const { mediaId } = Route.useParams()
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: mediaDetailKey(mediaId),
    queryFn: ({ signal }) => fetchMedia(queryClient, mediaId, signal),
    retry: false,
  })
  const player = query.data ? playerFromReadyMedia(query.data) : null

  if (query.isPending) return <div className="flex min-h-dvh items-center justify-center p-6 text-[var(--color-muted-foreground)]">{t('common.load')}</div>
  if (query.isError || !player) {
    return <div className="mx-auto flex min-h-dvh max-w-lg flex-col items-center justify-center gap-4 p-6 text-center"><p role="alert" className="text-sm text-[var(--color-muted-foreground)]">{t('setlists.editor.directMediaUnavailable')}</p><Button asChild variant="outline"><Link to="/media">{t('media.editor.backToList')}</Link></Button></div>
  }
  return <PlayerAv type="setlist" id={`direct-media:${mediaId}`} player={player} allowNetworkFetch resourceTitle={query.data.title} allowLibraryActions={false} backToOverride="/media" backAriaKeyOverride="media.editor.backToList" watchSetlistEviction={false} />
}
