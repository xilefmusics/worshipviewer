import { scopeChordlibPageCss } from '@/lib/chord-page-css'
import { chordFormatToRepresentation, type ChordFormatPreference } from '@/lib/chord-format'
import { resolveSongDataKey } from '@/lib/setlist-song-links'
import { songEditorFormatOptions } from '@/lib/song-editor-state'
import type { ChordEngine, ChordSongData } from '@/ports/chord-engine'

export const MAX_IMPORT_FILE_BYTES = 2 * 1024 * 1024

/** File picker `accept` for ChordPro / Worship Pro import. */
export const SONG_IMPORT_FILE_ACCEPT =
  '.cp,.cho,.chopro,.chordpro,.wp,.wop,.worshippro,text/plain'

/** DIN-A4 layout width/height in CSS px (matches chordlib render at scale 1). */
const A4_WIDTH_PX = 794
const A4_HEIGHT_PX = 1123

export type TextExportFormat = 'chordpro' | 'worshippro'

export type ReadTextFileResult =
  | { ok: true; name: string; text: string }
  | { ok: false; name: string; error: string }

export type ParseImportResult =
  | { ok: true; data: ChordSongData }
  | { ok: false; error: string }

export type BatchImportCreated = { id: string; title: string }
export type BatchImportFailed = { name: string; error: string }

export type BatchImportResult = {
  created: BatchImportCreated[]
  failed: BatchImportFailed[]
}

export type CreateSongPostBody = {
  data: ChordSongData
  blobs: []
  not_a_song: false
  owner?: string
}

