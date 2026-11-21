import { describe, expect, it } from 'vitest'

import { detectDesktopInstallerPlatform } from '@/lib/installer-platform'

describe('detectDesktopInstallerPlatform', () => {
  it('matches supported desktop operating systems and architectures', () => {
    expect(
      detectDesktopInstallerPlatform({
        platform: 'MacIntel',
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
        maxTouchPoints: 0,
      }),
    ).toBe('macos')
    expect(
      detectDesktopInstallerPlatform({
        platform: 'Win32',
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        maxTouchPoints: 0,
      }),
    ).toBe('windows')
    expect(
      detectDesktopInstallerPlatform({
        platform: 'Linux x86_64',
        userAgent: 'Mozilla/5.0 (X11; Linux x86_64)',
        maxTouchPoints: 0,
      }),
    ).toBe('linux')
  })

  it('does not offer desktop installers on mobile or unsupported architectures', () => {
    expect(
      detectDesktopInstallerPlatform({
        platform: 'MacIntel',
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)',
        maxTouchPoints: 5,
      }),
    ).toBeNull()
    expect(
      detectDesktopInstallerPlatform({
        platform: 'Linux armv8l',
        userAgent: 'Mozilla/5.0 (X11; Linux armv8l)',
        maxTouchPoints: 0,
      }),
    ).toBeNull()
    expect(
      detectDesktopInstallerPlatform({
        platform: 'Linux armv8l',
        userAgent: 'Mozilla/5.0 (Linux; Android 15; Pixel 9) Mobile',
        maxTouchPoints: 5,
      }),
    ).toBeNull()
  })
})
