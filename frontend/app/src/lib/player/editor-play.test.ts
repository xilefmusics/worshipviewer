import { describe, expect, it, vi, beforeEach } from 'vitest'

import { runEditorPlay } from '@/lib/player/editor-play'

describe('runEditorPlay', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('navigates after successful flush', async () => {
    const navigate = vi.fn()
    const flushNow = vi.fn(async () => true)

    const ok = await runEditorPlay({
      canPlay: true,
      needsFlush: true,
      flushNow,
      navigate,
    })

    expect(ok).toBe(true)
    expect(flushNow).toHaveBeenCalled()
    expect(navigate).toHaveBeenCalled()
  })

  it('does not navigate when flush fails', async () => {
    const navigate = vi.fn()
    const flushNow = vi.fn(async () => false)

    const ok = await runEditorPlay({
      canPlay: true,
      needsFlush: true,
      flushNow,
      navigate,
    })

    expect(ok).toBe(false)
    expect(navigate).not.toHaveBeenCalled()
  })

  it('skips flush for read-only play', async () => {
    const navigate = vi.fn()
    const flushNow = vi.fn(async () => false)

    const ok = await runEditorPlay({
      canPlay: true,
      needsFlush: false,
      flushNow,
      navigate,
    })

    expect(ok).toBe(true)
    expect(flushNow).not.toHaveBeenCalled()
    expect(navigate).toHaveBeenCalled()
  })
})
