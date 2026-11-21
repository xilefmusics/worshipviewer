export type DesktopInstallerPlatform = 'macos' | 'windows' | 'linux'

type InstallerNavigator = Pick<Navigator, 'maxTouchPoints' | 'platform' | 'userAgent'> & {
  userAgentData?: {
    architecture?: string
    platform?: string
  }
}

/** Detect only desktop platforms for which the current release workflow ships installers. */
export function detectDesktopInstallerPlatform(
  nav: InstallerNavigator | undefined = globalThis.navigator,
): DesktopInstallerPlatform | null {
  if (!nav) return null

  const userAgent = nav.userAgent ?? ''
  const platform = nav.userAgentData?.platform || nav.platform || ''
  const architecture = nav.userAgentData?.architecture ?? ''

  if (
    /(Android|iPad|iPhone|iPod|Mobile)/i.test(userAgent) ||
    (platform === 'MacIntel' && nav.maxTouchPoints > 1)
  ) {
    return null
  }

  if (/Mac/i.test(platform) || /Macintosh|Mac OS X/i.test(userAgent)) {
    return 'macos'
  }

  if (/Win/i.test(platform) || /Windows/i.test(userAgent)) {
    return /(?:x64|x86_64|Win64|WOW64)/i.test(`${architecture} ${userAgent}`)
      ? 'windows'
      : null
  }

  if (/Linux/i.test(platform) || /Linux/i.test(userAgent)) {
    if (/Android/i.test(userAgent)) return null
    return /(?:x64|x86_64|amd64)/i.test(`${architecture} ${platform} ${userAgent}`)
      ? 'linux'
      : null
  }

  return null
}