/** Safe download basename from song title (no extension). */
export function sanitizeDownloadBasename(title: string | undefined): string {
  const raw = (title ?? '').trim() || 'Untitled'
  const cleaned = raw
    .replace(/[/\\]/g, '-')
    .replace(/[?%*:|"<>]/g, ' ')
    .replace(/-+/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/^-+|-+$/g, '')
    .trim()
    .slice(0, 120)
  return cleaned || 'Untitled'
}

export function songTitleFromData(data: ChordSongData): string {
  const titles = Array.isArray(data.titles) ? data.titles : []
  const first = titles[0]
  return typeof first === 'string' && first.trim() ? first.trim() : 'Untitled'
}

export async function readTextFiles(files: FileList | File[]): Promise<ReadTextFileResult[]> {
  const list = Array.from(files)
  const out: ReadTextFileResult[] = []
  for (const file of list) {
    const name = file.name || 'file'
    if (file.size > MAX_IMPORT_FILE_BYTES) {
      out.push({ ok: false, name, error: 'File is too large.' })
      continue
    }
    try {
      const text = await file.text()
      out.push({ ok: true, name, text })
    } catch {
      out.push({ ok: false, name, error: 'Could not read file.' })
    }
  }
  return out
}

export function parseImportSource(engine: ChordEngine, text: string): ParseImportResult {
  try {
    const data = engine.parseChordPro(text)
    return { ok: true, data }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return { ok: false, error: message }
  }
}

export function createSongBodyFromParsed(
  data: ChordSongData,
  owner?: string,
): CreateSongPostBody {
  const body: CreateSongPostBody = {
    data,
    blobs: [],
    not_a_song: false,
  }
  if (owner) body.owner = owner
  return body
}

function formatOptionsForExport(
  worshipPro: boolean,
  chordFormat: ChordFormatPreference,
  data: ChordSongData,
) {
  const key = resolveSongDataKey(data as Record<string, unknown>) ?? undefined
  return {
    worshipPro,
    key,
    representation: chordFormatToRepresentation(chordFormat),
  }
}

export function formatSongForExport(
  engine: ChordEngine,
  data: ChordSongData,
  format: TextExportFormat,
  chordFormat: ChordFormatPreference,
): string {
  const worshipPro = format === 'worshippro'
  return engine.formatChordPro(
    data,
    formatOptionsForExport(worshipPro, chordFormat, data),
  )
}

export function downloadTextFile(filename: string, content: string, mime = 'text/plain;charset=utf-8') {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.rel = 'noopener'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

export function exportSongText(
  engine: ChordEngine,
  data: ChordSongData,
  format: TextExportFormat,
  chordFormat: ChordFormatPreference,
): void {
  const worshipPro = format === 'worshippro'
  const ext = worshipPro ? 'wp' : 'cp'
  const basename = sanitizeDownloadBasename(songTitleFromData(data))
  const text = formatSongForExport(engine, data, format, chordFormat)
  downloadTextFile(`${basename}.${ext}`, text)
}

const PDF_PAGE_BASE_CSS = `
.pdf-export-root {
  width: ${A4_WIDTH_PX}px;
  background: #fff;
  color: #000;
}
.pdf-export-root span,
.pdf-export-root h1,
.pdf-export-root h2,
.pdf-export-root h3,
.pdf-export-root p {
  color: inherit;
}
`

const PDF_PRINT_CSS = `
@page {
  size: A4 portrait;
  margin: 0;
}
@media print {
  html, body {
    margin: 0;
    padding: 0;
    background: #fff;
  }
}
`

/** Isolated hidden iframe (no app oklch theme) for print/PDF. */
function mountPdfExportPage(html: string, css: string, title: string): {
  frame: HTMLIFrameElement
  page: HTMLElement
  contentWindow: Window
} {
  const frame = document.createElement('iframe')
  frame.setAttribute('aria-hidden', 'true')
  frame.style.cssText = `position:fixed;left:-10000px;top:0;width:${A4_WIDTH_PX}px;height:${A4_HEIGHT_PX}px;border:0;visibility:hidden;`
  document.body.appendChild(frame)

  const doc = frame.contentDocument
  const contentWindow = frame.contentWindow
  if (!doc || !contentWindow) {
    frame.remove()
    throw new Error('Could not create export frame')
  }

  doc.open()
  doc.write('<!DOCTYPE html><html><head></head><body></body></html>')
  doc.close()

  doc.title = title
  const titleEl = doc.createElement('title')
  titleEl.textContent = title
  doc.head.appendChild(titleEl)

  const styleEl = doc.createElement('style')
  styleEl.textContent = `${PDF_PAGE_BASE_CSS}\n${scopeChordlibPageCss(css, '.pdf-export-root')}\n${PDF_PRINT_CSS}\nhtml, body { margin: 0; padding: 0; background: #fff; color: #000; }`
  doc.head.appendChild(styleEl)

  const page = doc.createElement('div')
  page.className = 'pdf-export-root player-chords-page'
  page.innerHTML = html
  doc.body.appendChild(page)

  return { frame, page, contentWindow }
}

async function waitForPdfLayout(page: HTMLElement): Promise<void> {
  await document.fonts.ready
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
  })
  void page.getBoundingClientRect()
}

/**
 * Opens the system print dialog on an isolated A4 preview (use Save as PDF for a file).
 * Real text remains selectable in the PDF the browser generates.
 */
export async function exportSongPdf(
  engine: ChordEngine,
  data: ChordSongData,
  chordFormat: ChordFormatPreference,
): Promise<void> {
  const key = resolveSongDataKey(data as Record<string, unknown>) ?? undefined
  const { html, css } = engine.renderA4Html(data, {
    key,
    representation: chordFormatToRepresentation(chordFormat),
    scale: 1,
  })

  const title = sanitizeDownloadBasename(songTitleFromData(data))
  const previousTitle = document.title

  const { frame, page, contentWindow } = mountPdfExportPage(html, css, title)

  let frameRemoved = false
  const removeFrame = () => {
    if (frameRemoved) return
    frameRemoved = true
    frame.remove()
  }

  let titleRestored = false
  const restoreAppTitle = () => {
    if (titleRestored) return
    titleRestored = true
    document.title = previousTitle
  }

  contentWindow.addEventListener('afterprint', removeFrame, { once: true })
  window.setTimeout(removeFrame, 300_000)
  window.addEventListener('focus', restoreAppTitle, { once: true })
  window.setTimeout(restoreAppTitle, 300_000)

  try {
    await waitForPdfLayout(page)
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          try {
            contentWindow.document.title = title
            document.title = title
            contentWindow.focus()
            contentWindow.print()
          } catch {
            removeFrame()
            restoreAppTitle()
          }
          resolve()
        })
      })
    })
  } catch (e) {
    removeFrame()
    restoreAppTitle()
    throw e
  }
}

/** Re-export for editor formatting consistency when applying import to source buffer. */
export function formatImportedSource(
  engine: ChordEngine,
  data: ChordSongData,
  chordFormat: ChordFormatPreference,
): string {
  return engine.formatChordPro(data, songEditorFormatOptions(chordFormat, data))
}

export async function importSongsBatch(args: {
  files: FileList | File[]
  engine: ChordEngine
  owner?: string
  postSong: (body: CreateSongPostBody) => Promise<{ id: string }>
}): Promise<BatchImportResult> {
  const created: BatchImportCreated[] = []
  const failed: BatchImportFailed[] = []

  const reads = await readTextFiles(args.files)
  for (const item of reads) {
    if (!item.ok) {
      failed.push({ name: item.name, error: item.error })
      continue
    }
    const parsed = parseImportSource(args.engine, item.text)
    if (!parsed.ok) {
      failed.push({ name: item.name, error: parsed.error })
      continue
    }
    const title = songTitleFromData(parsed.data)
    try {
      const body = createSongBodyFromParsed(parsed.data, args.owner)
      const song = await args.postSong(body)
      created.push({ id: song.id, title })
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      failed.push({ name: item.name, error: message })
    }
  }

  return { created, failed }
}
