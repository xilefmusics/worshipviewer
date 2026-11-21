import { describe, expect, it, vi } from 'vitest'

import {
  detectOperatingSystem,
  detectKeyboardShortcutPlatform,
  isAndroidChrome,
  isAndroidDevice,
  isAndroidFirefox,
  isIosOrIpadosDevice,
  isMacDesktopSafari,
  needsSafariPdfPrintHint,
} from '@/lib/platform'

describe('operating system detection', () => {
  it.each([
    [
      'macOS',
      {
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
        platform: 'MacIntel',
        maxTouchPoints: 0,
      },
      'macos',
    ],
    [
      'Windows',
      {
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        platform: 'Win32',
        maxTouchPoints: 0,
      },
      'windows',
    ],
    [
      'Linux',
      {
        userAgent: 'Mozilla/5.0 (X11; Linux x86_64)',
        platform: 'Linux x86_64',
        maxTouchPoints: 0,
      },
      'linux',
    ],
    [
      'Android',
      {
        userAgent: 'Mozilla/5.0 (Linux; Android 15; Pixel 9) Mobile',
        platform: 'Linux armv8l',
        maxTouchPoints: 5,
        userAgentData: { mobile: true, platform: 'Android' },
      },
      'android',
    ],
    [
      'iPhone',
      {
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
        platform: 'iPhone',
        maxTouchPoints: 5,
      },
      'ios',
    ],
    [
      'iPadOS desktop mode',
      {
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)',
        platform: 'MacIntel',
        maxTouchPoints: 5,
      },
      'ios',
    ],
    [
      'ChromeOS',
      {
        userAgent: 'Mozilla/5.0 (X11; CrOS x86_64 16000.0.0)',
        platform: 'Linux x86_64',
        maxTouchPoints: 0,
      },
      'chromeos',
    ],
    [
      'unknown',
      { userAgent: 'ExampleBrowser/1.0', platform: 'ExampleOS', maxTouchPoints: 0 },
      'unknown',
    ],
  ] as const)('detects %s', (_label, nav, expected) => {
    expect(detectOperatingSystem(nav)).toBe(expected)
  })

  it('returns unknown when navigator information is unavailable', () => {
    vi.stubGlobal('navigator', undefined)
    expect(detectOperatingSystem()).toBe('unknown')
    vi.unstubAllGlobals()
  })
})

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
    expect(isAndroidChrome()).toBe(false)
    expect(needsSafariPdfPrintHint()).toBe(false)
    vi.unstubAllGlobals()
  })

  it('detects Chrome on Android and not Edge or Samsung Internet', () => {
    vi.stubGlobal('navigator', {
      userAgent:
        'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.144 Mobile Safari/537.36',
      platform: 'Linux armv8l',
      maxTouchPoints: 5,
    })
    expect(isAndroidDevice()).toBe(true)
    expect(isAndroidChrome()).toBe(true)
    expect(isAndroidFirefox()).toBe(false)
    vi.unstubAllGlobals()

    vi.stubGlobal('navigator', {
      userAgent:
        'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36 EdgA/120.0.0.0',
      platform: 'Linux armv8l',
      maxTouchPoints: 5,
    })
    expect(isAndroidChrome()).toBe(false)
    vi.unstubAllGlobals()

    vi.stubGlobal('navigator', {
      userAgent:
        'Mozilla/5.0 (Linux; Android 14; SAMSUNG SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/23.0 Chrome/110.0.5481.154 Mobile Safari/537.36',
      platform: 'Linux armv8l',
      maxTouchPoints: 5,
    })
    expect(isAndroidChrome()).toBe(false)
    vi.unstubAllGlobals()
  })

  it('detects Firefox on Android and not Chrome on iOS', () => {
    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 (Android 14; Mobile; rv:123.0) Gecko/123.0 Firefox/123.0',
      platform: 'Linux armv8l',
      maxTouchPoints: 5,
    })
    expect(isAndroidDevice()).toBe(true)
    expect(isAndroidFirefox()).toBe(true)
    expect(isAndroidChrome()).toBe(false)
    vi.unstubAllGlobals()

    vi.stubGlobal('navigator', {
      userAgent:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0.6099.119 Mobile/15E148 Safari/604.1',
      platform: 'iPhone',
      maxTouchPoints: 5,
    })
    expect(isAndroidDevice()).toBe(false)
    expect(isAndroidChrome()).toBe(false)
    expect(isIosOrIpadosDevice()).toBe(true)
    vi.unstubAllGlobals()
  })
})
