import { useEffect, useMemo, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import type { components } from '@/api/schema'
import { PlayerBook } from '@/components/player/PlayerBook'
import { PlayerAv } from '@/components/player/av/PlayerAv'
import { Button } from '@/components/ui/button'
import { RoomPlayerShell } from '@/components/room/RoomPlayerShell'
import {
  clearMessageRoomCredentials,
  joinMessageRoom,
  readMessageRoomCredentials,
  type MessageRoomCredentials,
  type RoomBackground,
  type RoomDisplayMode,
} from '@/lib/room-message-api'
import {
  DEFAULT_AV_PREFERENCES,
  type AvBackgroundLayer,
  normalizeAvBackgroundPreset,
} from '@/lib/player/av-preferences'
import { completeRoomFlow } from '@/lib/room-slide-index'
import { rankRoomSongs } from '@/lib/room-message'
import { useMessageRoom } from '@/lib/use-message-room'
import type { TocDisplayEntry } from '@/lib/player/toc-display'

type Player = components['schemas']['Player']
type RoomSelection = { song: number; section: number; slide: number }

function avBackgroundLayer(background: RoomBackground | null): AvBackgroundLayer {
  if (!background) return DEFAULT_AV_PREFERENCES.backgroundLayer
  return {
    preset: normalizeAvBackgroundPreset(background.preset),
    ...(background.image
      ? { image: { mediaId: background.image.media_id, assetId: background.image.asset_id } }
      : {}),
  }
}

function songTitle(item: components['schemas']['PlayerChordsItem'], index: number): string {
  return item.song.data.titles?.find((title) => title.trim()) ?? item.song.id ?? `Song ${index + 1}`
}

function roomPlayer(content: NonNullable<ReturnType<typeof useMessageRoom>['content']>, selection: RoomSelection | null): Player {
  return {
    between_items: false,
    index: selection?.song ?? 0,
    items: content.items.map((item) => ({
      ...item,
      flow: completeRoomFlow(item.song.data.sections, item.flow),
      type: 'chords' as const,
    })),
    orientation: 'portrait',
    scroll_type: 'book',
    scroll_type_cache_other_orientation: 'book',
    toc: content.toc,
  }
}

function RoomStatusMessage({ status, error, roomId, initialMode }: {
  status: string
  error: string | null
  roomId: string
  initialMode: RoomDisplayMode
}) {
  const { t } = useTranslation()
  if (status === 'ended' || error === 'room_deleted') {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
        <h1 className="text-xl font-semibold">{t('rooms.ended')}</h1>
        <Button asChild variant="outline"><Link to="/rooms">{t('rooms.backToList')}</Link></Button>
      </main>
    )
  }
  if (status === 'failed') {
    const unauthorized = error === 'unauthorized'
    const returnTo = `/rooms/${encodeURIComponent(roomId)}${initialMode === 'sheet' ? '' : `?mode=${initialMode}`}`
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
        <h1 className="text-xl font-semibold">{t(unauthorized ? 'rooms.title' : 'rooms.connectionFailed')}</h1>
        <p className="max-w-md text-sm text-[var(--color-muted-foreground)]">{t(unauthorized ? 'rooms.signInToJoin' : 'rooms.connectionFailedDescription')}</p>
        {unauthorized ? <Button asChild><Link to="/login" search={{ return_to: returnTo }}>{t('login.cardTitle')}</Link></Button> : null}
        <Button asChild variant="outline"><Link to="/rooms">{t('rooms.backToList')}</Link></Button>
      </main>
    )
  }
  return <main className="flex min-h-dvh items-center justify-center p-6">{t(status === 'reconnecting' ? 'rooms.reconnecting' : 'common.load')}</main>
}

