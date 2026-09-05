import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { RoomQueueAccessControl } from '@/components/room/RoomQueueAccessControl'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { PLAYER_TOC_WIDTH_CLASS } from '@/lib/player/player-chrome'
import {
  formatRoomDuration,
  participantModeLabel,
  useRoomElapsedSeconds,
  type RoomParticipant,
} from '@/lib/room'
import { cn } from '@/lib/utils'

type RoomSidebarProps = {
  name: string
  createdAt: string
  status: 'connected' | 'reconnecting' | 'connecting'
  participants: RoomParticipant[]
  isHost: boolean
  canClose: boolean
  guestsAllowed: boolean
  onGuestsAllowedChange: (allowed: boolean) => void
  locked: boolean
  onRoomLockedChange: (locked: boolean) => void
  roomId: string
  revision: number
  open?: boolean
  inviteSecret: string | null
  onEndRoom?: () => void
  className?: string
}

export function RoomSidebar({
  name,
  createdAt,
  status,
  participants,
  isHost,
  canClose,
  guestsAllowed,
  onGuestsAllowedChange,
  locked,
  onRoomLockedChange,
  roomId,
  revision,
  open,
  inviteSecret,
  onEndRoom,
  className,
}: RoomSidebarProps) {
  const { t } = useTranslation()
  const elapsedSeconds = useRoomElapsedSeconds(createdAt)
  const durationLabel = formatRoomDuration(elapsedSeconds)
  const [closeDialogOpen, setCloseDialogOpen] = useState(false)
  const statusLabel =
    status === 'connected' ? t('rooms.connected') : t('rooms.reconnecting')

  return (
    <aside
      className={cn(
        'flex h-full min-h-0 shrink-0 flex-col border-l border-[var(--color-border)] bg-[var(--color-surface)]',
        className ?? PLAYER_TOC_WIDTH_CLASS,
      )}
      aria-label={t('rooms.title')}
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
          {t('rooms.participants')}
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
                    {t('rooms.guestBadge')}
                  </span>
                ) : null}
              </p>
              <p className="text-xs text-[var(--color-muted-foreground)]">
                {participantModeLabel(participant, t)}
                {participant.is_host ? ` · ${t('rooms.host')}` : null}
                {participant.is_av_host ? ` · ${t('rooms.avHost')}` : null}
              </p>
            </li>
          ))}
        </ul>
      </div>

      {isHost || canClose ? (
        <div className="flex shrink-0 flex-col gap-2 border-t border-[var(--color-border)] p-3">
          {isHost ? (
            <>
              <RoomQueueAccessControl
                roomId={roomId}
                revision={revision}
                open={open}
                isHost={isHost}
              />
              <label className="flex items-center gap-3 text-sm">
                <input
                  type="checkbox"
                  className="size-4 shrink-0 accent-[var(--color-primary)]"
                  aria-label={t('rooms.lockRoom.label')}
                  checked={locked}
                  onChange={(event) => onRoomLockedChange(event.target.checked)}
                />
                <span>{t('rooms.lockRoom.label')}</span>
              </label>
              <label className="flex items-center gap-3 text-sm">
                <input
                  type="checkbox"
                  className="size-4 shrink-0 accent-[var(--color-primary)]"
                  aria-label={t('rooms.allowGuests.label')}
                  checked={guestsAllowed}
                  onChange={(event) => onGuestsAllowedChange(event.target.checked)}
                />
                <span>{t('rooms.allowGuests.label')}</span>
              </label>
              {inviteSecret ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!guestsAllowed}
                  title={!guestsAllowed ? t('rooms.allowGuests.copyDisabled') : undefined}
                  onClick={() => {
                    void navigator.clipboard
                      .writeText(`${window.location.origin}/rooms/invite#${inviteSecret}`)
                      .then(() => toast.success(t('rooms.inviteCopied')))
                  }}
                >
                  {t('rooms.copyInvite')}
                </Button>
              ) : null}
            </>
          ) : null}
          <Button type="button" variant="destructive" size="sm" onClick={() => setCloseDialogOpen(true)}>
            {t('rooms.end')}
          </Button>
        </div>
      ) : null}
      <AlertDialog open={closeDialogOpen} onOpenChange={setCloseDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('rooms.closeConfirmTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('rooms.closeConfirmDescription')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-[var(--color-danger)] text-white hover:bg-[var(--color-danger)]/90"
              onClick={onEndRoom}
            >
              {t('rooms.closeConfirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </aside>
  )
}
