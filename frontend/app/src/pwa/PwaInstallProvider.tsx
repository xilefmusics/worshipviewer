import * as Dialog from '@radix-ui/react-dialog'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { listenToMediaQuery } from '@/lib/browser-apis'
import {
  isAndroidChrome,
  isAndroidFirefox,
  isIosOrIpadosDevice,
  isMacDesktopSafari,
} from '@/lib/platform'
import { cn } from '@/lib/utils'
import {
  resolvePwaInstallAction,
  type PwaInstallHelpKind,
} from '@/pwa/pwa-install-action'
import { PwaInstallContext } from '@/pwa/pwa-install-context'
import { isTauri } from '@tauri-apps/api/core'

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
  const [helpKind, setHelpKind] = useState<PwaInstallHelpKind>('generic')
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
  const androidChrome = useMemo(() => isAndroidChrome(), [])
  const androidFirefox = useMemo(() => isAndroidFirefox(), [])

  useEffect(() => {
    const onBip = (e: Event) => {
      e.preventDefault()
      deferredPromptRef.current = e as BeforeInstallPromptEvent
    }
    globalThis.window.addEventListener('beforeinstallprompt', onBip)
    return () => globalThis.window.removeEventListener('beforeinstallprompt', onBip)
  }, [])

  useEffect(() => {
    if (typeof globalThis.matchMedia !== 'function') return
    const mq = globalThis.matchMedia('(display-mode: standalone)')
    const sync = () => {
      setIsStandalone(getIsStandalone())
    }
    return listenToMediaQuery(mq, sync)
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
    !isTauri() && storageOk === true && !isStandalone && !hasRelatedInstalled,
  )

  const openInstall = useCallback(async () => {
    const action = resolvePwaInstallAction({
      isIos,
      isMacSafari,
      isAndroidChrome: androidChrome,
      isAndroidFirefox: androidFirefox,
      hasNativePrompt: Boolean(deferredPromptRef.current),
    })
    if (action.type === 'native-prompt') {
      const p = deferredPromptRef.current
      if (!p) {
        setHelpKind(androidChrome ? 'androidChrome' : 'generic')
        setHelpOpen(true)
        return
      }
      void p.prompt()
      void p.userChoice.finally(() => {
        deferredPromptRef.current = null
      })
      return
    }
    setHelpKind(action.kind)
    setHelpOpen(true)
  }, [androidChrome, androidFirefox, isIos, isMacSafari])

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
                    <InstallHelpCopy kind={helpKind} />
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
function InstallHelpCopy({ kind }: { kind: PwaInstallHelpKind }) {
  const { t } = useTranslation()
  const titleClass = 'text-base font-semibold text-[var(--color-foreground)]'
  const stepsClass = 'list-decimal space-y-2 pl-5 text-sm text-[var(--color-foreground)]'
  const bodyClass = 'text-sm text-[var(--color-muted-foreground)]'

  if (kind === 'ios') {
    return (
      <>
        <Dialog.Title className={titleClass}>{t('pwa.install.iosTitle')}</Dialog.Title>
        <ol className={stepsClass}>
          <li>{t('pwa.install.iosStep1')}</li>
          <li>{t('pwa.install.iosStep2')}</li>
          <li>{t('pwa.install.iosStep3')}</li>
        </ol>
      </>
    )
  }
  if (kind === 'androidChrome') {
    return (
      <>
        <Dialog.Title className={titleClass}>{t('pwa.install.androidChromeTitle')}</Dialog.Title>
        <ol className={stepsClass}>
          <li>{t('pwa.install.androidChromeStep1')}</li>
          <li>{t('pwa.install.androidChromeStep2')}</li>
          <li>{t('pwa.install.androidChromeStep3')}</li>
        </ol>
      </>
    )
  }
  if (kind === 'androidFirefox') {
    return (
      <>
        <Dialog.Title className={titleClass}>{t('pwa.install.androidFirefoxTitle')}</Dialog.Title>
        <ol className={stepsClass}>
          <li>{t('pwa.install.androidFirefoxStep1')}</li>
          <li>{t('pwa.install.androidFirefoxStep2')}</li>
          <li>{t('pwa.install.androidFirefoxStep3')}</li>
        </ol>
      </>
    )
  }
  if (kind === 'safariMac') {
    return (
      <>
        <Dialog.Title className={titleClass}>{t('pwa.install.safariMacTitle')}</Dialog.Title>
        <p className={bodyClass}>{t('pwa.install.safariMacBody')}</p>
      </>
    )
  }
  return (
    <>
      <Dialog.Title className={titleClass}>{t('pwa.install.genericTitle')}</Dialog.Title>
      <p className={bodyClass}>{t('pwa.install.genericBody')}</p>
    </>
  )
}
