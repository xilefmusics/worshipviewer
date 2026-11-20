import type { AvSectionOutline } from '@/lib/player/av-lyric-slides'

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

type AvKeyboardEventLike = Pick<
  KeyboardEvent,
  'key' | 'code' | 'shiftKey' | 'altKey' | 'ctrlKey' | 'metaKey'
>
type AvKeyboardInput = string | AvKeyboardEventLike

function keyboardEvent(input: AvKeyboardInput): AvKeyboardEventLike {
  if (typeof input !== 'string') return input
  return {
    key: input,
    code: '',
    shiftKey: false,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
  }
}

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

export type AvSectionJumpShortcut = {
  /** The unmodified key associated with this section family. */
  key: string
  /** The outline title shown to the operator. */
  sectionTitle: string
  /** One-based occurrence within this section family. */
  occurrence: number
  /** Presentation slide index for this occurrence. */
  slideIndex: number
  /** Visible and accessible shortcut label, or null when button-only. */
  keyLabel: string | null
}

type AvSectionJumpShortcutKey = Pick<AvSectionJumpShortcut, 'key' | 'sectionTitle'>

export const AV_BLANK_SHORTCUT_KEY = 'r'
export const AV_BLACKOUT_SHORTCUT_KEY = 'R'
export const AV_OPEN_OUTPUT_SHORTCUT_KEY = 'o'
export const AV_NEXT_LANGUAGE_SHORTCUT_KEY = 'l'
export const AV_TRANSLATION_SHORTCUT_KEY = 't'

export const AV_SECTION_JUMP_SHORTCUTS: readonly AvSectionJumpShortcutKey[] = [
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

const OCCURRENCE_KEY_VARIANTS = [
  { shiftKey: false, altKey: false, labelPrefix: '' },
  { shiftKey: true, altKey: false, labelPrefix: 'Shift+' },
  { shiftKey: false, altKey: true, labelPrefix: 'Alt+' },
  { shiftKey: true, altKey: true, labelPrefix: 'Shift+Alt+' },
] as const

function stripRepeatSuffix(title: string): string {
  return title.trim().replace(/\s+\(\d+\)$/, '').trim()
}

function matchesSectionFamily(title: string, sectionTitle: string): boolean {
  const normalizedTitle = stripRepeatSuffix(title).toLowerCase()
  const normalizedSectionTitle = sectionTitle.toLowerCase()
  if (normalizedTitle === normalizedSectionTitle) return true

  // Verse 1–9 already have dedicated number keys, so V remains for the
  // unnumbered Verse section and its repeated copies only.
  if (sectionTitle === 'Verse') return false

  const numberedBase = normalizedTitle.replace(/\s+\d+$/, '').trim()
  return numberedBase !== normalizedTitle && numberedBase === normalizedSectionTitle
}

function presentationOccurrences(
  outline: AvSectionOutline[],
  sectionTitle: string,
): Array<{ title: string; slideIndex: number }> {
  const occurrences: Array<{ title: string; slideIndex: number }> = []
  let slideIndex = 0

  for (const row of outline) {
    if (matchesSectionFamily(row.title, sectionTitle)) {
      occurrences.push({ title: row.title, slideIndex })
    }
    slideIndex += row.len
  }

  return occurrences
}

function displaySectionTitle(
  sectionTitle: string,
  occurrenceTitle: string,
  occurrence: number,
  occurrenceCount: number,
): string {
  if (occurrenceCount > 1 && stripRepeatSuffix(occurrenceTitle).toLowerCase() === sectionTitle.toLowerCase()) {
    return occurrence === 1 ? sectionTitle : `${sectionTitle} (${occurrence})`
  }
  return occurrenceTitle
}

function effectiveShortcutKey(key: string, languageShortcuts: boolean): string {
  return languageShortcuts && key === 't' ? 'g' : key
}

function isSectionShortcutKey(key: string, languageShortcuts: boolean): boolean {
  return AV_SECTION_JUMP_SHORTCUTS.some(
    (shortcut) => effectiveShortcutKey(shortcut.key, languageShortcuts) === key,
  )
}

export function avSectionJumpTitle(key: string, languageShortcuts = false): string | null {
  if (languageShortcuts && key === 'g') return 'Tag'
  return AV_SECTION_JUMP_SHORTCUTS.find((shortcut) => shortcut.key === key)?.sectionTitle ?? null
}

export function avAvailableSectionJumpShortcuts(
  outline: AvSectionOutline[],
  languageShortcuts = false,
): AvSectionJumpShortcut[] {
  return AV_SECTION_JUMP_SHORTCUTS.flatMap((shortcut) => {
    const occurrences = presentationOccurrences(outline, shortcut.sectionTitle)
    const key = effectiveShortcutKey(shortcut.key, languageShortcuts)

    return occurrences.map((occurrence, index) => {
      const occurrenceNumber = index + 1
      const keyVariant = OCCURRENCE_KEY_VARIANTS[index]
      const keyLabel = keyVariant ? `${keyVariant.labelPrefix}${key.toUpperCase()}` : null

      return {
        key,
        sectionTitle: displaySectionTitle(
          shortcut.sectionTitle,
          occurrence.title,
          occurrenceNumber,
          occurrences.length,
        ),
        occurrence: occurrenceNumber,
        slideIndex: occurrence.slideIndex,
        keyLabel,
      }
    })
  })
}

function keyFromCode(code: string): string | null {
  const letter = /^Key([A-Z])$/.exec(code)
  if (letter) return letter[1]!.toLowerCase()

  const digit = /^(?:Digit|Numpad)([0-9])$/.exec(code)
  return digit?.[1] ?? null
}

function sectionShortcutInput(
  input: AvKeyboardInput,
  languageShortcuts: boolean,
): { key: string; occurrence: number } | null {
  const event = keyboardEvent(input)
  if (event.ctrlKey || event.metaKey) return null

  if (!event.shiftKey && !event.altKey) {
    if (languageShortcuts && event.key === 't') return null
    return { key: event.key, occurrence: 1 }
  }

  const baseKey = keyFromCode(event.code)
    ?? (/^[a-z]$/i.test(event.key) ? event.key.toLowerCase() : null)
  if (!baseKey) return null

  const occurrence = OCCURRENCE_KEY_VARIANTS.findIndex(
    (variant) => variant.shiftKey === event.shiftKey && variant.altKey === event.altKey,
  ) + 1
  if (occurrence === 1) return null
  return { key: baseKey, occurrence }
}

export function avSectionJumpShortcutForEvent(
  input: AvKeyboardInput,
  outline: AvSectionOutline[],
  languageShortcuts = false,
): AvSectionJumpShortcut | null {
  const target = sectionShortcutInput(input, languageShortcuts)
  if (!target) return null

  return avAvailableSectionJumpShortcuts(outline, languageShortcuts).find(
    (shortcut) => shortcut.key === target.key && shortcut.occurrence === target.occurrence,
  ) ?? null
}

/** Map keyboard events to AV player actions. */
export function avKeyboardAction(
  input: AvKeyboardInput,
  target: EventTarget | null,
  options?: { tocOpen?: boolean; languageShortcuts?: boolean },
): AvKeyboardAction {
  if (isEditableTarget(target)) return null

  const event = keyboardEvent(input)
  const key = event.key

  if (event.ctrlKey || event.metaKey) return null

  if (event.shiftKey || event.altKey) {
    const shortcut = sectionShortcutInput(input, options?.languageShortcuts ?? false)
    if (shortcut && isSectionShortcutKey(shortcut.key, options?.languageShortcuts ?? false)) {
      return 'jumpSection'
    }
  }

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
