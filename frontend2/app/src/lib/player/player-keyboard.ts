export type PlayerKeyboardAction =
  | 'prev'
  | 'next'
  | 'home'
  | 'end'
  | 'escape'
  | 'toggleChrome'
  | 'cycleScroll'
  | 'edit'
  | 'toggleLike'
  | 'toggleChordFormat'
  | 'resetTranspose'
  | 'transposeUp'
  | 'transposeDown'
  | { type: 'setTransposeKey'; key: string }
  | null

const TRANSPOSE_KEY_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G'] as const

function isTransposeKeyLetter(key: string): key is (typeof TRANSPOSE_KEY_LETTERS)[number] {
  return (TRANSPOSE_KEY_LETTERS as readonly string[]).includes(key)
}

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

function transposeAction(key: string): PlayerKeyboardAction {
  if (isTransposeKeyLetter(key)) return { type: 'setTransposeKey', key }
  if (key === 'r') return 'resetTranspose'
  if (key === 'b' || key === '-') return 'transposeDown'
  if (key === '#' || key === '+') return 'transposeUp'
  return null
}

/** Map keyboard events to player actions; returns null when the event should be ignored. */
export function playerKeyboardAction(
  key: string,
  target: EventTarget | null,
  options?: { popoverOpen?: boolean },
): PlayerKeyboardAction {
  if (isEditableTarget(target)) return null

  const popoverOpen = options?.popoverOpen ?? false

  if (key === 'Escape') return 'escape'

  const transpose = transposeAction(key)
  if (transpose) return transpose

  if (popoverOpen) return null

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
    case 'm':
      return 'toggleChrome'
    case 's':
      return 'cycleScroll'
    case 'e':
      return 'edit'
    case 'l':
      return 'toggleLike'
    case 'n':
      return 'toggleChordFormat'
    default:
      return null
  }
}
