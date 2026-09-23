import { getChordEngine } from '@/lib/chord-engine'
import { stripChordsFromChordlibHtml } from '@/lib/strip-chords-from-html'
import type { ChordRepresentation, ChordSongData, SongFlowItem } from '@/ports/chord-engine'

export type ChordSectionRenderRequest = {
  songData: ChordSongData
  flow?: readonly SongFlowItem[] | null
  key?: string | null
  language?: number | null
  representation: ChordRepresentation
  hideChords: boolean
  expandSections: boolean
}

export type RenderedChordSections = {
  sections: string[]
  css: string
}

type WorkerRenderRequest = Omit<ChordSectionRenderRequest, 'hideChords'>
type RenderFunction = (request: WorkerRenderRequest) => Promise<RenderedChordSections>

const DEFAULT_CACHE_CAPACITY = 8

function renderRequestWithoutPresentationOptions(
  request: ChordSectionRenderRequest,
): WorkerRenderRequest {
  return {
    songData: request.songData,
    flow: request.flow,
    key: request.key,
    language: request.language,
    representation: request.representation,
    expandSections: request.expandSections,
  }
}

function renderOnMainThread(request: WorkerRenderRequest): Promise<RenderedChordSections> {
  return getChordEngine().then((engine) => {
    let songData = request.songData
    if (request.flow?.length) {
      try {
        songData = engine.applyFlow(structuredClone(songData), [...request.flow])
      } catch {
        // Match the existing player behavior: an invalid custom flow falls back to source order.
      }
    }
    if (request.expandSections) {
      songData = engine.fillSectionReferences(songData)
    }
    return engine.renderA4SectionHtmls(songData, {
      key: request.key ?? undefined,
      language: request.language ?? undefined,
      representation: request.representation,
    })
  })
}

function createWorkerRenderer(): RenderFunction {
  let worker: Worker | null = null
  let workerUnavailable = false
  let requestId = 0
  const pending = new Map<
    number,
    { resolve: (result: RenderedChordSections) => void; reject: (error: Error) => void }
  >()

  function rejectPending(error: Error) {
    for (const job of pending.values()) job.reject(error)
    pending.clear()
  }

  function ensureWorker(): Worker {
    if (workerUnavailable || typeof Worker === 'undefined') {
      workerUnavailable = true
      throw new Error('Chord rendering worker is unavailable')
    }
    if (worker) return worker

    const nextWorker = new Worker(new URL('./chord-section-render.worker.ts', import.meta.url), {
      type: 'module',
    })
    worker = nextWorker
    nextWorker.addEventListener('message', (event: MessageEvent<WorkerResponse>) => {
      const job = pending.get(event.data.id)
      if (!job) return
      pending.delete(event.data.id)
      if (event.data.ok) job.resolve(event.data.result)
      else job.reject(new Error(event.data.error))
    })
    const failWorker = (message: string) => {
      nextWorker.terminate()
      if (worker === nextWorker) worker = null
      workerUnavailable = true
      rejectPending(new Error(message))
    }
    nextWorker.addEventListener('error', (event) => {
      event.preventDefault()
      failWorker(event.message || 'Chord rendering worker failed')
    })
    nextWorker.addEventListener('messageerror', () => {
      failWorker('Chord rendering worker returned an unreadable response')
    })
    return nextWorker
  }

  return (request) => {
    let activeWorker: Worker
    try {
      activeWorker = ensureWorker()
    } catch (error) {
      return Promise.reject(error)
    }

    const id = ++requestId
    return new Promise<RenderedChordSections>((resolve, reject) => {
      pending.set(id, { resolve, reject })
      try {
        activeWorker.postMessage({ id, request })
      } catch (error) {
        pending.delete(id)
        reject(error instanceof Error ? error : new Error(String(error)))
      }
    })
  }
}

type WorkerResponse =
  | { id: number; ok: true; result: RenderedChordSections }
  | { id: number; ok: false; error: string }

function finalizeRender(
  request: ChordSectionRenderRequest,
  rendered: RenderedChordSections,
): RenderedChordSections {
  return request.hideChords
    ? { ...rendered, sections: rendered.sections.map(stripChordsFromChordlibHtml) }
    : rendered
}

export function createChordSectionRenderService(
  renderInWorker: RenderFunction,
  renderFallback: RenderFunction,
  capacity = DEFAULT_CACHE_CAPACITY,
) {
  const completed = new Map<string, RenderedChordSections>()
  const inFlight = new Map<string, Promise<RenderedChordSections>>()
  const objectIds = new WeakMap<object, number>()
  let nextObjectId = 0

  function objectId(value: object | null | undefined): number {
    if (!value) return 0
    const existing = objectIds.get(value)
    if (existing != null) return existing
    const id = ++nextObjectId
    objectIds.set(value, id)
    return id
  }

  function keyFor(request: ChordSectionRenderRequest): string {
    return JSON.stringify([
      objectId(request.songData),
      request.flow?.length ? objectId(request.flow) : 0,
      request.key ?? null,
      request.language ?? null,
      request.representation,
      request.hideChords,
      request.expandSections,
    ])
  }

  function getCached(request: ChordSectionRenderRequest): RenderedChordSections | undefined {
    const key = keyFor(request)
    const result = completed.get(key)
    if (!result) return undefined
    completed.delete(key)
    completed.set(key, result)
    return result
  }

  function render(request: ChordSectionRenderRequest): Promise<RenderedChordSections> {
    const key = keyFor(request)
    const cached = getCached(request)
    if (cached) return Promise.resolve(cached)
    const existing = inFlight.get(key)
    if (existing) return existing

    const workerRequest = renderRequestWithoutPresentationOptions(request)
    const job = (async () => {
      let rendered: RenderedChordSections
      try {
        rendered = await renderInWorker(workerRequest)
      } catch {
        rendered = await renderFallback(workerRequest)
      }
      const result = finalizeRender(request, rendered)
      completed.delete(key)
      completed.set(key, result)
      while (completed.size > Math.max(0, capacity)) {
        const oldestKey = completed.keys().next().value
        if (oldestKey == null) break
        completed.delete(oldestKey)
      }
      return result
    })()
    inFlight.set(key, job)
    void job.finally(() => inFlight.delete(key)).catch(() => undefined)
    return job
  }

  return { getCached, render, keyFor }
}

const chordSectionRenderService = createChordSectionRenderService(
  createWorkerRenderer(),
  renderOnMainThread,
)

export function getCachedChordSections(
  request: ChordSectionRenderRequest,
): RenderedChordSections | undefined {
  return chordSectionRenderService.getCached(request)
}

export function chordSectionRenderKey(request: ChordSectionRenderRequest): string {
  return chordSectionRenderService.keyFor(request)
}

export function renderChordSections(
  request: ChordSectionRenderRequest,
): Promise<RenderedChordSections> {
  return chordSectionRenderService.render(request)
}
