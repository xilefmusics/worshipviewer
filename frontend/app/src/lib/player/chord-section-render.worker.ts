import { createWasmChordEngine } from '../../adapters/chord-engine-wasm'
import type { ChordSectionRenderRequest, RenderedChordSections } from './chord-section-render'

type WorkerRequest = {
  id: number
  request: Omit<ChordSectionRenderRequest, 'hideChords'>
}

type WorkerResponse =
  | { id: number; ok: true; result: RenderedChordSections }
  | { id: number; ok: false; error: string }

let enginePromise: ReturnType<typeof createWasmChordEngine> | null = null

function getEngine(): ReturnType<typeof createWasmChordEngine> {
  if (!enginePromise) {
    const retryablePromise = createWasmChordEngine().catch((error: unknown) => {
      enginePromise = null
      throw error
    })
    enginePromise = retryablePromise
  }
  return enginePromise
}

function render(request: WorkerRequest['request']): Promise<RenderedChordSections> {
  return getEngine().then((engine) => {
    let songData = request.songData
    if (request.flow?.length) {
      try {
        songData = engine.applyFlow(songData, [...request.flow])
      } catch {
        // Preserve player behavior by rendering source order if a custom flow is invalid.
      }
    }
    if (request.expandSections) {
      songData = engine.fillSectionReferences(songData)
    }
    return engine.renderA4SectionHtmls(songData, {
      key: request.key ?? undefined,
      capo: request.capo ?? undefined,
      language: request.language ?? undefined,
      representation: request.representation,
    })
  })
}

self.addEventListener('message', (event) => {
  const { id, request } = (event as MessageEvent<WorkerRequest>).data
  void render(request).then(
    (result) => {
      const response: WorkerResponse = { id, ok: true, result }
      self.postMessage(response)
    },
    (error: unknown) => {
      const response: WorkerResponse = {
        id,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      }
      self.postMessage(response)
    },
  )
})
