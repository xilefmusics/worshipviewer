import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import {
  PlayerRoomJoinSheet,
} from '@/components/player-room/PlayerRoomJoinSheet'
import { playerRoomJoinModeChoiceToWire } from '@/lib/player-room-join-mode'
import { inspectPlayerRoomInvite, joinPlayerRoomInvite } from '@/lib/player-room'
import { randomPlayerRoomGuestDisplayName } from '@/lib/player-room-guest-name'

export const Route = createFileRoute('/player-rooms/invite/')({ component: InviteRoute })

function InviteRoute() {
  const { t } = useTranslation()
  const [secret] = useState(() => window.location.hash.slice(1))
  const [info, setInfo] = useState<{
    room_id: string
    name: string
    host_email: string
    av_occupied: boolean
    guests_allowed?: boolean
  } | null>(null)
  const [ended, setEnded] = useState(() => !window.location.hash.slice(1))
  const [name, setName] = useState(randomPlayerRoomGuestDisplayName)
  const [pending, setPending] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(true)

  useEffect(() => {
    if (secret) {
      void inspectPlayerRoomInvite(secret).then(setInfo).catch(() => setEnded(true))
    }
  }, [secret])

  if (ended) {
    return (
      <main className="flex min-h-dvh items-center justify-center p-6">
        <h1>{t('playerRooms.ended')}</h1>
      </main>
    )
  }

  if (!info) {
    return <main className="flex min-h-dvh items-center justify-center p-6">{t('common.load')}</main>
  }

  const guestsAllowed = info.guests_allowed !== false

  if (!guestsAllowed) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 p-6 text-center">
        <h1 className="text-2xl font-semibold">{info.name}</h1>
        <p className="text-sm text-[var(--color-muted-foreground)]">{info.host_email}</p>
        <p className="text-sm text-[var(--color-muted-foreground)]">{t('playerRooms.guestsNotAllowed')}</p>
      </main>
    )
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 p-6">
      {!sheetOpen ? (
        <>
          <h1 className="text-2xl font-semibold">{info.name}</h1>
          <p className="text-sm text-[var(--color-muted-foreground)]">{info.host_email}</p>
          <Button type="button" onClick={() => setSheetOpen(true)}>
            {t('playerRooms.join')}
          </Button>
        </>
      ) : null}
      <PlayerRoomJoinSheet
        sheetId={info.room_id}
        title={info.name}
        avOccupied={info.av_occupied}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        displayName={name}
        onDisplayNameChange={setName}
        pending={pending}
        onJoin={(choice) => {
          const { mode, hideChords } = playerRoomJoinModeChoiceToWire(choice)
          setPending(true)
          void joinPlayerRoomInvite({
            invite_secret: secret,
            display_name: name.trim(),
            mode,
            hide_chords: hideChords,
          })
            .then((credentials) =>
              window.location.replace(`/player-rooms/invite/${encodeURIComponent(credentials.room_id)}`),
            )
            .catch(() => setPending(false))
        }}
      />
    </main>
  )
}
