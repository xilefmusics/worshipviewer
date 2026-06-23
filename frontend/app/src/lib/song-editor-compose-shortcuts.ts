export const CHORD_PLACEMENT_MODE_ARIA_SHORTCUT = 'Meta+P'
export const CHORD_ERASER_MODE_ARIA_SHORTCUT = 'Meta+E'
export const CHORD_SIMPLIFY_MODE_ARIA_SHORTCUT = 'Meta+S'

function isModShortcut(
  event: Pick<KeyboardEvent, 'altKey' | 'metaKey' | 'ctrlKey' | 'shiftKey' | 'code'>,
  code: string,
): boolean {
  return (
    (event.metaKey || event.ctrlKey) &&
    !event.altKey &&
    !event.shiftKey &&
    event.code === code
  )
}

export function isChordPlacementModeShortcut(
  event: Pick<KeyboardEvent, 'altKey' | 'metaKey' | 'ctrlKey' | 'shiftKey' | 'code'>,
): boolean {
  return isModShortcut(event, 'KeyP')
}

export function isChordEraserModeShortcut(
  event: Pick<KeyboardEvent, 'altKey' | 'metaKey' | 'ctrlKey' | 'shiftKey' | 'code'>,
): boolean {
  return isModShortcut(event, 'KeyE')
}

export function isChordSimplifyModeShortcut(
  event: Pick<KeyboardEvent, 'altKey' | 'metaKey' | 'ctrlKey' | 'shiftKey' | 'code'>,
): boolean {
  return isModShortcut(event, 'KeyS')
}

function modShortcutLabel(key: string): string {
  if (typeof globalThis.navigator === 'undefined') {
    return `Ctrl+${key}`
  }
  return /Mac|iPhone|iPod|iPad/i.test(globalThis.navigator.platform) ? `⌘${key}` : `Ctrl+${key}`
}

export function chordPlacementModeShortcutLabel(): string {
  return modShortcutLabel('P')
}

export function chordEraserModeShortcutLabel(): string {
  return modShortcutLabel('E')
}

export function chordSimplifyModeShortcutLabel(): string {
  return modShortcutLabel('S')
}
