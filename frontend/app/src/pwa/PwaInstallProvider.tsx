import * as Dialog from '@radix-ui/react-dialog'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { isIosOrIpadosDevice, isMacDesktopSafari } from '@/lib/platform'
import { PwaInstallContext } from '@/pwa/pwa-install-context'
import { cn } from '@/lib/utils'

function getIsStandalone(): boolean {
  if (typeof globalThis.matchMedia === 'function') {
    if (globalThis.matchMedia('(display-mode: standalone)').matches) {
      return true
    }
  }
  const nav = globalThis.navigator as NavigatorWithStandalone
  return nav.standalone === true
}

async function probeIndexedDbDurable(): Promise<boolean> {
  if (typeof globalThis.indexedDB === 'undefined') {
    return false
  }
  return new Promise((resolve) => {
    const req = globalThis.indexedDB.open('__wv_pwa_idb__', 1)
    const timeout = globalThis.setTimeout(() => {
      try {
        req.onerror = null
        req.onsuccess = null
        req.onupgradeneeded = null
        req.onblocked = null
      } catch {
        /* ignore */
      }
      resolve(false)
    }, 2000)
    req.onupgradeneeded = (ev) => {
      const db = (ev.target as IDBOpenDBRequest).result
      try {
        if (!db.objectStoreNames.contains('k')) {
          db.createObjectStore('k')
        }
      } catch {
        /* ignore */
      }
    }
    req.onsuccess = () => {
      globalThis.clearTimeout(timeout)
      try {
        req.result.close()
        void globalThis.indexedDB.deleteDatabase('__wv_pwa_idb__')
      } catch {
        /* ignore */
      }
      resolve(true)
    }
    req.onerror = () => {
      globalThis.clearTimeout(timeout)
      resolve(false)
    }
  })
}

