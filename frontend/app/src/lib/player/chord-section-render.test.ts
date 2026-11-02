import { describe, expect, it, vi } from 'vitest'

import {
  createChordSectionRenderService,
  type ChordSectionRenderRequest,
  type RenderedChordSections,
} from '@/lib/player/chord-section-render'
import type { ChordSongData } from '@/ports/chord-engine'

function request(overrides: Partial<ChordSectionRenderRequest> = {}): ChordSectionRenderRequest {
  return {
    songData: { titles: ['Test song'], sections: [] } as ChordSongData,
    representation: 'default',
    hideChords: false,
    expandSections: false,
    ...overrides,
  }
}

const rendered: RenderedChordSections = { sections: ['<p>Verse</p>'], css: '.verse {}' }

describe('Chord section render service', () => {
  it('deduplicates in-flight requests and reuses the completed render', async () => {
    let resolveRender: ((result: RenderedChordSections) => void) | undefined
    const renderInWorker = vi.fn(
      () => new Promise<RenderedChordSections>((resolve) => { resolveRender = resolve }),
    )
    const service = createChordSectionRenderService(renderInWorker, vi.fn())
    const input = request()

    const first = service.render(input)
    const second = service.render(input)
    resolveRender?.(rendered)

    await expect(first).resolves.toEqual(rendered)
    await expect(second).resolves.toEqual(rendered)
    await expect(service.render(input)).resolves.toEqual(rendered)
    expect(renderInWorker).toHaveBeenCalledTimes(1)
  })

  it('separates results when render settings change', async () => {
    const renderInWorker = vi.fn().mockResolvedValue(rendered)
    const service = createChordSectionRenderService(renderInWorker, vi.fn())
    const input = request()

    await service.render(input)
    await service.render({ ...input, key: 'G' })
    await service.render({ ...input, capo: 2 })
    await service.render({ ...input, language: 1 })
    await service.render({ ...input, representation: 'nashville' })
    await service.render({ ...input, hideChords: true })
    await service.render({ ...input, expandSections: true })
    await service.render({ ...input, flow: [{ title: 'Verse', occurrence_index: 0, repeats: 1 }] })
    await service.render({ ...input, flow: [{ title: 'Chorus', occurrence_index: 0, repeats: 1 }] })

    expect(renderInWorker).toHaveBeenCalledTimes(9)
  })

  it('forwards the capo fret to the renderer', async () => {
    const renderInWorker = vi.fn().mockResolvedValue(rendered)
    const service = createChordSectionRenderService(renderInWorker, vi.fn())

    await service.render(request({ key: 'A', capo: 2 }))

    expect(renderInWorker).toHaveBeenCalledWith(expect.objectContaining({ key: 'A', capo: 2 }))
  })

  it('evicts least recently used completed entries at capacity', async () => {
    const renderInWorker = vi.fn().mockResolvedValue(rendered)
    const service = createChordSectionRenderService(renderInWorker, vi.fn(), 2)
    const first = request()
    const second = request({ songData: { sections: [{ title: 'Second' }] } })
    const third = request({ songData: { sections: [{ title: 'Third' }] } })

    await service.render(first)
    await service.render(second)
    await service.render(first)
    await service.render(third)
    await service.render(first)
    await service.render(second)

    expect(renderInWorker).toHaveBeenCalledTimes(4)
  })

  it('falls back to the main-thread renderer after a worker failure', async () => {
    const renderInWorker = vi.fn().mockRejectedValue(new Error('worker unavailable'))
    const renderFallback = vi.fn().mockResolvedValue(rendered)
    const service = createChordSectionRenderService(renderInWorker, renderFallback)

    await expect(service.render(request())).resolves.toEqual(rendered)
    expect(renderInWorker).toHaveBeenCalledTimes(1)
    expect(renderFallback).toHaveBeenCalledTimes(1)
  })

  it('does not cache failed renders, so a later request can retry', async () => {
    const renderInWorker = vi.fn().mockRejectedValue(new Error('worker unavailable'))
    const renderFallback = vi
      .fn()
      .mockRejectedValueOnce(new Error('temporary renderer failure'))
      .mockResolvedValue(rendered)
    const service = createChordSectionRenderService(renderInWorker, renderFallback)
    const input = request()

    await expect(service.render(input)).rejects.toThrow('temporary renderer failure')
    await expect(service.render(input)).resolves.toEqual(rendered)
    expect(renderFallback).toHaveBeenCalledTimes(2)
  })
})
