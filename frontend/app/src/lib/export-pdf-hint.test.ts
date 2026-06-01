import { describe, expect, it, vi } from 'vitest'

import { exportPdfHintTitle } from '@/lib/export-pdf-hint'

describe('exportPdfHintTitle', () => {
  it('returns base hint only on non-Safari platforms', () => {
    vi.stubGlobal('navigator', {
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      platform: 'MacIntel',
      maxTouchPoints: 0,
    })
    expect(exportPdfHintTitle('Base.', 'Safari extra.')).toBe('Base.')
    vi.unstubAllGlobals()
  })

  it('appends Safari headers hint on iPhone', () => {
    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
      platform: 'iPhone',
      maxTouchPoints: 5,
    })
    expect(exportPdfHintTitle('Base.', 'Safari extra.')).toBe('Base. Safari extra.')
    vi.unstubAllGlobals()
  })
})
