import * as Dialog from '@radix-ui/react-dialog'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type SongCreateChooserSheetProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  online: boolean
  canImport: boolean
  onNewSong: () => void
  onImport: () => void
  onImportUltimateGuitar: () => void
}

export function SongCreateChooserSheet({
  open,
  onOpenChange,
  online,
  canImport,
  onNewSong,
  onImport,
  onImportUltimateGuitar,
}: SongCreateChooserSheetProps) {
  const { t } = useTranslation()
  const shouldReduceMotion = useReducedMotion()
  const [dragOffset, setDragOffset] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const pointerStartY = useRef<number | null>(null)

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal forceMount>
        <AnimatePresence>
          {open ? (
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
              <Dialog.Content forceMount asChild>
                <motion.div
                  className={cn(
                    'fixed inset-x-0 bottom-0 z-50 grid w-full gap-4 rounded-t-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 text-[var(--color-foreground)] shadow-[var(--shadow-elevated)]',
                  )}
                  initial={{ y: shouldReduceMotion ? 0 : '100%' }}
                  animate={isDragging ? { y: dragOffset } : { y: 0 }}
                  exit={{ y: shouldReduceMotion ? 0 : '100%' }}
                  transition={
                    isDragging
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
                      setIsDragging(true)
                      setDragOffset(0)
                    }}
                    onPointerMove={(event) => {
                      if (!isDragging || pointerStartY.current === null) return
                      setDragOffset(Math.max(0, event.clientY - pointerStartY.current))
                    }}
                    onPointerUp={() => {
                      if (!isDragging) return
                      setIsDragging(false)
                      pointerStartY.current = null
                      if (dragOffset > 90) {
                        onOpenChange(false)
                        setDragOffset(0)
                        return
                      }
                      setDragOffset(0)
                    }}
                    onPointerCancel={() => {
                      setIsDragging(false)
                      pointerStartY.current = null
                      setDragOffset(0)
                    }}
                  />
                  <div className="flex flex-col gap-2 text-center sm:text-left">
                    <Dialog.Title className="text-lg font-semibold leading-none">
                      {t('hub.createChooser.title')}
                    </Dialog.Title>
                    <p className="text-sm text-[var(--color-muted-foreground)]">
                      {t('hub.createChooser.description')}
                    </p>
                  </div>
                  <div className="grid gap-2">
                    <Button
                      type="button"
                      onClick={() => {
                        onOpenChange(false)
                        onNewSong()
                      }}
                    >
                      {t('hub.createChooser.newSong')}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={!online || !canImport}
                      title={
                        !online
                          ? t('hub.createChooser.importOfflineHint')
                          : !canImport
                            ? t('hub.createOfflineHint')
                            : undefined
                      }
                      onClick={() => {
                        if (!online || !canImport) return
                        onOpenChange(false)
                        onImport()
                      }}
                    >
                      {t('hub.createChooser.importFiles')}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={!online || !canImport}
                      title={
                        !online
                          ? t('hub.createChooser.importOfflineHint')
                          : !canImport
                            ? t('hub.createOfflineHint')
                            : undefined
                      }
                      onClick={() => {
                        if (!online || !canImport) return
                        onOpenChange(false)
                        onImportUltimateGuitar()
                      }}
                    >
                      {t('hub.createChooser.importUltimateGuitar')}
                    </Button>
                  </div>
                  <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                    {t('teams.dialogCancel')}
                  </Button>
                </motion.div>
              </Dialog.Content>
            </>
          ) : null}
        </AnimatePresence>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
