import { useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { PlayerBook } from '@/components/player/PlayerBook'
import { PlayerAv } from '@/components/player/av/PlayerAv'
import { AvSlideView } from '@/components/player/av/AvSlideView'
import { RoomSidebar } from '@/components/room/RoomSidebar'
import { RoomQueuePanel } from '@/components/room/RoomQueuePanel'
import { RoomThreePanelShell } from '@/components/room/RoomThreePanelShell'
import { useIsPhoneWidth } from '@/hooks/useMediaQuery'
import { PLAYER_TOC_WIDTH_CLASS } from '@/lib/player/player-chrome'
import {
  endRoom,
  playerFromRoom,
  roomShortName,
  promoteRoomQueueItem,
  readRoomInvite,
  useRoom,
  type RoomCredentials,
  type RoomProjection,
} from '@/lib/room'
import type { AvProjectionPayload } from '@/lib/player/av-preferences'

function projectionToWire(payload: AvProjectionPayload): RoomProjection {
  return {
    content_text: payload.contentText,
    content_lines: payload.contentLines,
    content_layer: payload.contentLayer,
    background_layer: payload.backgroundLayer,
    transition: payload.transition,
    screen_state: payload.screenState,
    item_title: payload.itemTitle,
    next_preview: payload.nextPreview,
  }
}

function SlideModeShell({ projection }: { projection: RoomProjection | null }) {
  return (
    <div
      data-testid="room-slide-canvas"
      className="h-full w-full overflow-hidden bg-black"
      onDoubleClick={() => {
        void document.documentElement.requestFullscreen?.()
      }}
    >
      {projection ? (
        <AvSlideView
          contentText={projection.content_text}
          contentLines={projection.content_lines as never}
          contentLayer={projection.content_layer as never}
          backgroundLayer={projection.background_layer as never}
          transition={projection.transition as never}
          screenState={projection.screen_state}
        />
      ) : null}
    </div>
  )
}

export function RoomLivePage({ credentials }: { credentials: RoomCredentials }) {
  const { t } = useTranslation()
  const isPhoneViewport = useIsPhoneWidth()
  const room = useRoom(credentials)
  const { sendProjection, sendGuestAccessAllowed, sendNewJoinsLocked, sendQueueVote } = room
  const sendRoomProjection = useCallback(
    (payload: AvProjectionPayload) => sendProjection(projectionToWire(payload)),
    [sendProjection],
  )
  const snapshot = room.snapshot
  const session = snapshot?.sessions.find((row) => row.id === credentials.session_id)
  const roomPlayer = useMemo(() => (snapshot ? playerFromRoom(snapshot) : null), [snapshot])
  const currentSongId = useMemo(() => {
    if (!snapshot?.musical_state.started) return null
    const item = snapshot?.content.items[snapshot.musical_state.item_index]
    return item?.song.id ?? null
  }, [snapshot])
  const promoteQueueTop = useCallback(() => {
    const first = snapshot?.queue[0]
    if (!first || !session?.is_host || !snapshot) return
    void promoteRoomQueueItem(snapshot.id, first.id, snapshot.revision)
  }, [session?.is_host, snapshot])
  if (room.status === 'ended') {
    return (
      <main className="flex min-h-dvh items-center justify-center p-6 text-center">
        <h1 className="text-xl font-semibold">{t('rooms.ended')}</h1>
      </main>
    )
  }

  if (!snapshot || !roomPlayer || !session) {
    return (
      <main className="flex min-h-dvh items-center justify-center p-6">
        {room.status === 'reconnecting' ? t('rooms.reconnecting') : t('common.load')}
      </main>
    )
  }

  const roomDetails = (
    <RoomSidebar
      name={roomShortName(snapshot)}
      createdAt={snapshot.created_at}
      status={room.status === 'connected' ? 'connected' : 'reconnecting'}
      sessions={snapshot.sessions}
      isHost={session.is_host}
      roomId={snapshot.id}
      revision={snapshot.revision}
      queueAdditionsAllowed={snapshot.queue_additions_allowed}
      canClose={session.is_host || snapshot.can_close === true}
      guestAccessAllowed={snapshot.guest_access_allowed !== false}
      onGuestAccessAllowedChange={sendGuestAccessAllowed}
      newJoinsLocked={snapshot.new_joins_locked === true}
      onNewJoinsLockedChange={sendNewJoinsLocked}
      inviteSecret={session.is_host ? readRoomInvite(snapshot.id) : null}
      onEndRoom={
        session.is_host || snapshot.can_close
          ? () => {
              void endRoom(snapshot.id)
            }
          : undefined
      }
      className={isPhoneViewport ? 'w-full border-l-0' : `${PLAYER_TOC_WIDTH_CLASS} border-l-0`}
    />
  )

  const queuePanel = (
    <RoomQueuePanel
      roomId={snapshot.id}
      queue={snapshot.queue}
      revision={snapshot.revision}
      votedQueueIds={snapshot.voted_queue_ids ?? []}
      canAdd={!session.anonymous}
      canManage={session.is_host}
      onVote={sendQueueVote}
      queueAdditionsAllowed={snapshot.queue_additions_allowed}
      currentSongId={currentSongId}
      className="w-full min-w-0 border-r-0"
    />
  )

  if (credentials.mode === 'slide') {
    return (
      <RoomThreePanelShell
        queue={queuePanel}
        player={<SlideModeShell projection={snapshot.projection} />}
        details={roomDetails}
        desktopOverlay={!isPhoneViewport}
      />
    )
  }

  if (snapshot.content.items.length === 0) {
    return (
      <RoomThreePanelShell
        queue={queuePanel}
        player={
          <section className="flex h-full min-w-0 flex-col items-center justify-center p-6 text-center">
            <h1 className="text-xl font-semibold">{t('rooms.emptyRoomTitle')}</h1>
            <p className="mt-2 max-w-md text-sm text-[var(--color-muted-foreground)]">
              {t('rooms.emptyRoomDescription')}
            </p>
          </section>
        }
        details={roomDetails}
        desktopOverlay={!isPhoneViewport}
      />
    )
  }

  const shared = {
    type: 'song' as const,
    id: `room-${snapshot.id}`,
    player: roomPlayer,
    initialIndex: snapshot.musical_state.item_index,
    allowNetworkFetch: true,
    allowLibraryActions: false,
    backToOverride: '/rooms' as const,
    backAriaKeyOverride: 'rooms.backToList',
    resourceTitle: snapshot.name,
    roomMusicalState: snapshot.musical_state,
    roomStateRevision: snapshot.revision,
    canControlRoomMusicalState: session.is_host,
    onRoomMusicalStateChange: room.sendMusicalState,
    onRoomQueueNext: session.is_host ? promoteQueueTop : undefined,
  }

  const player = credentials.mode === 'av' ? (
    <PlayerAv
      key={`room-av-${isPhoneViewport ? 'embedded' : 'desktop'}`}
      {...shared}
      {...(isPhoneViewport ? { embedded: true } : { tocSidebar: queuePanel, roomSidebar: roomDetails })}
      canControlRoomProjection={session.is_av_host}
      onRoomProjectionChange={sendRoomProjection}
    />
  ) : (
    <PlayerBook
      key={`room-book-${isPhoneViewport ? 'embedded' : 'desktop'}`}
      {...shared}
      {...(isPhoneViewport ? { embedded: true } : { tocSidebar: queuePanel, roomSidebar: roomDetails })}
      mode="sheet"
    />
  )

  return isPhoneViewport ? (
    <RoomThreePanelShell queue={queuePanel} player={player} details={roomDetails} />
  ) : (
    player
  )
}
