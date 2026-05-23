export type AvKeyboardAction =
  | 'prev'
  | 'next'
  | 'home'
  | 'end'
  | 'escape'
  | 'toggleToc'
  | 'blackoutOn'
  | 'blackoutOff'
  | 'toggleBlackout'
  | 'jumpSection'
  | null

function isEditableTarget(target: EventTarget | null): boolean {
  if (!target || typeof target !== 'object') return false
  const el = target as {
    tagName?: string
    isContentEditable?: boolean
    closest?: (selector: string) => unknown
  }
  const tag = el.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  if (el.isContentEditable) return true
  return el.closest?.('[contenteditable="true"]') != null
}

/** Map keyboard events to AV player actions. */
export function avKeyboardAction(
  key: string,
  target: EventTarget | null,
  options?: { tocOpen?: boolean },
): AvKeyboardAction {
  if (isEditableTarget(target)) return null

  if (key === 'Escape') {
    return options?.tocOpen ? 'escape' : 'escape'
  }

  switch (key) {
    case 'ArrowUp':
    case 'PageUp':
    case 'ArrowLeft':
    case 'Backspace':
    case 'k':
      return 'prev'
    case 'ArrowDown':
    case 'PageDown':
    case 'ArrowRight':
    case ' ':
    case 'Enter':
    case 'j':
      return 'next'
    case 'Home':
      return 'home'
    case 'End':
      return 'end'
    case 't':
    case 'T':
      return 'toggleToc'
    case 'R':
      return 'blackoutOn'
    case 'r':
      return 'blackoutOff'
    case 'b':
      return 'toggleBlackout'
    case 'c':
    case 'v':
    case '1':
    case '2':
    case '3':
    case '4':
      return 'jumpSection'
    default:
      return null
  }
}

export function avSectionJumpTitle(key: string): string | null {
  switch (key) {
    case 'c':
      return 'Chorus'
    case 'v':
      return 'Verse'
    case '1':
      return 'Verse 1'
    case '2':
      return 'Verse 2'
    case '3':
      return 'Verse 3'
    case '4':
      return 'Verse 4'
    default:
      return null
  }
}
