/** Matches hub detail chrome (`HubShell` back button). */
export const playerHeaderIconButtonClass =
  'size-[3.6rem] shrink-0 rounded-full shadow-[var(--shadow-elevated)]'

export const playerHeaderIconClass = 'text-[var(--color-foreground)]'

export const PLAYER_HEADER_ICON_SIZE = 22

/** TOC sidebar — Tailwind w-44 / sm:w-56, plus 20% (11rem → 13.31rem, 14rem → 16.94rem). */
export const PLAYER_TOC_WIDTH_CLASS = 'w-[13.31rem] sm:w-[16.94rem]'

export const PLAYER_TOC_WIDTH_PX = {
  base: Math.round(11 * 16 * 1.21),
  sm: Math.round(14 * 16 * 1.21),
} as const
