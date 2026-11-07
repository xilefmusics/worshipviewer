import { useEffect, useMemo, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import type { components } from '@/api/schema'
import { PlayerBook } from '@/components/player/PlayerBook'
import { PlayerAv } from '@/components/player/av/PlayerAv'
import { Button } from '@/components/ui/button'
import { RoomThreePanelShell } from '@/components/room/RoomThreePanelShell'
import {
  clearMessageRoomCredentials,
  joinMessageRoom,
  readMessageRoomCredentials,
  roomDebugOptionsEnabled,
  type MessageRoomCredentials,
  type RoomDisplayMode,
} from '@/lib/room-message-api'
import { rankRoomSongs } from '@/lib/room-message'
import { serializeRoomDebugLog } from '@/lib/room-message-debug'
import { completeRoomFlow } from '@/lib/room-slide-index'
import { useMessageRoom } from '@/lib/use-message-room'

type Player = components['schemas']['Player']
type RoomSelection = { song: number; slide: number }

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

function RoomStatusMessage({ status, error, roomId }: { status: string; error: string | null; roomId: string }) {
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
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
        <h1 className="text-xl font-semibold">{t(unauthorized ? 'rooms.title' : 'rooms.connectionFailed')}</h1>
        <p className="max-w-md text-sm text-[var(--color-muted-foreground)]">{t(unauthorized ? 'rooms.signInToJoin' : 'rooms.connectionFailedDescription')}</p>
        {unauthorized ? <Button asChild><Link to="/login" search={{ return_to: `/rooms/${encodeURIComponent(roomId)}` }}>{t('login.cardTitle')}</Link></Button> : null}
        <Button asChild variant="outline"><Link to="/rooms">{t('rooms.backToList')}</Link></Button>
      </main>
    )
  }
  return <main className="flex min-h-dvh items-center justify-center p-6">{t(status === 'reconnecting' ? 'rooms.reconnecting' : 'common.load')}</main>
}

function MessageQueue({
  roomId,
  items,
  replay,
  visitId,
  selection,
  onActivate,
  onVote,
}: {
  roomId: string
  items: components['schemas']['PlayerChordsItem'][]
  replay: NonNullable<ReturnType<typeof useMessageRoom>['replay']>
  visitId: string
  selection: RoomSelection | null
  onActivate: (song: number, slide: number, activate: boolean) => void
  onVote: (song: number, voted: boolean) => void
}) {
  const { t } = useTranslation()
  const ranked = rankRoomSongs(replay)
  return (
    <aside className="flex h-full min-h-0 flex-col border-r border-[var(--color-border)] bg-[var(--color-surface)]" aria-label={t('rooms.queue.title')}>
      <h2 className="shrink-0 border-b border-[var(--color-border)] p-3 text-sm font-semibold">{t('rooms.queue.title')}</h2>
      <ol className="min-h-0 flex-1 space-y-1 overflow-y-auto p-2">
        {ranked.map((songIndex, rank) => {
          const item = items[songIndex]
          const state = replay.songs[songIndex]
          if (!item || !state) return null
          const active = selection?.song === songIndex
          const voted = state.voters.has(visitId)
          return (
            <li key={`${roomId}:${songIndex}`} className={`rounded-md border p-2 ${active ? 'border-[var(--color-primary)] bg-[var(--color-muted)]' : 'border-transparent'}`}>
              <div className="flex items-start gap-2">
                <Button type="button" variant="ghost" className="h-auto min-w-0 flex-1 justify-start whitespace-normal p-1 text-left" aria-current={active ? 'true' : undefined} onClick={() => onActivate(songIndex, 0, true)}>
                  <span className="mr-2 text-xs text-[var(--color-muted-foreground)]">{rank + 1}.</span>
                  <span className="text-sm">{songTitle(item, songIndex)}</span>
                </Button>
                <Button type="button" size="sm" variant={voted ? 'default' : 'outline'} aria-pressed={voted} aria-label={t('rooms.voteForSong', { title: songTitle(item, songIndex) })} onClick={() => onVote(songIndex, !voted)}>
                  ▲ {state.voters.size}
                </Button>
              </div>
              <p className="px-1 text-xs text-[var(--color-muted-foreground)]">{state.played ? t('rooms.played') : t('rooms.notPlayed')}</p>
              {item.song.data.sections.length > 0 ? (
                <details className="mt-1 px-1 text-xs">
                  <summary className="cursor-pointer text-[var(--color-muted-foreground)]">{t('rooms.sections')}</summary>
                  <ul className="mt-1 space-y-1 pl-2">
                    {item.song.data.sections.map((section, slide) => (
                      <li key={`${section.title}:${slide}`}>
                        <Button type="button" size="sm" variant="ghost" className="h-auto justify-start whitespace-normal p-1 text-left text-xs" aria-current={active && selection?.slide === slide ? 'true' : undefined} onClick={() => onActivate(songIndex, slide, !active)}>
                          {section.title || t('rooms.untitledSection')}
                        </Button>
                      </li>
                    ))}
                  </ul>
                </details>
              ) : null}
            </li>
          )
        })}
      </ol>
      {items.length === 0 ? <p className="p-4 text-sm text-[var(--color-muted-foreground)]">{t('rooms.emptyPool')}</p> : null}
    </aside>
  )
}

