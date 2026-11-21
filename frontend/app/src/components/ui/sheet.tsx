import * as DialogPrimitive from '@radix-ui/react-dialog'
import * as React from 'react'

import { cn } from '@/lib/utils'

const Sheet = DialogPrimitive.Root
const SheetTrigger = DialogPrimitive.Trigger
const SheetClose = DialogPrimitive.Close

type SheetContentProps = React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
  side?: 'left' | 'right' | 'bottom'
}

const SheetContent = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Content>,
  SheetContentProps
>(({ className, children, side = 'left', ...props }, ref) => (
  <DialogPrimitive.Portal>
    <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40 data-[state=closed]:animate-out data-[state=open]:animate-in data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        'fixed z-50 flex flex-col bg-[var(--color-surface)] text-[var(--color-foreground)] shadow-[var(--shadow-elevated)]',
        'data-[state=closed]:animate-out data-[state=open]:animate-in',
        side === 'bottom'
          ? 'bottom-0 left-1/2 max-h-[90dvh] w-full max-w-5xl -translate-x-1/2 rounded-t-2xl border border-b-0 border-[var(--color-border)] pb-[env(safe-area-inset-bottom)] data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom'
          : cn(
              'inset-y-0 w-[min(19rem,85vw)]',
              side === 'right'
                ? 'right-0 border-l border-[var(--color-border)] data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right'
                : 'left-0 border-r border-[var(--color-border)] data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left',
            ),
        className,
      )}
      {...props}
    >
      {children}
    </DialogPrimitive.Content>
  </DialogPrimitive.Portal>
))
SheetContent.displayName = DialogPrimitive.Content.displayName

const SheetTitle = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title ref={ref} className={cn('text-lg font-semibold', className)} {...props} />
))
SheetTitle.displayName = DialogPrimitive.Title.displayName

export { Sheet, SheetClose, SheetContent, SheetTitle, SheetTrigger }