export function MessageRoomPage({ roomId, initialMode = 'sheet' }: { roomId: string; initialMode?: RoomDisplayMode }) {
  const { t } = useTranslation()
  const [credentials, setCredentials] = useState<MessageRoomCredentials | null>(null)
  const [joinError, setJoinError] = useState<string | null>(null)
  const room = useMessageRoom(roomId, credentials)

  useEffect(() => {
    let cancelled = false
    const saved = readMessageRoomCredentials(roomId)
    clearMessageRoomCredentials(roomId)
    const mode: RoomDisplayMode = initialMode ?? saved?.mode ?? 'sheet'
    const join = saved
      ? joinMessageRoom(roomId, mode, false, saved.resume_credential).catch((error: unknown) => {
          if (error instanceof Error && error.message === 'unauthorized') return joinMessageRoom(roomId, mode, true)
          throw error
        })
      : joinMessageRoom(roomId, mode, true)
    void join
      .then((next) => {
        if (!cancelled) setCredentials(next)
        else clearMessageRoomCredentials(roomId)
      })
      .catch((error: unknown) => {
        const code = error instanceof Error ? error.message : 'room_unavailable'
        if (!cancelled) setJoinError(code)
      })
    return () => {
      cancelled = true
      clearMessageRoomCredentials(roomId)
    }
  }, [initialMode, roomId])

  const player = useMemo(() => room.content ? roomPlayer(room.content, room.replay?.selection ?? null) : null, [room.content, room.replay?.selection])
  const sendSelection = (song: number, section: number, slide: number, activate = true) =>
    room.sendChange({ type: 'selection', song, section, slide, activate })
  const sendVote = (song: number, voted: boolean) => room.sendChange({ type: 'vote', song, voted })
  const sendBackground = (background: AvBackgroundLayer) => room.sendChange({
    type: 'set_background',
    background: {
      preset: background.preset,
      ...(background.image
        ? { image: { media_id: background.image.mediaId, asset_id: background.image.assetId } }
        : {}),
    },
  })

  if (joinError) return <RoomStatusMessage status="failed" error={joinError} roomId={roomId} initialMode={initialMode} />
  if (room.status === 'ended' || room.status === 'failed') return <RoomStatusMessage status={room.status} error={room.error} roomId={roomId} initialMode={initialMode} />
  if (!room.content || !room.replay || !credentials || !player) {
    return <RoomStatusMessage status={room.status} error={room.error} roomId={roomId} initialMode={initialMode} />
  }

  const selection = room.replay.selection
  const renderTocRowSuffix = (entry: TocDisplayEntry) => {
    const item = room.content?.items[entry.sourceIdx]
    const state = room.replay?.songs[entry.sourceIdx]
    if (!item || !state) return null
    const voted = state.voters.has(credentials.visit_id)
    const title = songTitle(item, entry.sourceIdx)
    return (
      <Button
        type="button"
        size="sm"
        variant={voted ? 'default' : 'outline'}
        className="h-8 shrink-0 px-2"
        aria-pressed={voted}
        aria-label={t('rooms.voteForSong', { title })}
        onClick={() => sendVote(entry.sourceIdx, !voted)}
      >
        ▲ {state.voters.size}
      </Button>
    )
  }
  const sharedPlayerProps = {
    type: 'song' as const,
    id: `message-room-${roomId}`,
    player,
    initialIndex: selection?.song ?? 0,
    allowNetworkFetch: false,
    allowLibraryActions: false,
    backToOverride: '/rooms' as const,
    roomSettingsReturn: { roomId, mode: credentials.mode },
    backAriaKeyOverride: 'rooms.backToList',
    resourceTitle: t('rooms.title'),
    sharedSelection: selection ? { ...selection } : null,
    onSharedSelectionChange: (song: number, section: number, slide: number, activate: boolean) =>
      sendSelection(song, section, slide, activate),
    renderTocRowSuffix,
    roomQueueOrder: rankRoomSongs(room.replay),
    roomMembers: room.members,
    roomOpenedAt: room.roomCreatedAt,
    roomVisitId: credentials.visit_id,
    roomDebugLog: room.debugLog,
  }
  const playerContent = room.content.items.length === 0 ? (
    <section className="flex h-full min-w-0 flex-col items-center justify-center p-6 text-center">
      <h1 className="text-xl font-semibold">{t('rooms.emptyRoomTitle')}</h1>
      <p className="mt-2 max-w-md text-sm text-[var(--color-muted-foreground)]">{t('rooms.emptyRoomDescription')}</p>
    </section>
  ) : credentials.mode === 'slide'
    ? <PlayerAv
        {...sharedPlayerProps}
        embedded
        slideOnly
        sharedBackgroundLayer={avBackgroundLayer(room.replay.background)}
        onSharedBackgroundChange={sendBackground}
      />
    : credentials.mode === 'av'
    ? <PlayerAv
        {...sharedPlayerProps}
        embedded
        showEmbeddedToc
        showEmbeddedRightPanel
        sharedBackgroundLayer={avBackgroundLayer(room.replay.background)}
        onSharedBackgroundChange={sendBackground}
      />
    : <PlayerBook {...sharedPlayerProps} mode="sheet" />

  return <RoomPlayerShell player={playerContent} />
}
