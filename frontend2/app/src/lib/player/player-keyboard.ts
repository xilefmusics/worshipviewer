export type PlayerKeyboardAction =
  | 'prev'
  | 'next'
  | 'home'
  | 'end'
  | 'toggleToc'
  | 'toggleOrientation'
  | 'openScrollMenu'
  | 'escape'
  | null

function isEditableTarget(target: EventTarget | null): boolean {
  if (!target || typeof target !== 'object') return false
  const el = target as {
    tagName?: string
    isContentEditable?: boolean
    closest?: (selector: string) => unknown
  }
  const tag = el.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA') return true
  if (el.isContentEditable) return true
  return el.closest?.('[contenteditable="true"]') != null
}

/** Map keyboard events to player actions; returns null when the event should be ignored. */
export function playerKeyboardAction(
  key: string,
  target: EventTarget | null,
  options?: { tocOpen?: boolean; popoverOpen?: boolean },
): PlayerKeyboardAction {
  if (isEditableTarget(target)) return null

  const tocOpen = options?.tocOpen ?? false
  const popoverOpen = options?.popoverOpen ?? false

  if (key === 'Escape') {
    if (tocOpen || popoverOpen) return 'escape'
    return 'escape'
  }

  if (tocOpen || popoverOpen) return null

  switch (key) {
    case 'ArrowLeft':
    case 'PageUp':
      return 'prev'
    case 'ArrowRight':
    case 'PageDown':
    case ' ':
      return 'next'
    case 'Home':
      return 'home'
    case 'End':
      return 'end'
    case 't':
    case 'T':
      return 'toggleToc'
    case 'o':
    case 'O':
      return 'toggleOrientation'
    case 's':
    case 'S':
      return 'openScrollMenu'
    default:
      return null
  }
}
