/** Shared hub list row typography and spacing (see styles/hub-density.css). */

export const HUB_LIST_ROW_SHELL_CLASS =
  'flex cursor-pointer gap-[var(--hub-list-gap)] py-[var(--hub-list-row-py)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]'

/** Text column with divider inset from the avatar (WhatsApp-style). */
export const HUB_LIST_ROW_TEXT_COLUMN_CLASS =
  'min-w-0 flex-1 border-b border-[var(--color-border)] flex flex-col justify-center py-0.5'

export const HUB_LIST_ROW_INSET_LAST_CLASS = '[&:last-child>div:last-child]:border-b-0'

export const HUB_LIST_ROW_BORDER_CLASS = 'border-b border-[var(--color-border)] last:border-b-0'

export const HUB_LIST_AVATAR_CLASS =
  'relative h-[var(--hub-list-avatar)] w-[var(--hub-list-avatar)] shrink-0 overflow-hidden rounded-full border border-[var(--color-border)] bg-[var(--color-muted)]'

export const HUB_LIST_TITLE_CLASS =
  'truncate text-[length:var(--hub-list-title-size)] font-semibold leading-tight text-[var(--color-foreground)]'

export const HUB_LIST_SUBTITLE_CLASS =
  'text-[length:var(--hub-list-subtitle-size)] leading-snug text-[var(--color-muted-foreground)]'

export const HUB_LIST_META_CLASS =
  'text-[length:var(--hub-list-meta-size)] leading-snug text-[var(--color-muted-foreground)]'

/** Bottom tab bar + create button labels. */
export const HUB_TAB_LABEL_CLASS =
  'text-[length:var(--hub-tab-label)] font-medium leading-none tracking-normal'
