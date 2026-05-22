import { useTranslation } from 'react-i18next'

import { useOnline } from '@/hooks/use-online'
import { cn } from '@/lib/utils'

export function PlayerOnlineIndicator() {
  const { t } = useTranslation()
  const online = useOnline()

  return (
    <span
      className={cn(
        'inline-flex size-2 shrink-0 rounded-full',
        online ? 'bg-emerald-500' : 'bg-[var(--color-muted-foreground)]',
      )}
      role="status"
      aria-label={online ? t('player.online') : t('player.offline')}
    />
  )
}
