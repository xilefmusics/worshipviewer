import type { components } from '@/api/schema'
import * as Dialog from '@radix-ui/react-dialog'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useIsPhoneWidth } from '@/hooks/useMediaQuery'

type TocItem = components['schemas']['TocItem']

type PlayerTocDrawerProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  toc: TocItem[]
  currentIndex: number
  onSelect: (idx: number) => void
  triggerRef?: React.RefObject<HTMLButtonElement | null>
}

export function PlayerTocDrawer({
  open,
  onOpenChange,
  toc,
  currentIndex,
  onSelect,
  triggerRef,
}: PlayerTocDrawerProps) {
  const { t } = useTranslation()
  const isPhone = useIsPhoneWidth()
  const shouldReduceMotion = useReducedMotion()

  function pick(idx: number) {
    onSelect(idx)
    onOpenChange(false)
    queueMicrotask(() => triggerRef?.current?.focus())
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <AnimatePresence>
          {open ? (
            <>
              <Dialog.Overlay asChild forceMount>
                <motion.div
                  className="fixed inset-0 z-50 bg-black/40"
                  initial={shouldReduceMotion ? false : { opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={shouldReduceMotion ? undefined : { opacity: 0 }}
                />
              </Dialog.Overlay>
              <Dialog.Content asChild forceMount>
                <motion.div
                  className={cn(
                    'fixed z-50 flex max-h-[min(85dvh,640px)] flex-col bg-[var(--color-surface)] shadow-[var(--shadow-elevated)] outline-none',
                    isPhone
                      ? 'inset-x-0 bottom-0 rounded-t-2xl border-t border-[var(--color-border)]'
                      : 'inset-y-0 right-0 w-full max-w-sm border-l border-[var(--color-border)]',
                  )}
                  initial={
                    shouldReduceMotion
                      ? false
                      : isPhone
                        ? { y: '100%' }
                        : { x: '100%' }
                  }
                  animate={isPhone ? { y: 0 } : { x: 0 }}
                  exit={shouldReduceMotion ? undefined : isPhone ? { y: '100%' } : { x: '100%' }}
                  transition={{ type: 'spring', damping: 28, stiffness: 320 }}
                >
                  <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-3">
                    <Dialog.Title className="text-sm font-semibold">{t('player.toc.title')}</Dialog.Title>
                    <Dialog.Close asChild>
                      <Button type="button" variant="outline" size="sm">
                        {t('player.close')}
                      </Button>
                    </Dialog.Close>
                  </div>
                  <ul className="min-h-0 flex-1 overflow-y-auto p-2" role="listbox" aria-label={t('player.toc.title')}>
                    {toc.map((row) => {
                      const active = row.idx === currentIndex
                      return (
                        <li key={`${row.idx}-${row.title}`}>
                          <button
                            type="button"
                            role="option"
                            aria-current={active ? 'true' : undefined}
                            className={cn(
                              'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors',
                              active
                                ? 'border border-[var(--color-primary)] bg-[var(--color-primary)]/10'
                                : 'hover:bg-[var(--color-muted)]',
                            )}
                            onClick={() => pick(row.idx)}
                          >
                            <span className="shrink-0 rounded-md bg-[var(--color-muted)] px-2 py-0.5 text-xs font-medium">
                              {row.nr}
                            </span>
                            <span className="min-w-0 flex-1 truncate">{row.title}</span>
                            {row.liked ? (
                              <span aria-label={t('player.toc.liked')} className="shrink-0 text-[var(--color-danger)]">
                                ♥
                              </span>
                            ) : null}
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                </motion.div>
              </Dialog.Content>
            </>
          ) : null}
        </AnimatePresence>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
