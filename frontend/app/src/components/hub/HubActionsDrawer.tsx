import * as Dialog from '@radix-ui/react-dialog'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useCallback, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { EllipsisIcon } from '@/components/icons/lucide-animated/ellipsis-icon'
import { XIcon } from '@/components/icons/lucide-animated/x-icon'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export const HUB_ACTION_ICON_CLASS = 'shrink-0 text-[var(--color-foreground)]'

export function HubActionItem({
  children,
  disabled,
  title,
  destructive,
  onSelect,
  onHoverChange,
}: {
  children: ReactNode
  disabled?: boolean
  title?: string
  destructive?: boolean
  onSelect?: () => void
  onHoverChange?: (hot: boolean) => void
}) {
  return (
    <Dialog.Close asChild>
      <button
        type="button"
        role="menuitem"
        disabled={disabled}
        data-disabled={disabled ? 'true' : undefined}
        title={title}
        className={cn(
          'relative flex w-full cursor-default select-none items-center gap-2 rounded-sm px-2 py-2 text-left text-sm outline-none',
          'hover:bg-[var(--color-muted)] focus:bg-[var(--color-muted)]',
          'disabled:pointer-events-none disabled:opacity-50',
          destructive && 'text-[var(--color-danger)] focus:text-[var(--color-danger)]',
        )}
        onClick={() => {
          if (disabled) return
          onSelect?.()
        }}
        onMouseEnter={() => onHoverChange?.(true)}
        onMouseLeave={() => onHoverChange?.(false)}
        onFocus={() => onHoverChange?.(true)}
        onBlur={() => onHoverChange?.(false)}
      >
        {children}
      </button>
    </Dialog.Close>
  )
}

export function HubActionSeparator() {
  return <div className="my-1 h-px bg-[var(--color-border)]" role="separator" />
}

export function HubRightDrawer({
  title,
  triggerAriaLabel,
  trigger,
  children,
}: {
  title: string
  triggerAriaLabel: string
  trigger: ReactNode
  children: ReactNode
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [closeHot, setCloseHot] = useState(false)
  const shouldReduceMotion = useReducedMotion()
  const [dragOffset, setDragOffset] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const pointerStartX = useRef<number | null>(null)
  const pointerStartY = useRef<number | null>(null)
  const dragSessionActive = useRef(false)
  const dragOffsetRef = useRef(0)

  const resetDrawerDrag = useCallback(() => {
    dragSessionActive.current = false
    pointerStartX.current = null
    pointerStartY.current = null
    dragOffsetRef.current = 0
    setIsDragging(false)
    setDragOffset(0)
  }, [])

  const onDrawerOpenChange = useCallback(
    (next: boolean) => {
      if (!next) resetDrawerDrag()
      setOpen(next)
    },
    [resetDrawerDrag],
  )

  return (
    <>
      <span
        className="contents"
        onClick={(event) => {
          if (!event.defaultPrevented) onDrawerOpenChange(true)
        }}
      >
        {trigger}
      </span>
      <Dialog.Root open={open} onOpenChange={onDrawerOpenChange}>
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
                <Dialog.Content forceMount asChild aria-describedby={undefined}>
                  <motion.div
                    className={cn(
                      'fixed inset-y-0 right-0 z-50 flex w-[min(22rem,90vw)] flex-row border-l border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-foreground)] shadow-[var(--shadow-elevated)]',
                      'rounded-l-2xl pt-[env(safe-area-inset-top,0px)] pb-[env(safe-area-inset-bottom,0px)]',
                    )}
                    initial={{ x: shouldReduceMotion ? 0 : '100%' }}
                    animate={isDragging ? { x: dragOffset } : { x: 0 }}
                    exit={{ x: shouldReduceMotion ? 0 : '100%' }}
                    transition={
                      isDragging
                        ? { duration: 0 }
                        : { type: 'spring', stiffness: 420, damping: 36, mass: 0.9 }
                    }
                    onPointerDown={(event) => {
                      pointerStartX.current = event.clientX
                      pointerStartY.current = event.clientY
                    }}
                    onPointerMove={(event) => {
                      if (pointerStartX.current == null || pointerStartY.current == null) return
                      const dx = event.clientX - pointerStartX.current
                      const dy = event.clientY - pointerStartY.current
                      if (!dragSessionActive.current) {
                        if (Math.hypot(dx, dy) < 8) return
                        if (dx < 10 || Math.abs(dy) >= dx) {
                          pointerStartX.current = null
                          pointerStartY.current = null
                          return
                        }
                        dragSessionActive.current = true
                        setIsDragging(true)
                        try {
                          event.currentTarget.setPointerCapture(event.pointerId)
                        } catch {
                          /* capture may fail if the pointer already released */
                        }
                      }
                      const next = Math.max(0, dx)
                      dragOffsetRef.current = next
                      setDragOffset(next)
                    }}
                    onPointerUp={() => {
                      if (!dragSessionActive.current) {
                        pointerStartX.current = null
                        pointerStartY.current = null
                        return
                      }
                      const offset = dragOffsetRef.current
                      resetDrawerDrag()
                      if (offset > 90) onDrawerOpenChange(false)
                    }}
                    onPointerCancel={() => {
                      resetDrawerDrag()
                    }}
                  >
                    <div className="flex w-8 shrink-0 items-center justify-center" aria-hidden>
                      <div className="h-12 w-1.5 rounded-full bg-[var(--color-muted)]" />
                    </div>
                    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                      <div className="flex items-center gap-2 border-b border-[var(--color-border)] py-3 pr-3">
                        <Dialog.Title className="min-w-0 flex-1 truncate text-base font-semibold">
                          {title}
                        </Dialog.Title>
                        <Dialog.Close asChild>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="size-8 shrink-0"
                            aria-label={t('hub.actions.closeAria')}
                            onMouseEnter={() => setCloseHot(true)}
                            onMouseLeave={() => setCloseHot(false)}
                            onFocus={() => setCloseHot(true)}
                            onBlur={() => setCloseHot(false)}
                          >
                            <XIcon isHovered={closeHot} size={16} className="shrink-0" />
                          </Button>
                        </Dialog.Close>
                      </div>
                      <nav
                        className="flex min-h-0 flex-1 flex-col overflow-y-auto p-3"
                        role="menu"
                        aria-label={triggerAriaLabel}
                      >
                        {children}
                      </nav>
                    </div>
                  </motion.div>
                </Dialog.Content>
              </>
            ) : null}
          </AnimatePresence>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  )
}

export function HubActionsDrawer({
  title,
  triggerAriaLabel,
  triggerClassName,
  children,
}: {
  title: string
  triggerAriaLabel: string
  triggerClassName?: string
  children: ReactNode
}) {
  const [menuHot, setMenuHot] = useState(false)

  return (
    <HubRightDrawer
      title={title}
      triggerAriaLabel={triggerAriaLabel}
      trigger={
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={triggerClassName ?? 'size-8 shrink-0 text-[var(--color-muted-foreground)]'}
          aria-label={triggerAriaLabel}
          data-hub-actions-trigger
          onMouseEnter={() => setMenuHot(true)}
          onMouseLeave={() => setMenuHot(false)}
          onFocus={() => setMenuHot(true)}
          onBlur={() => setMenuHot(false)}
        >
          <EllipsisIcon isHovered={menuHot} size={16} className="shrink-0" />
        </Button>
      }
    >
      {children}
    </HubRightDrawer>
  )
}
