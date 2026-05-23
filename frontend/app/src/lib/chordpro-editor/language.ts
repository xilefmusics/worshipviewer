import {
  HighlightStyle,
  LanguageSupport,
  StreamLanguage,
  syntaxHighlighting,
} from '@codemirror/language'
import { Tag, tags } from '@lezer/highlight'

import { CHORDPRO_TRANSITIONS } from '@/lib/chordpro-editor/transitions'

export type ChordProTokenState = {
  state: string
  parsed: string
  chordAcc: string
  metaSplitPhase: 'key' | 'value' | null
  metaKeySeenNonWs: boolean
  translationLine: boolean
  translationPendingAmp: boolean
  chordOnTranslationLine: boolean
}

function startState(): ChordProTokenState {
  return {
    state: 'default',
    parsed: '',
    chordAcc: '',
    metaSplitPhase: null,
    metaKeySeenNonWs: false,
    translationLine: false,
    translationPendingAmp: false,
    chordOnTranslationLine: false,
  }
}

function tokenLabel(
  state: ChordProTokenState,
  transition: (typeof CHORDPRO_TRANSITIONS)[number],
): string | null {
  if (transition.label === null) return null

  if (
    state.metaSplitPhase === 'key' &&
    transition.state === 'meta-middle' &&
    transition.new_state === 'meta-value' &&
    transition.suffix === ''
  ) {
    state.parsed = ''
    return null
  }

  let label = transition.label
  if (
    label === 'chord' &&
    transition.suffix === ']' &&
    state.chordAcc.length > 0 &&
    /^\d/.test(state.chordAcc)
  ) {
    label = 'nashville'
  }

  if (state.chordOnTranslationLine) {
    if (
      label === 'default' &&
      transition.state === 'default' &&
      transition.new_state === 'chord' &&
      transition.suffix === '['
    ) {
      label = 'chord-translation'
    } else if (label === 'chord') {
      label = 'chord-translation'
    } else if (label === 'nashville') {
      label = 'nashville-translation'
    }
  }

  if (transition.suffix === ']') {
    state.chordAcc = ''
  }
  if (transition.state === 'chord' && transition.new_state === 'default') {
    state.chordOnTranslationLine = false
  }

  state.parsed = ''
  return label
}

function applyTransition(state: ChordProTokenState, transition: (typeof CHORDPRO_TRANSITIONS)[number], prevState: string) {
  if (transition.new_state !== null) {
    state.state = transition.new_state
    if (transition.state === 'meta-key' && transition.new_state === 'meta-middle') {
      state.metaSplitPhase = transition.suffix === 'meta:' ? 'key' : null
      if (state.metaSplitPhase === 'key') {
        state.metaKeySeenNonWs = false
      }
    }
    if (transition.new_state === 'meta-end' || transition.new_state === 'default') {
      state.metaSplitPhase = null
      state.metaKeySeenNonWs = false
    }
    if (transition.new_state === 'chord' && prevState !== 'chord') {
      state.chordAcc = ''
    }
    if (transition.state === 'default' && transition.new_state === 'meta-begin') {
      state.metaSplitPhase = null
      state.metaKeySeenNonWs = false
    }
    if (transition.state === 'default' && transition.new_state === 'chord') {
      state.chordOnTranslationLine = state.translationLine
    }
  }
}

const chordProTag = Tag.define()
const metaSurroundTag = Tag.define()
const metaKeyTag = Tag.define()
const metaKeyErrorTag = Tag.define()
const metaValueTag = Tag.define()
const metaKeypairValueTag = Tag.define()
const metaTagKeyTag = Tag.define()
const chordTranslationTag = Tag.define()
const nashvilleTag = Tag.define()
const nashvilleTranslationTag = Tag.define()
const translationLyricTag = Tag.define()

