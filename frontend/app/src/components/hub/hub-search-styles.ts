/** Hub header pill typography (display-only title rows). */
export const HUB_SEARCH_PILL_TEXT_CLASS = 'text-[length:var(--hub-list-subtitle-size)]'

/**
 * Matches the hub header search field (`HubChrome`).
 * Use `text-base` (16px) on real inputs so iPhone Safari does not auto-zoom on focus.
 */
export const HUB_SEARCH_INPUT_CLASS =
  'h-[3.6rem] w-full rounded-full border-[var(--color-border)] bg-[var(--color-surface)] pl-[2.25rem] pr-[0.675rem] text-base shadow-[var(--shadow-elevated)] focus-visible:outline-none'

/** Cmd-K panel top field: same typography and padding as the header; clipped to the panel. */
export const HUB_SEARCH_CMD_INPUT_CLASS =
  'h-[3.6rem] w-full border-0 bg-transparent pl-[2.25rem] pr-[0.675rem] text-[0.7875rem] outline-none focus-visible:outline-none rounded-t-[1.8rem]'
