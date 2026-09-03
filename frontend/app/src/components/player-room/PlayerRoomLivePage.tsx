import { useCallback, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { PlayerBook } from '@/components/player/PlayerBook'
import { PlayerAv } from '@/components/player/av/PlayerAv'
import { AvSlideView } from '@/components/player/av/AvSlideView'
import { PlayerRoomSidebar } from '@/components/player-room/PlayerRoomSidebar'
import { PlayerRoomQueuePanel } from '@/components/player-room/PlayerRoomQueuePanel'
import { PlayerRoomThreePanelShell } from '@/components/player-room/PlayerRoomThreePanelShell'
import {
  endPlayerRoom,
  playerFromRoom,
  playerRoomShortName,
  readRoomInvite,
  usePlayerRoom,
  type PlayerRoomCredentials,
  type PlayerRoomProjection,
} from '@/lib/player-room'
import type { AvProjectionPayload } from '@/lib/player/av-preferences'
import { registerPlayerRoomMedia } from '@/lib/player-room-media'

function projectionToWire(payload: AvProjectionPayload): PlayerRoomProjection {
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

function SlideModeShell({ projection }: { projection: PlayerRoomProjection | null }) {
  return (
    <div
      data-testid="player-room-slide-canvas"
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

export function PlayerRoomLivePage({ credentials }: { credentials: PlayerRoomCredentials }) {
  const { t } = useTranslation()
  const room = usePlayerRoom(credentials)
  const { sendProjection, sendGuestsAllowed } = room
  const sendRoomProjection = useCallback(
    (payload: AvProjectionPayload) => sendProjection(projectionToWire(payload)),
    [sendProjection],
  )
  const snapshot = room.snapshot
  const participant = snapshot?.participants.find((row) => row.id === credentials.participant_id)
  const roomPlayer = useMemo(() => (snapshot ? playerFromRoom(snapshot) : null), [snapshot])
  useEffect(() => {
    if (!snapshot) return
    const contentIds = snapshot.content.items.flatMap((item) =>
      item.type === 'blob'
        ? [item.blob_id]
        : item.type === 'chords'
          ? item.song.blobs.map((blob) => blob.id)
          : [],
    )
    const queueIds = snapshot.queue.flatMap((item) => item.song.song.blobs.map((blob) => blob.id))
    return registerPlayerRoomMedia(snapshot.id, credentials.resume_credential, [...new Set([...contentIds, ...queueIds])])
  }, [credentials.resume_credential, snapshot])

  if (room.status === 'ended') {
    return (
      <main className="flex min-h-dvh items-center justify-center p-6 text-center">
        <h1 className="text-xl font-semibold">{t('playerRooms.ended')}</h1>
      </main>
    )
  }

  if (!snapshot || !roomPlayer || !participant) {
    return (
      <main className="flex min-h-dvh items-center justify-center p-6">
        {room.status === 'reconnecting' ? t('playerRooms.reconnecting') : t('common.load')}
      </main>
    )
  }

  const roomDetails = (
    <PlayerRoomSidebar
      name={playerRoomShortName(snapshot)}
      createdAt={snapshot.created_at}
      status={room.status === 'connected' ? 'connected' : 'reconnecting'}
      participants={snapshot.participants}
      isHost={participant.is_host}
      roomId={snapshot.id}
      revision={snapshot.revision}
      songPool={snapshot.song_pool}
      canClose={participant.is_host || snapshot.can_close === true}
      guestsAllowed={snapshot.guests_allowed !== false}
      onGuestsAllowedChange={sendGuestsAllowed}
      inviteSecret={participant.is_host ? readRoomInvite(snapshot.id) : null}
      onEndRoom={
        participant.is_host || snapshot.can_close
          ? () => {
              void endPlayerRoom(snapshot.id)
            }
          : undefined
      }
      className="w-full border-l-0"
    />
  )

  const queuePanel = (
    <PlayerRoomQueuePanel
      roomId={snapshot.id}
      queue={snapshot.queue}
      revision={snapshot.revision}
      canAdd={!participant.anonymous}
      canManage={participant.is_host}
      songPool={snapshot.song_pool}
      className="border-r-0"
    />
  )

  if (credentials.mode === 'slide') {
    return (
      <PlayerRoomThreePanelShell
        queue={queuePanel}
        player={<SlideModeShell projection={snapshot.projection} />}
        details={roomDetails}
      />
    )
  }

  if (snapshot.content.items.length === 0) {
    return (
      <PlayerRoomThreePanelShell
        queue={queuePanel}
        player={
          <section className="flex h-full min-w-0 flex-col items-center justify-center p-6 text-center">
          <h1 className="text-xl font-semibold">{t('playerRooms.emptyRoomTitle')}</h1>
          <p className="mt-2 max-w-md text-sm text-[var(--color-muted-foreground)]">
            {t('playerRooms.emptyRoomDescription')}
          </p>
          </section>
        }
        details={roomDetails}
      />
    )
  }

  const shared = {
    type: snapshot.source_type ?? 'song',
    id: `room-${snapshot.id}`,
    player: roomPlayer,
    initialIndex: snapshot.musical_state.item_index,
    allowNetworkFetch: true,
    allowLibraryActions: false,
    resourceTitle: snapshot.source_title ?? snapshot.name,
    roomMusicalState: snapshot.musical_state,
    roomStateRevision: snapshot.revision,
    canControlRoomMusicalState: participant.is_host,
    onRoomMusicalStateChange: room.sendMusicalState,
  }

  const player = credentials.mode === 'av' ? (
    <PlayerAv
      {...shared}
      embedded
      canControlRoomProjection={participant.is_av_host}
      onRoomProjectionChange={sendRoomProjection}
    />
  ) : (
    <PlayerBook {...shared} embedded mode="normal" />
  )

  return <PlayerRoomThreePanelShell queue={queuePanel} player={player} details={roomDetails} />
}
