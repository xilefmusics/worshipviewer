import { useEffect } from 'react'
import { toast } from 'sonner'

import { i18n } from '@/i18n'
import { registerSW } from 'virtual:pwa-register'

export function PwaRegistration() {
  useEffect(() => {
    const updateSW = registerSW({
      onNeedRefresh() {
        toast(i18n.t('pwa.updateMessage'), {
          duration: Number.POSITIVE_INFINITY,
          action: {
            label: i18n.t('pwa.reload'),
            onClick: () => {
              void updateSW(true)
            },
          },
        })
      },
    })
  }, [])

  return null
}
