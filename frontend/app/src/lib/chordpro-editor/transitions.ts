/** Tokenizer state transitions ported from the v1 CodeMirror ChordPro mode. */
export type ChordProTransition = {
  state: string
  suffix: string
  new_state: string | null
  label: string | null
  back: number
}

const TITLE_N = [
  'title2:',
  'title3:',
  'title4:',
  'title5:',
  'title6:',
  'title7:',
  'title8:',
  'title9:',
] as const

const ARTIST_N = [
  'artist2:',
  'artist3:',
  'artist4:',
  'artist5:',
  'artist6:',
  'artist7:',
  'artist8:',
  'artist9:',
] as const

const LANGUAGE_N = [
  'language2:',
  'language3:',
  'language4:',
  'language5:',
  'language6:',
  'language7:',
  'language8:',
  'language9:',
] as const

function buildTransitions(): ChordProTransition[] {
  const rows: ChordProTransition[] = [
    { state: 'default', suffix: '{', new_state: 'meta-begin', label: 'default', back: 1 },
    { state: 'meta-begin', suffix: '{', new_state: 'meta-begin', label: null, back: 0 },
    { state: 'meta-begin', suffix: ':', new_state: 'meta-middle', label: null, back: 1 },
    { state: 'meta-begin', suffix: '}', new_state: 'meta-end', label: null, back: 1 },
    { state: 'meta-begin', suffix: '', new_state: 'meta-key', label: 'meta-surround', back: 1 },
    { state: 'meta-key', suffix: 'title:', new_state: 'meta-middle', label: 'meta-key', back: 1 },
    { state: 'meta-key', suffix: 'artist:', new_state: 'meta-middle', label: 'meta-key', back: 1 },
    { state: 'meta-key', suffix: 'key:', new_state: 'meta-middle', label: 'meta-key', back: 1 },
    { state: 'meta-key', suffix: 'section:', new_state: 'meta-middle', label: 'meta-key', back: 1 },
    { state: 'meta-key', suffix: 'language:', new_state: 'meta-middle', label: 'meta-key', back: 1 },
    { state: 'meta-key', suffix: 'tempo:', new_state: 'meta-middle', label: 'meta-key', back: 1 },
    { state: 'meta-key', suffix: 'time:', new_state: 'meta-middle', label: 'meta-key', back: 1 },
    { state: 'meta-key', suffix: 'comment:', new_state: 'meta-middle', label: 'meta-key', back: 1 },
  ]

  for (const k of TITLE_N) {
    rows.push({ state: 'meta-key', suffix: k, new_state: 'meta-middle', label: 'meta-key', back: 1 })
  }
  for (const k of ARTIST_N) {
    rows.push({ state: 'meta-key', suffix: k, new_state: 'meta-middle', label: 'meta-key', back: 1 })
  }
  for (const k of LANGUAGE_N) {
    rows.push({ state: 'meta-key', suffix: k, new_state: 'meta-middle', label: 'meta-key', back: 1 })
  }

  rows.push(
    { state: 'meta-key', suffix: 'repeat:', new_state: 'meta-middle', label: 'meta-key', back: 1 },
    { state: 'meta-key', suffix: 'meta:', new_state: 'meta-middle', label: 'meta-key', back: 1 },
    { state: 'meta-key', suffix: 'subtitle:', new_state: 'meta-middle', label: 'meta-key', back: 1 },
    { state: 'meta-key', suffix: 'copyright:', new_state: 'meta-middle', label: 'meta-key', back: 1 },
    { state: 'meta-key', suffix: ':', new_state: 'meta-middle', label: 'meta-key-error', back: 1 },
    { state: 'meta-key', suffix: '}', new_state: 'meta-end', label: 'meta-key', back: 1 },
    { state: 'meta-middle', suffix: ':', new_state: 'meta-middle', label: null, back: 0 },
    { state: 'meta-middle', suffix: '}', new_state: 'meta-end', label: null, back: 1 },
    { state: 'meta-middle', suffix: '', new_state: 'meta-value', label: 'meta-surround', back: 1 },
    { state: 'meta-value', suffix: '}', new_state: 'meta-end', label: 'meta-value', back: 1 },
    { state: 'meta-value', suffix: '', new_state: 'meta-value', label: 'meta-value', back: 0 },
    { state: 'meta-end', suffix: '}', new_state: 'default', label: 'meta-surround', back: 0 },
    { state: 'default', suffix: '[', new_state: 'chord', label: 'default', back: 1 },
    { state: 'chord', suffix: '[', new_state: 'chord', label: null, back: 0 },
    { state: 'chord', suffix: ']', new_state: 'default', label: 'chord', back: 0 },
  )

  return rows
}

export const CHORDPRO_TRANSITIONS = buildTransitions()
