import { describe, expect, it, vi } from 'vitest'

import { isIosOrIpadosDevice, isMacDesktopSafari, needsSafariPdfPrintHint } from '@/lib/platform'

describe('platform detection', () => {
  it('needsSafariPdfPrintHint is true when iOS or Mac Safari', () => {
    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
      platform: 'iPhone',
      maxTouchPoints: 5,
    })
    expect(isIosOrIpadosDevice()).toBe(true)
    expect(needsSafariPdfPrintHint()).toBe(true)
    vi.unstubAllGlobals()
  })

  it('needsSafariPdfPrintHint is false for Chrome on Mac', () => {
    vi.stubGlobal('navigator', {
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      platform: 'MacIntel',
      maxTouchPoints: 0,
    })
    expect(isIosOrIpadosDevice()).toBe(false)
    expect(isMacDesktopSafari()).toBe(false)
    expect(needsSafariPdfPrintHint()).toBe(false)
    vi.unstubAllGlobals()
  })
})
