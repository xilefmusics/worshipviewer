import { cn } from '@/lib/utils'

type KeyboardShortcutProps = {
  keys: string[]
  label: string
  className?: string
}

export function KeyboardShortcut({ keys, label, className }: KeyboardShortcutProps) {
  return (
    <span
      className={cn('inline-flex items-center gap-1 align-middle', className)}
      aria-label={label}
    >
      {keys.map((key, index) => (
        <span key={`${key}-${index}`} className="contents" aria-hidden="true">
          {index > 0 ? <span className="text-[var(--color-muted-foreground)]">+</span> : null}
          <kbd className="inline-flex min-w-6 items-center justify-center rounded border border-[var(--color-border)] bg-[var(--color-muted)] px-1.5 py-0.5 font-mono text-xs font-semibold leading-none text-[var(--color-foreground)] shadow-sm">
            {key}
          </kbd>
        </span>
      ))}
    </span>
  )
}
