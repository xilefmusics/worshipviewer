/** Chord symbol spelling mode for format/render. */
export type ChordRepresentation = 'default' | 'nashville'

export type FormatChordProOptions = {
  key?: string
  representation?: ChordRepresentation
  /** Zero-based language index in the song. */
  language?: number
  /** When true, emit Worship Pro features (durations, `&` lines, etc.). */
  worshipPro?: boolean
}

export type RenderA4HtmlOptions = {
  key?: string
  representation?: ChordRepresentation
  language?: number
  /** Scale factor for DIN-A4 layout (player/editor viewport height / 1123). */
  scale?: number
}

/** Structured song payload (`Song.data` / chordlib wire JSON). */
export type ChordSongData = Record<string, unknown>

/**
 * Port for ChordPro parse/format and DIN-A4 HTML preview.
 * Web implementation loads `@worshipviewer/chordlib-wasm` lazily.
 */
export interface ChordEngine {
  parseChordPro(source: string): ChordSongData
  parseUltimateGuitarHtml(html: string): ChordSongData
  formatChordPro(song: ChordSongData, options?: FormatChordProOptions): string
  renderA4Html(song: ChordSongData, options?: RenderA4HtmlOptions): { html: string; css: string }
  transpose(song: ChordSongData, key: string): ChordSongData
}

export class ChordEngineError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ChordEngineError'
  }
}
