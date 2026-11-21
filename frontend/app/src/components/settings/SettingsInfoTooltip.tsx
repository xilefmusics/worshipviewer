import { useId } from 'react'

export function SettingsInfoTooltip({ text }: { text: string }) {
  const tooltipId = useId()
  return (
    <span className="group relative inline-flex">
      <button type="button" aria-label={text} aria-describedby={tooltipId}
        className="flex size-6 items-center justify-center rounded-full border border-[var(--color-border)] text-xs text-[var(--color-muted-foreground)] focus-visible:outline focus-visible:outline-2">i</button>
      <span id={tooltipId} role="tooltip" className="pointer-events-none absolute left-0 top-full z-10 mt-1 hidden w-64 max-w-[70vw] rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-2 text-xs text-[var(--color-foreground)] shadow-lg group-hover:block group-focus-within:block">
        {text}
      </span>
    </span>
  )
}
