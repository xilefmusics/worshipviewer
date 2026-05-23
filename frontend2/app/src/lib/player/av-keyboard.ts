import {
  avPresentationIndexForSectionTitle,
  type AvSectionOutline,
} from '@/lib/player/av-lyric-slides'

export type AvKeyboardAction =
  | 'prev'
  | 'next'
  | 'home'
  | 'end'
  | 'escape'
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
    case 'r':
      return 'toggleBlackout'
    case 't':
    case 'e':
    case 'b':
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

export type AvSectionJumpShortcut = {
  key: string
  sectionTitle: string
}

export const AV_BLACKOUT_SHORTCUT_KEY = 'r'

export const AV_SECTION_JUMP_SHORTCUTS: readonly AvSectionJumpShortcut[] = [
  { key: 'c', sectionTitle: 'Chorus' },
  { key: 'v', sectionTitle: 'Verse' },
  { key: '1', sectionTitle: 'Verse 1' },
  { key: '2', sectionTitle: 'Verse 2' },
  { key: '3', sectionTitle: 'Verse 3' },
  { key: '4', sectionTitle: 'Verse 4' },
  { key: 'b', sectionTitle: 'Bridge' },
  { key: 't', sectionTitle: 'Tag' },
  { key: 'e', sectionTitle: 'Ending' },
]

export function avSectionJumpTitle(key: string): string | null {
  return AV_SECTION_JUMP_SHORTCUTS.find((shortcut) => shortcut.key === key)?.sectionTitle ?? null
}

export function avAvailableSectionJumpShortcuts(
  outline: AvSectionOutline[],
): AvSectionJumpShortcut[] {
  return AV_SECTION_JUMP_SHORTCUTS.filter(
    (shortcut) => avPresentationIndexForSectionTitle(outline, shortcut.sectionTitle) != null,
  )
}
