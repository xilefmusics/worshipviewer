import type { ComponentPropsWithoutRef } from 'react'
import * as Popover from '@radix-ui/react-popover'

import { cn } from '@/lib/utils'

const PopoverRoot = Popover.Root
const PopoverTrigger = Popover.Trigger

function PopoverContent({
  className,
  align = 'start',
  sideOffset = 6,
  ...props
}: ComponentPropsWithoutRef<typeof Popover.Content>) {
  return (
    <Popover.Portal>
      <Popover.Content
        align={align}
        sideOffset={sideOffset}
        className={cn(
          'z-[80] rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-1 text-[var(--color-foreground)] shadow-[var(--shadow-elevated)] outline-none',
          className,
        )}
        {...props}
      />
    </Popover.Portal>
  )
}

export { PopoverRoot, PopoverTrigger, PopoverContent }
