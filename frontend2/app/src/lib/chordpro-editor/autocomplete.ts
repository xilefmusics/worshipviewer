import { autocompletion, type Completion, type CompletionContext } from '@codemirror/autocomplete'

import { MUSICAL_KEYS } from '@/lib/setlist-editor-constants'

const DIRECTIVES: Completion[] = [
  'title:',
  'title2:',
  'title3:',
  'title4:',
  'title5:',
  'title6:',
  'title7:',
  'title8:',
  'title9:',
  'subtitle:',
  'artist:',
  'artist2:',
  'artist3:',
  'artist4:',
  'artist5:',
  'artist6:',
  'artist7:',
  'artist8:',
  'artist9:',
  'key:',
  'tempo:',
  'time:',
  'language:',
  'language2:',
  'language3:',
  'language4:',
  'language5:',
  'language6:',
  'language7:',
  'language8:',
  'language9:',
  'copyright:',
  'comment:',
  'section:',
  'repeat:',
  'meta:',
].map((label) => ({ label, type: 'keyword' }))

const KEY_VALUES: Completion[] = MUSICAL_KEYS.map((k) => ({
  label: k,
  type: 'constant',
  detail: 'key',
}))

const TIME_VALUES: Completion[] = ['4/4', '3/4', '6/8', '2/4', '12/8'].map((label) => ({
  label,
  type: 'constant',
  detail: 'time signature',
}))

const CHORD_ROOTS = ['C', 'C#', 'Db', 'D', 'D#', 'Eb', 'E', 'F', 'F#', 'Gb', 'G', 'G#', 'Ab', 'A', 'A#', 'Bb', 'B']
const CHORD_QUALITIES = ['', 'm', 'maj7', 'm7', '7', 'dim', 'aug', 'sus2', 'sus4', 'add9', 'm7b5']

const CHORDS: Completion[] = CHORD_ROOTS.flatMap((root) =>
  CHORD_QUALITIES.map((quality) => ({
    label: `${root}${quality}`,
    type: 'variable' as const,
    detail: 'chord',
  })),
)

function directiveCompletions(context: CompletionContext): Completion[] | null {
  const before = context.matchBefore(/\{[a-z0-9]*/i)
  if (!before) return null
  if (before.text === '{') {
    return DIRECTIVES.map((item) => ({
      ...item,
      apply: `{${item.label}}`,
    }))
  }
  const partial = before.text.slice(1)
  return DIRECTIVES.filter((item) => item.label.startsWith(partial)).map((item) => ({
    ...item,
    apply: `{${item.label}}`,
  }))
}

function keyValueCompletions(context: CompletionContext): Completion[] | null {
  const before = context.matchBefore(/\{key:\s*[A-Ga-g#b]*/i)
  if (!before) return null
  const partial = before.text.replace(/^\{key:\s*/i, '')
  return KEY_VALUES.filter((item) => item.label.toLowerCase().startsWith(partial.toLowerCase()))
}

function timeValueCompletions(context: CompletionContext): Completion[] | null {
  const before = context.matchBefore(/\{time:\s*[0-9/]*/)
  if (!before) return null
  const partial = before.text.replace(/^\{time:\s*/, '')
  return TIME_VALUES.filter((item) => item.label.startsWith(partial))
}

function chordCompletions(context: CompletionContext): Completion[] | null {
  const before = context.matchBefore(/\[[^\]]*/)
  if (!before || before.text === '[') {
    if (before?.text === '[') {
      return CHORDS.slice(0, 24)
    }
    return null
  }
  const partial = before.text.slice(1)
  const matches = CHORDS.filter((item) => item.label.toLowerCase().startsWith(partial.toLowerCase()))
  return matches.slice(0, 20).map((item) => ({
    ...item,
    apply: `[${item.label}]`,
  }))
}

function chordProCompletions(context: CompletionContext) {
  const directive = directiveCompletions(context)
  if (directive?.length) {
    return { from: context.matchBefore(/\{[a-z0-9]*/i)?.from ?? context.pos, options: directive }
  }

  const key = keyValueCompletions(context)
  if (key?.length) {
    return { from: context.matchBefore(/\{key:\s*[A-Ga-g#b]*/i)?.from ?? context.pos, options: key }
  }

  const time = timeValueCompletions(context)
  if (time?.length) {
    return { from: context.matchBefore(/\{time:\s*[0-9/]*/)?.from ?? context.pos, options: time }
  }

  const chord = chordCompletions(context)
  if (chord?.length) {
    return { from: context.matchBefore(/\[[^\]]*/)?.from ?? context.pos, options: chord }
  }

  return null
}

export const chordProAutocomplete = autocompletion({
  activateOnTyping: true,
  override: [chordProCompletions],
})
