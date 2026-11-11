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
  | 'toggleBlank'
  | 'toggleBlackout'
  | 'toggleTranslation'
  | 'nextLanguage'
  | 'openOutput'
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
  options?: { tocOpen?: boolean; languageShortcuts?: boolean },
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
      return 'toggleBlank'
    case 'R':
      return 'toggleBlackout'
    case 'o':
      return 'openOutput'
    case 'l':
      return options?.languageShortcuts ? 'nextLanguage' : null
    case 't':
      return options?.languageShortcuts ? 'toggleTranslation' : 'jumpSection'
    case 'e':
    case 'b':
    case 'c':
    case 'v':
    case 'p':
    case '1':
    case '2':
    case '3':
    case '4':
    case '5':
    case '6':
    case '7':
    case '8':
    case '9':
      return 'jumpSection'
    case 'g':
      return options?.languageShortcuts ? 'jumpSection' : null
    default:
      return null
  }
}

export type AvSectionJumpShortcut = {
  key: string
  sectionTitle: string
}

export const AV_BLANK_SHORTCUT_KEY = 'r'
export const AV_BLACKOUT_SHORTCUT_KEY = 'R'
export const AV_OPEN_OUTPUT_SHORTCUT_KEY = 'o'
export const AV_NEXT_LANGUAGE_SHORTCUT_KEY = 'l'
export const AV_TRANSLATION_SHORTCUT_KEY = 't'

export const AV_SECTION_JUMP_SHORTCUTS: readonly AvSectionJumpShortcut[] = [
  { key: 'c', sectionTitle: 'Chorus' },
  { key: 'v', sectionTitle: 'Verse' },
  { key: 'p', sectionTitle: 'Pre-Chorus' },
  { key: '1', sectionTitle: 'Verse 1' },
  { key: '2', sectionTitle: 'Verse 2' },
  { key: '3', sectionTitle: 'Verse 3' },
  { key: '4', sectionTitle: 'Verse 4' },
  { key: '5', sectionTitle: 'Verse 5' },
  { key: '6', sectionTitle: 'Verse 6' },
  { key: '7', sectionTitle: 'Verse 7' },
  { key: '8', sectionTitle: 'Verse 8' },
  { key: '9', sectionTitle: 'Verse 9' },
  { key: 'b', sectionTitle: 'Bridge' },
  { key: 't', sectionTitle: 'Tag' },
  { key: 'e', sectionTitle: 'Ending' },
]

export function avSectionJumpTitle(key: string, languageShortcuts = false): string | null {
  if (languageShortcuts && key === 'g') return 'Tag'
  return AV_SECTION_JUMP_SHORTCUTS.find((shortcut) => shortcut.key === key)?.sectionTitle ?? null
}

export function avAvailableSectionJumpShortcuts(
  outline: AvSectionOutline[],
  languageShortcuts = false,
): AvSectionJumpShortcut[] {
  return AV_SECTION_JUMP_SHORTCUTS.filter(
    (shortcut) => avPresentationIndexForSectionTitle(outline, shortcut.sectionTitle) != null,
  ).map((shortcut) =>
    languageShortcuts && shortcut.sectionTitle === 'Tag'
      ? { ...shortcut, key: 'g' }
      : shortcut,
  )
}
