import JSZip from 'jszip'

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
  collection: string
  data: ChordSongData
  blobs: []
  not_a_song: false
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
  collection: string,
): CreateSongPostBody {
  return {
    collection,
    data,
    blobs: [],
    not_a_song: false,
  }
}

export function formatSongForExport(
  engine: ChordEngine,
  data: ChordSongData,
  format: TextExportFormat,
  chordFormat: ChordFormatPreference,
  keyOverride?: string,
): string {
  const worshipPro = format === 'worshippro'
  const key =
    keyOverride ?? resolveSongDataKey(data as Record<string, unknown>) ?? undefined
  return engine.formatChordPro(data, {
    worshipPro,
    key,
    representation: chordFormatToRepresentation(chordFormat),
  })
}

export function orderedSongZipEntryNames(
  songs: { data: ChordSongData }[],
  format: TextExportFormat,
): string[] {
  const ext = format === 'worshippro' ? 'wp' : 'cp'
  return songs.map((song, index) => {
    const base = sanitizeDownloadBasename(songTitleFromData(song.data))
    const num = String(index + 1).padStart(2, '0')
    return `${num} - ${base}.${ext}`
  })
}

export function downloadBlobFile(filename: string, blob: Blob) {
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

/** Print overrides for chordlib fixed-height screen layout (exported for tests). */
export function buildPdfPrintCss(pageCount = 1): string {
  const pageRules = Array.from({ length: pageCount }, (_, index) => {
    const host = `.pdf-export-root:nth-of-type(${index + 1})`
    return `${host} .page {
    width: 210mm;
    height: auto;
    min-height: 0;
    overflow: visible;
    transform: none;
  }
  ${host} .columns {
    height: auto;
    overflow: visible;
  }`
  }).join('\n  ')

  return `
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
  ${pageRules}
}
`
}

const PDF_SETLIST_PAGE_BREAK_CSS = `
.pdf-export-root + .pdf-export-root {
  page-break-before: always;
  break-before: page;
}
`

export type PdfExportPage = { html: string; css: string }

/** Isolated hidden iframe (no app oklch theme) for print/PDF. */
function mountPdfExportDocument(pages: PdfExportPage[], title: string): {
  frame: HTMLIFrameElement
  pageRoots: HTMLElement[]
  contentWindow: Window
} {
  if (pages.length === 0) {
    throw new Error('No pages to print')
  }

  const frame = document.createElement('iframe')
  frame.setAttribute('aria-hidden', 'true')
  frame.style.cssText = `position:fixed;left:0;top:0;width:${A4_WIDTH_PX}px;height:${A4_HEIGHT_PX}px;border:0;opacity:0;pointer-events:none;z-index:-1;`
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

  const scopedCss = pages
    .map((page, index) =>
      scopeChordlibPageCss(page.css, `.pdf-export-root:nth-of-type(${index + 1})`),
    )
    .join('\n')
  const pageBreakCss = pages.length > 1 ? PDF_SETLIST_PAGE_BREAK_CSS : ''

  const styleEl = doc.createElement('style')
  styleEl.textContent = `${PDF_PAGE_BASE_CSS}\n${scopedCss}\n${buildPdfPrintCss(pages.length)}\n${pageBreakCss}\nhtml, body { margin: 0; padding: 0; background: #fff; color: #000; }`
  doc.head.appendChild(styleEl)

  const pageRoots: HTMLElement[] = []
  for (const page of pages) {
    const root = doc.createElement('div')
    root.className = 'pdf-export-root player-chords-page'
    root.innerHTML = page.html
    doc.body.appendChild(root)
    pageRoots.push(root)
  }

  return { frame, pageRoots, contentWindow }
}

async function waitForPdfLayout(doc: Document, pageRoots: HTMLElement[]): Promise<void> {
  if (doc.fonts?.ready) {
    await doc.fonts.ready
  }
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
  })
  for (const page of pageRoots) {
    void page.getBoundingClientRect()
  }
}

async function printPdfDocument(pages: PdfExportPage[], title: string): Promise<void> {
  const previousTitle = document.title
  const { frame, pageRoots, contentWindow } = mountPdfExportDocument(pages, title)

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
    await waitForPdfLayout(contentWindow.document, pageRoots)
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

function renderA4ExportPage(
  engine: ChordEngine,
  data: ChordSongData,
  key: string | undefined,
  chordFormat: ChordFormatPreference,
): PdfExportPage {
  return engine.renderA4Html(data, {
    key,
    representation: chordFormatToRepresentation(chordFormat),
    scale: 1,
  })
}

export type HubExportSong = {
  data: ChordSongData
  key?: string
}

/** @deprecated Use {@link HubExportSong}. */
export type SetlistPdfExportSong = HubExportSong

export async function exportOrderedSongsZip(
  engine: ChordEngine,
  listTitle: string,
  songs: HubExportSong[],
  format: TextExportFormat,
  chordFormat: ChordFormatPreference,
): Promise<void> {
  if (songs.length === 0) {
    throw new Error('No exportable songs')
  }
  const zip = new JSZip()
  const entryNames = orderedSongZipEntryNames(songs, format)
  songs.forEach((song, index) => {
    const text = formatSongForExport(engine, song.data, format, chordFormat, song.key)
    zip.file(entryNames[index]!, text)
  })
  const blob = await zip.generateAsync({ type: 'blob' })
  const zipBasename = sanitizeDownloadBasename(listTitle)
  downloadBlobFile(`${zipBasename}.zip`, blob)
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
  const pages = [renderA4ExportPage(engine, data, key, chordFormat)]
  const title = sanitizeDownloadBasename(songTitleFromData(data))
  await printPdfDocument(pages, title)
}

/**
 * Print every song in list order as consecutive A4 pages in one PDF (browser print).
 * Used for setlist and collection export.
 */
export async function exportSetlistPdf(
  engine: ChordEngine,
  setlistTitle: string,
  songs: HubExportSong[],
  chordFormat: ChordFormatPreference,
): Promise<void> {
  if (songs.length === 0) {
    throw new Error('No exportable songs')
  }
  const pages = songs.map((song) =>
    renderA4ExportPage(engine, song.data, song.key, chordFormat),
  )
  const title = sanitizeDownloadBasename(setlistTitle)
  await printPdfDocument(pages, title)
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
  collection: string
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
      const body = createSongBodyFromParsed(parsed.data, args.collection)
      const song = await args.postSong(body)
      created.push({ id: song.id, title })
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      failed.push({ name: item.name, error: message })
    }
  }

  return { created, failed }
}