const chordProLanguage = StreamLanguage.define<ChordProTokenState>({
  name: 'chordpro',
  startState,
  token(stream, state) {
    while (true) {
      if (state.state === 'meta-value' && state.metaSplitPhase === 'key') {
        const ch = stream.next()
        if (ch === undefined) return null
        if (ch === '}') {
          stream.backUp(1)
          state.metaSplitPhase = null
          state.metaKeySeenNonWs = false
          continue
        }
        if (/\s/.test(ch)) {
          if (!state.metaKeySeenNonWs) {
            state.parsed = ''
            return null
          }
          state.metaSplitPhase = 'value'
          state.metaKeySeenNonWs = false
          state.parsed = ''
          return null
        }
        state.metaKeySeenNonWs = true
        state.parsed = ''
        return 'meta-tag-key'
      }

      if (state.state === 'meta-value' && state.metaSplitPhase === 'value') {
        const ch = stream.next()
        if (ch === undefined) return null
        if (ch === '}') {
          stream.backUp(1)
          state.metaSplitPhase = null
          state.metaKeySeenNonWs = false
          continue
        }
        state.parsed = ''
        return 'meta-keypair-value'
      }

      if (state.state === 'default') {
        if (stream.sol()) {
          const isTrans = stream.match(/^[ \t]*&/, false) != null
          state.translationLine = isTrans
          state.translationPendingAmp = isTrans
        }
      }

      if (state.state === 'default' && state.translationLine) {
        const p = stream.peek()
        if (p === '\n') {
          stream.next()
          state.translationLine = false
          state.translationPendingAmp = false
          state.parsed = ''
          return null
        }
        if (p !== '[' && p !== '{') {
          const chT = stream.next()
          state.parsed = ''
          if (chT === '&' && state.translationPendingAmp) {
            state.translationPendingAmp = false
            state.translationLine = true
            return 'meta-value'
          }
          return 'translation-lyric'
        }
      }

      const ch = stream.next()
      if (ch === undefined) return null

      const prevState = state.state
      state.parsed += ch

      if (state.state === 'chord' && ch !== ']') {
        state.chordAcc += ch
      }

      for (const transition of CHORDPRO_TRANSITIONS) {
        if (state.state === transition.state && state.parsed.endsWith(transition.suffix)) {
          if (transition.back > 0) {
            state.parsed = state.parsed.slice(0, -transition.back)
            stream.backUp(transition.back)
          }
          applyTransition(state, transition, prevState)
          const label = tokenLabel(state, transition)
          if (label !== null) return label
          break
        }
      }
    }
  },
  tokenTable: {
    'meta-surround': metaSurroundTag,
    'meta-key': metaKeyTag,
    'meta-key-error': metaKeyErrorTag,
    'meta-value': metaValueTag,
    'meta-keypair-value': metaKeypairValueTag,
    'meta-tag-key': metaTagKeyTag,
    chord: chordProTag,
    'chord-translation': chordTranslationTag,
    nashville: nashvilleTag,
    'nashville-translation': nashvilleTranslationTag,
    'translation-lyric': translationLyricTag,
  },
})

const chordProHighlightStyle = HighlightStyle.define([
  { tag: metaSurroundTag, fontWeight: '700' },
  { tag: metaKeyTag, color: 'oklch(0.58 0.2 25)' },
  { tag: metaKeyErrorTag, textDecoration: 'underline', color: 'oklch(0.58 0.2 25)' },
  { tag: metaValueTag, color: 'oklch(0.62 0.12 130)' },
  { tag: metaKeypairValueTag, color: 'oklch(0.55 0.02 60)' },
  { tag: metaTagKeyTag, color: 'oklch(0.62 0.12 130)' },
  { tag: chordProTag, color: 'oklch(0.72 0.14 75)' },
  { tag: chordTranslationTag, color: 'oklch(0.62 0.12 65)' },
  { tag: nashvilleTag, color: 'oklch(0.68 0.16 55)', fontWeight: '600' },
  { tag: nashvilleTranslationTag, color: 'oklch(0.62 0.12 55)', fontWeight: '600' },
  { tag: translationLyricTag, color: 'oklch(0.55 0.02 60)' },
  { tag: tags.content, color: 'var(--color-foreground)' },
])

export function chordProLanguageSupport(): LanguageSupport {
  return new LanguageSupport(chordProLanguage, [
    syntaxHighlighting(chordProHighlightStyle),
  ])
}
