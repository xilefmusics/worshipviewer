import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { useOnline } from '@/hooks/use-online'
import { updateRoomQueueAccess } from '@/lib/room'

type Props = {
  roomId: string
  revision: number
  queueAdditionsAllowed?: boolean
  isHost: boolean
  className?: string
}

export function RoomQueueAccessControl({ roomId, revision, queueAdditionsAllowed = false, isHost, className }: Props) {
  const { t } = useTranslation()
  const online = useOnline()
  const [pending, setPending] = useState(false)

  const changeQueueAccess = async (nextAllowed: boolean) => {
    setPending(true)
    try {
      await updateRoomQueueAccess(roomId, nextAllowed, revision)
      toast.success(t('rooms.queueAccess.updated'))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('rooms.queueAccess.failed'))
    } finally {
      setPending(false)
    }
  }

  if (!isHost) {
    return (
      <div className={className}>
        <span className="text-sm">{t('rooms.queueAccess.shortLabel')}</span>
        <span className="ml-3 text-sm text-[var(--color-muted-foreground)]">
          {queueAdditionsAllowed ? t('rooms.queueAccess.allowed') : t('rooms.queueAccess.disabled')}
        </span>
      </div>
    )
  }

  return (
    <div className={className}>
      <label className="flex items-center gap-3 text-sm">
        <input
          type="checkbox"
          className="size-4 shrink-0 accent-[var(--color-primary)]"
          aria-label={t('rooms.queueAccess.allow')}
          checked={queueAdditionsAllowed}
          disabled={pending || !online}
          onChange={(event) => void changeQueueAccess(event.target.checked)}
        />
        <span>{t('rooms.queueAccess.shortLabel')}</span>
      </label>
    </div>
  )
}
