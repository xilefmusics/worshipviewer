import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'

type SessionUnavailableScreenProps = {
  onRetry?: () => void
}

/** Shown when the hub cannot load a session user (logged out or unreachable). */
export function SessionUnavailableScreen({ onRetry }: SessionUnavailableScreenProps) {
  const { t } = useTranslation()
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-[var(--color-bg)] p-6 text-center">
      <p className="max-w-sm text-sm text-[var(--color-muted-foreground)]">
        {t('offline.sessionUnavailable.body')}
      </p>
      <div className="flex flex-wrap items-center justify-center gap-2">
        {onRetry ? (
          <Button type="button" variant="outline" onClick={onRetry}>
            {t('hub.error.retry')}
          </Button>
        ) : null}
        <Button type="button" variant="default" asChild>
          <Link to="/login" search={{ return_to: undefined }}>{t('offline.sessionUnavailable.signIn')}</Link>
        </Button>
      </div>
    </div>
  )
}
