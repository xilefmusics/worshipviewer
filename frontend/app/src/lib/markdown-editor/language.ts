import {
  HighlightStyle,
  LanguageSupport,
  StreamLanguage,
  syntaxHighlighting,
} from '@codemirror/language'
import { Tag, tags } from '@lezer/highlight'

type MarkdownLineKind =
  | 'front-matter-delimiter'
  | 'front-matter'
  | 'heading'
  | 'chord'
  | 'translation-chord'
  | 'translation'
  | 'lyric'

type MarkdownTokenState = {
  inFrontMatter: boolean
  inComment: boolean
  lineKind: MarkdownLineKind
}

function startState(): MarkdownTokenState {
  return {
    inFrontMatter: false,
    inComment: false,
    lineKind: 'lyric',
  }
}

function isChordToken(token: string): boolean {
  return /^\(?[A-Ha-h0-9#b][^\s]*\)?$/.test(token)
}

function isChordRow(source: string): boolean {
  const trimmed = source.trim()
  if (!trimmed) return false
  return trimmed.split(/\s+/).every(isChordToken)
}

function classifyLine(state: MarkdownTokenState, line: string): void {
  if (line.trim() === '---') {
    state.lineKind = 'front-matter-delimiter'
    state.inFrontMatter = !state.inFrontMatter
    state.inComment = false
    return
  }

  state.inComment = false

  if (state.inFrontMatter) {
    state.lineKind = 'front-matter'
    return
  }

  if (/^# /.test(line)) {
    state.lineKind = 'heading'
    return
  }

  const isTranslation = line.startsWith('&')
  const content = isTranslation ? line.slice(1) : line
  if (isChordRow(content)) {
    state.lineKind = isTranslation ? 'translation-chord' : 'chord'
  } else {
    state.lineKind = isTranslation ? 'translation' : 'lyric'
  }
}

function isEscaped(text: string, byteIndex: number): boolean {
  let backslashes = 0
  for (let index = byteIndex - 1; index >= 0 && text[index] === '\\'; index -= 1) {
    backslashes += 1
  }
  return backslashes % 2 === 1
}

function isCommentDelimiter(stream: { string: string; pos: number }): boolean {
  return stream.string.slice(stream.pos, stream.pos + 2) === '**' && !isEscaped(stream.string, stream.pos)
}

const frontMatterDelimiterTag = Tag.define()
const frontMatterKeyTag = Tag.define()
const frontMatterValueTag = Tag.define()
const headingTag = Tag.define()
const chordTag = Tag.define()
const translationChordTag = Tag.define()
const translationTag = Tag.define()
const commentTag = Tag.define()
const commentDelimiterTag = Tag.define()

const markdownLanguage = StreamLanguage.define<MarkdownTokenState>({
  name: 'aligned-markdown',
  startState,
  token(stream, state) {
    if (stream.sol()) classifyLine(state, stream.string)

    if (state.lineKind === 'front-matter-delimiter') {
      stream.skipToEnd()
      return 'front-matter-delimiter'
    }

    if (state.lineKind === 'heading') {
      stream.skipToEnd()
      return 'heading'
    }

    if (state.lineKind === 'front-matter') {
      if (stream.match(/^\s*[A-Za-z_][\w-]*(?=\s*:)/)) return 'front-matter-key'
      if (stream.eatSpace()) return null
      if (stream.match(/^(?:null|true|false|-?\d+(?:\.\d+)?|[^\s,:[\]{}]+)/)) {
        return 'front-matter-value'
      }
      stream.next()
      return 'front-matter-value'
    }

    if (
      state.lineKind === 'chord' ||
      state.lineKind === 'translation-chord'
    ) {
      if (stream.sol() && stream.match(/^&/)) return 'translation'
      if (stream.eatSpace()) return null
      if (stream.match(/^\(?[A-Ha-h0-9#b][^\s]*\)?/)) {
        return state.lineKind === 'translation-chord' ? 'translation-chord' : 'chord'
      }
      stream.next()
      return state.lineKind === 'translation-chord' ? 'translation' : null
    }

    if (stream.sol() && stream.match(/^&/)) return 'translation'

    if (isCommentDelimiter(stream)) {
      stream.next()
      stream.next()
      state.inComment = !state.inComment
      return 'comment-delimiter'
    }

    if (state.inComment) {
      const start = stream.pos
      while (!stream.eol() && !isCommentDelimiter(stream)) stream.next()
      if (stream.pos === start) stream.next()
      return 'comment'
    }

    const textTag = state.lineKind === 'translation' ? 'translation' : null
    if (stream.match(/^[^*]+/)) return textTag
    stream.next()
    return textTag
  },
  tokenTable: {
    'front-matter-delimiter': frontMatterDelimiterTag,
    'front-matter-key': frontMatterKeyTag,
    'front-matter-value': frontMatterValueTag,
    heading: headingTag,
    chord: chordTag,
    'translation-chord': translationChordTag,
    translation: translationTag,
    comment: commentTag,
    'comment-delimiter': commentDelimiterTag,
  },
})

const markdownHighlightStyle = HighlightStyle.define([
  { tag: frontMatterDelimiterTag, color: 'oklch(0.58 0.2 25)', fontWeight: '700' },
  { tag: frontMatterKeyTag, color: 'oklch(0.62 0.12 130)', fontWeight: '600' },
  { tag: frontMatterValueTag, color: 'oklch(0.55 0.02 60)' },
  { tag: headingTag, color: 'var(--color-primary)', fontWeight: '700' },
  { tag: chordTag, color: 'oklch(0.72 0.14 75)', fontWeight: '700' },
  { tag: translationChordTag, color: 'oklch(0.62 0.12 65)', fontWeight: '700' },
  { tag: translationTag, color: 'oklch(0.55 0.02 60)', fontStyle: 'italic' },
  { tag: commentTag, color: 'oklch(0.55 0.02 60)', fontStyle: 'italic' },
  { tag: commentDelimiterTag, color: 'oklch(0.58 0.2 25)', fontWeight: '700' },
  { tag: tags.content, color: 'var(--color-foreground)' },
])

export function markdownLanguageSupport(): LanguageSupport {
  return new LanguageSupport(markdownLanguage, [
    syntaxHighlighting(markdownHighlightStyle),
  ])
}
