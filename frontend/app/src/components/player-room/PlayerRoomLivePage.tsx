import { useCallback, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { PlayerBook } from '@/components/player/PlayerBook'
import { PlayerAv } from '@/components/player/av/PlayerAv'
import { AvSlideView } from '@/components/player/av/AvSlideView'
import { PlayerRoomSidebar } from '@/components/player-room/PlayerRoomSidebar'
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
      className="h-dvh w-dvw overflow-hidden bg-black"
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
  const player = useMemo(() => (snapshot ? playerFromRoom(snapshot) : null), [snapshot])
  useEffect(() => {
    if (!snapshot) return
    const ids = snapshot.content.items.flatMap((item) =>
      item.type === 'blob' ? [item.blob_id] : item.song.blobs.map((blob) => blob.id),
    )
    return registerPlayerRoomMedia(snapshot.id, credentials.resume_credential, ids)
  }, [credentials.resume_credential, snapshot])

  if (room.status === 'ended') {
    return (
      <main className="flex min-h-dvh items-center justify-center p-6 text-center">
        <h1 className="text-xl font-semibold">{t('playerRooms.ended')}</h1>
      </main>
    )
  }

  if (!snapshot || !player || !participant) {
    return (
      <main className="flex min-h-dvh items-center justify-center p-6">
        {room.status === 'reconnecting' ? t('playerRooms.reconnecting') : t('common.load')}
      </main>
    )
  }

  if (credentials.mode === 'slide') {
    return <SlideModeShell projection={snapshot.projection} />
  }

  const roomSidebar = (
    <PlayerRoomSidebar
      name={playerRoomShortName(snapshot)}
      createdAt={snapshot.created_at}
      status={room.status === 'connected' ? 'connected' : 'reconnecting'}
      participants={snapshot.participants}
      isHost={participant.is_host}
      guestsAllowed={snapshot.guests_allowed !== false}
      onGuestsAllowedChange={sendGuestsAllowed}
      inviteSecret={participant.is_host ? readRoomInvite(snapshot.id) : null}
      onEndRoom={
        participant.is_host
          ? () => {
              void endPlayerRoom(snapshot.id, credentials.resume_credential)
            }
          : undefined
      }
    />
  )

  const roomPanelProps = { roomSidebar }

  const shared = {
    type: snapshot.source_type,
    id: `room-${snapshot.id}`,
    player,
    initialIndex: snapshot.musical_state.item_index,
    allowNetworkFetch: true,
    allowLibraryActions: false,
    resourceTitle: snapshot.source_title,
    roomMusicalState: snapshot.musical_state,
    roomStateRevision: snapshot.revision,
    canControlRoomMusicalState: participant.is_host,
    onRoomMusicalStateChange: room.sendMusicalState,
    ...roomPanelProps,
  }

  return credentials.mode === 'av' ? (
    <PlayerAv
      {...shared}
      canControlRoomProjection={participant.is_av_host}
      onRoomProjectionChange={sendRoomProjection}
    />
  ) : (
    <PlayerBook {...shared} mode="normal" />
  )
}
