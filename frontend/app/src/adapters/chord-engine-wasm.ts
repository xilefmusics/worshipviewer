import {
  ChordEngineError,
  type ChordEngine,
  type ChordSongData,
  type FormatChordProOptions,
  type RenderA4HtmlOptions,
} from '@/ports/chord-engine'

type WasmModule = typeof import('@worshipviewer/chordlib-wasm')

let wasmInit: Promise<WasmModule> | null = null

function loadWasmModule(): Promise<WasmModule> {
  wasmInit ??= (async () => {
    const mod = await import('@worshipviewer/chordlib-wasm')
    await mod.default()
    return mod
  })()
  return wasmInit
}

function parseSongJson(json: string): ChordSongData {
  return JSON.parse(json) as ChordSongData
}

function wrapWasmError<T>(fn: () => T): T {
  try {
    return fn()
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    throw new ChordEngineError(message)
  }
}

/** Reset cached WASM init (tests). */
export function resetWasmChordEngineCache(): void {
  wasmInit = null
}

export async function createWasmChordEngine(): Promise<ChordEngine> {
  const wasm = await loadWasmModule()

  return {
    parseChordPro(source: string) {
      return wrapWasmError(() => parseSongJson(wasm.parseChordPro(source)))
    },

    parseUltimateGuitarHtml(html: string) {
      return wrapWasmError(() => parseSongJson(wasm.parseUltimateGuitarHtml(html)))
    },

    formatChordPro(song: ChordSongData, options?: FormatChordProOptions) {
      const json = JSON.stringify(song)
      return wrapWasmError(() =>
        wasm.formatChordPro(
          json,
          options?.worshipPro ?? false,
          options?.key,
          options?.representation,
          options?.language,
        ),
      )
    },

    renderA4Html(song: ChordSongData, options?: RenderA4HtmlOptions) {
      const json = JSON.stringify(song)
      const page = wrapWasmError(() =>
        wasm.renderA4Html(
          json,
          options?.key,
          options?.representation,
          options?.language,
          options?.scale,
        ),
      )
      return { html: page.html, css: page.css }
    },

    renderA4SectionHtmls(song: ChordSongData, options?: RenderA4HtmlOptions) {
      const json = JSON.stringify(song)
      const page = wrapWasmError(() =>
        wasm.renderA4SectionHtmls(
          json,
          options?.key,
          options?.representation,
          options?.language,
          options?.scale,
        ),
      )
      return { sections: page.sections, css: page.css }
    },

    transpose(song: ChordSongData, key: string) {
      const json = JSON.stringify(song)
      return wrapWasmError(() => parseSongJson(wasm.transposeSong(json, key)))
    },
  }
}
