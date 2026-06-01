import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { registerSW } from 'virtual:pwa-register'

import { i18n } from '@/i18n'
import {
  PwaUpdateContext,
  type PwaUpdateContextValue,
  type PwaUpdateStatus,
} from '@/pwa/pwa-update-context'

export function PwaUpdateProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<PwaUpdateStatus>('idle')
  const [needRefresh, setNeedRefresh] = useState(false)
  const updateSwRef = useRef<((reloadPage?: boolean) => Promise<void>) | null>(null)
  const registrationRef = useRef<ServiceWorkerRegistration | null>(null)
  const needRefreshRef = useRef(false)

  useEffect(() => {
    const updateSW = registerSW({
      onNeedRefresh() {
        needRefreshRef.current = true
        setNeedRefresh(true)
        setStatus('updateAvailable')
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
      onRegisteredSW(_swUrl, registration) {
        registrationRef.current = registration ?? null
      },
    })
    updateSwRef.current = updateSW
  }, [])

  const checkForUpdate = useCallback(async (): Promise<PwaUpdateStatus> => {
    const registration = registrationRef.current
    if (!registration) {
      setStatus('unsupported')
      return 'unsupported'
    }

    setStatus('checking')
    try {
      await registration.update()
    } catch {
      setStatus('unsupported')
      return 'unsupported'
    }

    const nextStatus: PwaUpdateStatus = needRefreshRef.current ? 'updateAvailable' : 'upToDate'
    setStatus(nextStatus)
    return nextStatus
  }, [])

  const applyUpdate = useCallback(() => {
    const updateSW = updateSwRef.current
    if (!updateSW) return
    void updateSW(true)
  }, [])

  const value = useMemo<PwaUpdateContextValue>(
    () => ({
      status,
      needRefresh,
      checkForUpdate,
      applyUpdate,
    }),
    [status, needRefresh, checkForUpdate, applyUpdate],
  )

  return <PwaUpdateContext.Provider value={value}>{children}</PwaUpdateContext.Provider>
}
