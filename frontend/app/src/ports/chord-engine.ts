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

/** One entry in a song section flow (`chordlib::types::SongFlowItem`). */
export type SongFlowItem = {
  title: string
  occurrence_index?: number
  repeats?: number
}

/**
 * Port for ChordPro parse/format and DIN-A4 HTML preview.
 * Web implementation loads `@worshipviewer/chordlib-wasm` lazily.
 */
export interface ChordEngine {
  parseChordPro(source: string): ChordSongData
  parseUltimateGuitarHtml(html: string): ChordSongData
  formatChordPro(song: ChordSongData, options?: FormatChordProOptions): string
  renderA4Html(song: ChordSongData, options?: RenderA4HtmlOptions): { html: string; css: string }
  renderA4SectionHtmls(
    song: ChordSongData,
    options?: RenderA4HtmlOptions,
  ): { sections: string[]; css: string }
  transpose(song: ChordSongData, key: string): ChordSongData
  /** Copy lyric bodies into empty repeat/reference sections (`Song::fill_section_references`). */
  fillSectionReferences(song: ChordSongData): ChordSongData
  /** Distinct section items in first-seen order (`Song::flow_items`). */
  flowItems(song: ChordSongData): SongFlowItem[]
  /** Default section flow including repeats (`Song::custom_flow`). */
  customFlow(song: ChordSongData): SongFlowItem[]
  /** Reorder and repeat sections to match a custom flow (`Song::apply_flow`). */
  applyFlow(song: ChordSongData, flow: SongFlowItem[]): ChordSongData
}

export class ChordEngineError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ChordEngineError'
  }
}
