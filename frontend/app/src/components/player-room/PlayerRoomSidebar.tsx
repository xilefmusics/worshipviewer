import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { PLAYER_TOC_WIDTH_CLASS } from '@/lib/player/player-chrome'
import {
  formatRoomDuration,
  participantModeLabel,
  useRoomElapsedSeconds,
  type PlayerRoomParticipant,
} from '@/lib/player-room'
import { cn } from '@/lib/utils'

type PlayerRoomSidebarProps = {
  name: string
  createdAt: string
  status: 'connected' | 'reconnecting' | 'connecting'
  participants: PlayerRoomParticipant[]
  isHost: boolean
  guestsAllowed: boolean
  onGuestsAllowedChange: (allowed: boolean) => void
  inviteSecret: string | null
  onEndRoom?: () => void
}

export function PlayerRoomSidebar({
  name,
  createdAt,
  status,
  participants,
  isHost,
  guestsAllowed,
  onGuestsAllowedChange,
  inviteSecret,
  onEndRoom,
}: PlayerRoomSidebarProps) {
  const { t } = useTranslation()
  const elapsedSeconds = useRoomElapsedSeconds(createdAt)
  const durationLabel = formatRoomDuration(elapsedSeconds)
  const statusLabel =
    status === 'connected' ? t('playerRooms.connected') : t('playerRooms.reconnecting')

  return (
    <aside
      className={cn(
        'flex h-full min-h-0 shrink-0 flex-col border-l border-[var(--color-border)] bg-[var(--color-surface)]',
        PLAYER_TOC_WIDTH_CLASS,
      )}
      aria-label={t('playerRooms.title')}
    >
      <div className="shrink-0 border-b border-[var(--color-border)] p-3">
        <h2 className="truncate text-sm font-semibold">{name}</h2>
        <p className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-[var(--color-muted-foreground)]">
          <time dateTime={`PT${elapsedSeconds}S`}>{durationLabel}</time>
          <span aria-hidden>·</span>
          <span className="inline-flex items-center gap-1">
            {status === 'connected' ? (
              <span
                className="size-1.5 shrink-0 rounded-full bg-[oklch(0.72_0.17_145)]"
                aria-hidden
              />
            ) : null}
            {statusLabel}
          </span>
          <span aria-hidden>·</span>
          <span>{participants.length}</span>
        </p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2">
        <p className="px-2 pb-2 text-xs font-medium uppercase tracking-wide text-[var(--color-muted-foreground)]">
          {t('playerRooms.participants')}
        </p>
        <ul className="space-y-1">
          {participants.map((participant) => (
            <li
              key={participant.id}
              className={cn(
                'rounded-md px-2 py-2',
                !participant.connected && 'opacity-60',
              )}
            >
              <p className="truncate text-sm font-medium">
                {participant.display_name}
                {participant.anonymous ? (
                  <span className="font-normal text-[var(--color-muted-foreground)]">
                    {' '}
                    {t('playerRooms.guestBadge')}
                  </span>
                ) : null}
              </p>
              <p className="text-xs text-[var(--color-muted-foreground)]">
                {participantModeLabel(participant, t)}
                {participant.is_host ? ` · ${t('playerRooms.host')}` : null}
                {participant.is_av_host ? ` · ${t('playerRooms.avHost')}` : null}
              </p>
            </li>
          ))}
        </ul>
      </div>

      {isHost ? (
        <div className="flex shrink-0 flex-col gap-2 border-t border-[var(--color-border)] p-3">
          <label className="flex items-center gap-3 text-sm">
            <input
              type="checkbox"
              className="size-4 shrink-0 accent-[var(--color-primary)]"
              aria-label={t('playerRooms.allowGuests.label')}
              checked={guestsAllowed}
              onChange={(event) => onGuestsAllowedChange(event.target.checked)}
            />
            <span>{t('playerRooms.allowGuests.label')}</span>
          </label>
          {inviteSecret ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!guestsAllowed}
              title={!guestsAllowed ? t('playerRooms.allowGuests.copyDisabled') : undefined}
              onClick={() => {
                void navigator.clipboard
                  .writeText(`${window.location.origin}/player-rooms/invite#${inviteSecret}`)
                  .then(() => toast.success(t('playerRooms.inviteCopied')))
              }}
            >
              {t('playerRooms.copyInvite')}
            </Button>
          ) : null}
          <Button type="button" variant="destructive" size="sm" onClick={onEndRoom}>
            {t('playerRooms.end')}
          </Button>
        </div>
      ) : null}
    </aside>
  )
}
