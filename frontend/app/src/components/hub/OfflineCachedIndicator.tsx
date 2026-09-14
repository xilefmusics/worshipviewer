import { useTranslation } from 'react-i18next'

import { DownloadCheckIcon } from '@/components/icons/lucide-animated/download-check-icon'

type OfflineCachedIndicatorProps = {
  visible: boolean
}

export function OfflineCachedIndicator({ visible }: OfflineCachedIndicatorProps) {
  const { t } = useTranslation()

  if (!visible) return null

  const label = t('hub.actions.offlineSaved')

  return (
    <span
      aria-label={label}
      className="inline-flex size-8 shrink-0 items-center justify-center text-[var(--color-primary)]"
      role="img"
      title={label}
    >
      <DownloadCheckIcon size={16} className="shrink-0" />
    </span>
  )
}