function MessageRoomDetails({
  name,
  status,
  members,
  debugEnabled,
  debugLog,
  roomId,
}: {
  name: string
  status: string
  members: ReturnType<typeof useMessageRoom>['members']
  debugEnabled: boolean
  debugLog: ReturnType<typeof useMessageRoom>['debugLog']
  roomId: string
}) {
  const { t } = useTranslation()
  const [debugOpen, setDebugOpen] = useState(false)
  const json = serializeRoomDebugLog(debugLog)
  const downloadHref = `data:application/json;charset=utf-8,${encodeURIComponent(json)}`
  const statusText = status === 'connected' ? t('rooms.connected') : t('rooms.reconnecting')
  return (
    <aside className="flex h-full min-h-0 flex-col border-l border-[var(--color-border)] bg-[var(--color-surface)]" aria-label={t('rooms.details')}>
      <div className="shrink-0 border-b border-[var(--color-border)] p-3">
        <h2 className="truncate text-sm font-semibold">{name}</h2>
        <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">{statusText} · {members.length}</p>
        <Button type="button" size="sm" variant="outline" className="mt-2 w-full" onClick={() => void navigator.clipboard?.writeText(`${window.location.origin}/rooms/${encodeURIComponent(roomId)}`)}>
          {t('rooms.copyLink')}
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        <p className="px-2 pb-2 text-xs font-medium uppercase tracking-wide text-[var(--color-muted-foreground)]">{t('rooms.participants')}</p>
        <ul className="space-y-1">
          {members.map((member) => <li key={member.visit_id} className="truncate rounded-md px-2 py-2 text-sm">{member.display_name}</li>)}
        </ul>
      </div>
      {debugEnabled ? (
        <div className="shrink-0 border-t border-[var(--color-border)] p-3">
          <Button type="button" size="sm" variant="outline" className="w-full" onClick={() => setDebugOpen((open) => !open)} aria-expanded={debugOpen}>
            {t(debugOpen ? 'rooms.debug.close' : 'rooms.debug.open')}
          </Button>
          {debugOpen ? (
            <div className="mt-2 space-y-2">
              {debugLog.truncated ? <p className="text-xs text-[var(--color-warning)]">{t('rooms.debug.truncated')}</p> : null}
              <a className="inline-block text-sm underline" href={downloadHref} download={`room-${debugLog.room_id}-messages.json`}>{t('rooms.debug.download')}</a>
              <pre className="max-h-64 overflow-auto rounded bg-[var(--color-muted)] p-2 text-xs" data-testid="room-debug-log">{json}</pre>
            </div>
          ) : null}
        </div>
      ) : null}
    </aside>
  )
}

export function MessageRoomPage({ roomId, initialMode = 'sheet' }: { roomId: string; initialMode?: RoomDisplayMode }) {
  const { t } = useTranslation()
  const [credentials, setCredentials] = useState<MessageRoomCredentials | null>(null)
  const [joinError, setJoinError] = useState<string | null>(null)
  const [debugEnabled] = useState(roomDebugOptionsEnabled)
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
  const sendSelection = (song: number, slide = 0, activate = true) => room.sendChange({ type: 'selection', song, slide, activate })
  const sendVote = (song: number, voted: boolean) => room.sendChange({ type: 'vote', song, voted })

  if (joinError) return <RoomStatusMessage status="failed" error={joinError} roomId={roomId} />
  if (room.status === 'ended' || room.status === 'failed') return <RoomStatusMessage status={room.status} error={room.error} roomId={roomId} />
  if (!room.content || !room.replay || !credentials || !player) {
    return <RoomStatusMessage status={room.status} error={room.error} roomId={roomId} />
  }

  const selection = room.replay.selection
  const queue = <MessageQueue roomId={roomId} items={room.content.items} replay={room.replay} visitId={credentials.visit_id} selection={selection} onActivate={sendSelection} onVote={sendVote} />
  const details = <MessageRoomDetails roomId={roomId} name={room.roomName || t('rooms.title')} status={room.status} members={room.members} debugEnabled={debugEnabled} debugLog={room.debugLog} />
  const sharedPlayerProps = {
    type: 'song' as const,
    id: `message-room-${roomId}`,
    player,
    initialIndex: selection?.song ?? 0,
    allowNetworkFetch: false,
    allowLibraryActions: false,
    backToOverride: '/rooms' as const,
    backAriaKeyOverride: 'rooms.backToList',
    resourceTitle: t('rooms.title'),
    sharedSelection: selection ? { ...selection } : null,
    onSharedSelectionChange: (song: number, slide: number, activate: boolean) => sendSelection(song, slide, activate),
  }
  const playerContent = room.content.items.length === 0 ? (
    <section className="flex h-full min-w-0 flex-col items-center justify-center p-6 text-center">
      <h1 className="text-xl font-semibold">{t('rooms.emptyRoomTitle')}</h1>
      <p className="mt-2 max-w-md text-sm text-[var(--color-muted-foreground)]">{t('rooms.emptyRoomDescription')}</p>
    </section>
  ) : credentials.mode === 'av'
    ? <PlayerAv {...sharedPlayerProps} embedded />
    : <PlayerBook {...sharedPlayerProps} mode="sheet" />

  return <RoomThreePanelShell queue={queue} player={playerContent} details={details} />
}