export function PwaInstallProvider({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation()
  const shouldReduceMotion = useReducedMotion()
  const [helpOpen, setHelpOpen] = useState(false)
  const [helpKind, setHelpKind] = useState<'ios' | 'safariMac' | 'generic'>('generic')
  const [dragOffset, setDragOffset] = useState(0)
  const [sheetDragging, setSheetDragging] = useState(false)
  const pointerStartY = useRef<number | null>(null)
  const dragSessionActive = useRef(false)
  const [isStandalone, setIsStandalone] = useState(getIsStandalone)
  const [storageOk, setStorageOk] = useState<boolean | null>(null)
  const [hasRelatedInstalled, setHasRelatedInstalled] = useState(false)
  const deferredPromptRef = useRef<BeforeInstallPromptEvent | null>(null)

  const isIos = useMemo(() => isIosOrIpadosDevice(), [])
  const isMacSafari = useMemo(() => isMacDesktopSafari(), [])

  useEffect(() => {
    const onBip = (e: Event) => {
      e.preventDefault()
      deferredPromptRef.current = e as BeforeInstallPromptEvent
    }
    globalThis.window.addEventListener('beforeinstallprompt', onBip)
    return () => globalThis.window.removeEventListener('beforeinstallprompt', onBip)
  }, [])

  useEffect(() => {
    const mq = globalThis.matchMedia('(display-mode: standalone)')
    const sync = () => {
      setIsStandalone(getIsStandalone())
    }
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [])

  useEffect(() => {
    void probeIndexedDbDurable().then((ok) => {
      setStorageOk(ok)
    })
  }, [])

  useEffect(() => {
    if (!('getInstalledRelatedApps' in globalThis.navigator)) {
      return
    }
    const n = globalThis.navigator as Navigator & {
      getInstalledRelatedApps: () => Promise<{ id?: string }[]>
    }
    void n
      .getInstalledRelatedApps()
      .then((apps) => {
        if (apps.length > 0) {
          setHasRelatedInstalled(true)
        }
      })
      .catch(() => {
        /* ignore */
      })
  }, [])

  const canShowInstall = Boolean(
    storageOk === true && !isStandalone && !hasRelatedInstalled,
  )

  const openInstall = useCallback(async () => {
    if (isIos) {
      setHelpKind('ios')
      setHelpOpen(true)
      return
    }
    if (isMacSafari) {
      setHelpKind('safariMac')
      setHelpOpen(true)
      return
    }
    const p = deferredPromptRef.current
    if (p) {
      void p.prompt()
      void p.userChoice.finally(() => {
        deferredPromptRef.current = null
      })
      return
    }
    setHelpKind('generic')
    setHelpOpen(true)
  }, [isIos, isMacSafari])

  const value = useMemo(
    () => ({ canShowInstall, openInstall }),
    [canShowInstall, openInstall],
  )

  const onHelpOpenChange = useCallback((open: boolean) => {
    setHelpOpen(open)
    if (!open) {
      dragSessionActive.current = false
      setSheetDragging(false)
      setDragOffset(0)
    }
  }, [])

  return (
    <PwaInstallContext.Provider value={value}>
      {children}
      <Dialog.Root open={helpOpen} onOpenChange={onHelpOpenChange}>
        <Dialog.Portal forceMount>
          <AnimatePresence>
            {helpOpen ? (
              <>
                <Dialog.Overlay forceMount asChild>
                  <motion.div
                    className="fixed inset-0 z-50 bg-black/40"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: shouldReduceMotion ? 0 : 0.18 }}
                  />
                </Dialog.Overlay>
                <Dialog.Content forceMount asChild aria-describedby={undefined}>
                  <motion.div
                    className={cn(
                      'fixed inset-x-0 bottom-0 z-50 grid w-full max-h-[90vh] gap-4 overflow-y-auto rounded-t-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 text-[var(--color-foreground)] shadow-[var(--shadow-elevated)]',
                    )}
                    initial={{ y: shouldReduceMotion ? 0 : '100%' }}
                    animate={sheetDragging ? { y: dragOffset } : { y: 0 }}
                    exit={{ y: shouldReduceMotion ? 0 : '100%' }}
                    transition={
                      sheetDragging
                        ? { duration: 0 }
                        : { type: 'spring', stiffness: 420, damping: 36, mass: 0.9 }
                    }
                  >
                    <div
                      className="mx-auto h-1.5 w-12 rounded-full bg-[var(--color-muted)]"
                      style={{ touchAction: 'none' }}
                      onPointerDown={(event) => {
                        event.currentTarget.setPointerCapture(event.pointerId)
                        pointerStartY.current = event.clientY
                        dragSessionActive.current = true
                        setSheetDragging(true)
                        setDragOffset(0)
                      }}
                      onPointerMove={(event) => {
                        if (!dragSessionActive.current || pointerStartY.current === null) {
                          return
                        }
                        const nextOffset = Math.max(0, event.clientY - pointerStartY.current)
                        setDragOffset(nextOffset)
                      }}
                      onPointerUp={() => {
                        if (!dragSessionActive.current) {
                          return
                        }
                        dragSessionActive.current = false
                        setSheetDragging(false)
                        pointerStartY.current = null
                        if (dragOffset > 90) {
                          onHelpOpenChange(false)
                          setDragOffset(0)
                          return
                        }
                        setDragOffset(0)
                      }}
                      onPointerCancel={() => {
                        dragSessionActive.current = false
                        setSheetDragging(false)
                        pointerStartY.current = null
                        setDragOffset(0)
                      }}
                    />
                    {helpKind === 'ios' ? (
                      <>
                        <Dialog.Title className="text-base font-semibold text-[var(--color-foreground)]">
                          {t('pwa.install.iosTitle')}
                        </Dialog.Title>
                        <ol className="list-decimal space-y-2 pl-5 text-sm text-[var(--color-foreground)]">
                          <li>{t('pwa.install.iosStep1')}</li>
                          <li>{t('pwa.install.iosStep2')}</li>
                          <li>{t('pwa.install.iosStep3')}</li>
                        </ol>
                      </>
                    ) : helpKind === 'safariMac' ? (
                      <>
                        <Dialog.Title className="text-base font-semibold text-[var(--color-foreground)]">
                          {t('pwa.install.safariMacTitle')}
                        </Dialog.Title>
                        <p className="text-sm text-[var(--color-muted-foreground)]">
                          {t('pwa.install.safariMacBody')}
                        </p>
                      </>
                    ) : (
                      <>
                        <Dialog.Title className="text-base font-semibold text-[var(--color-foreground)]">
                          {t('pwa.install.genericTitle')}
                        </Dialog.Title>
                        <p className="text-sm text-[var(--color-muted-foreground)]">
                          {t('pwa.install.genericBody')}
                        </p>
                      </>
                    )}
                    <div className="flex justify-end">
                      <Dialog.Close asChild>
                        <Button type="button" variant="outline">
                          {t('pwa.install.close')}
                        </Button>
                      </Dialog.Close>
                    </div>
                  </motion.div>
                </Dialog.Content>
              </>
            ) : null}
          </AnimatePresence>
        </Dialog.Portal>
      </Dialog.Root>
    </PwaInstallContext.Provider>
  )
}
