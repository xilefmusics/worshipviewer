import { describe, expect, it, vi } from 'vitest'

import {
  detectKeyboardShortcutPlatform,
  isIosOrIpadosDevice,
  isMacDesktopSafari,
  needsSafariPdfPrintHint,
} from '@/lib/platform'

describe('platform detection', () => {
  it('selects macOS shortcuts on Mac desktops', () => {
    expect(
      detectKeyboardShortcutPlatform({
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
        platform: 'MacIntel',
        maxTouchPoints: 0,
      }),
    ).toBe('mac')
  })

  it('selects Windows/Linux shortcuts on Windows desktops', () => {
    expect(
      detectKeyboardShortcutPlatform({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        platform: 'Win32',
        maxTouchPoints: 0,
      }),
    ).toBe('windows-linux')
  })

  it('treats iPadOS desktop mode and Android as mobile', () => {
    expect(
      detectKeyboardShortcutPlatform({
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)',
        platform: 'MacIntel',
        maxTouchPoints: 5,
      }),
    ).toBe('mobile')
    expect(
      detectKeyboardShortcutPlatform({
        userAgent: 'Mozilla/5.0 (Linux; Android 15; Pixel 9) Mobile',
        platform: 'Linux armv8l',
        maxTouchPoints: 5,
        userAgentData: { mobile: true, platform: 'Android' },
      }),
    ).toBe('mobile')
  })

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
