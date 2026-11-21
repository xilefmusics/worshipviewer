export type KeyboardShortcutPlatform = 'mac' | 'windows-linux' | 'mobile'

type NavigatorPlatformInfo = Pick<Navigator, 'maxTouchPoints' | 'platform' | 'userAgent'> & {
  standalone?: boolean
  userAgentData?: {
    mobile?: boolean
    platform?: string
  }
}

export type OperatingSystem =
  | 'android'
  | 'chromeos'
  | 'ios'
  | 'linux'
  | 'macos'
  | 'unknown'
  | 'windows'

/** Detect the operating system family from browser and WebView platform information. */
export function detectOperatingSystem(
  nav: NavigatorPlatformInfo | undefined = globalThis.navigator,
): OperatingSystem {
  if (!nav) return 'unknown'

  const userAgent = nav.userAgent ?? ''
  const platform = nav.userAgentData?.platform || nav.platform || ''
  const combined = `${platform} ${userAgent}`

  if (
    /iPhone|iPad|iPod/i.test(userAgent) ||
    (nav.platform === 'MacIntel' && nav.maxTouchPoints > 1) ||
    nav.standalone === true
  ) {
    return 'ios'
  }
  if (/Android/i.test(combined)) return 'android'
  if (/CrOS|Chrome OS/i.test(combined)) return 'chromeos'
  if (/Windows|Win32|Win64/i.test(combined)) return 'windows'
  if (/Macintosh|Mac OS X|MacIntel|macOS/i.test(combined)) return 'macos'
  if (/Linux|X11/i.test(combined)) return 'linux'
  return 'unknown'
}

/** Detect the shortcut family to present, including iPadOS desktop-mode user agents. */
export function detectKeyboardShortcutPlatform(
  nav: NavigatorPlatformInfo | undefined = globalThis.navigator,
): KeyboardShortcutPlatform {
  if (!nav) return 'windows-linux'

  const ua = nav.userAgent ?? ''
  const platform = nav.userAgentData?.platform || nav.platform || ''
  const mobile =
    nav.userAgentData?.mobile === true ||
    /(Android|iPad|iPhone|iPod|Mobile)/i.test(ua) ||
    (platform === 'MacIntel' && nav.maxTouchPoints > 1)

  if (mobile) return 'mobile'
  if (/Mac/i.test(platform) || /Macintosh|Mac OS X/i.test(ua)) return 'mac'
  return 'windows-linux'
}

/**
 * iPhone / iPod / iPad (incl. iPadOS 13+ “desktop” UA) / iOS WebKit (`standalone` exists).
 * Safari on macOS does not expose `navigator.standalone`.
 */
export function isIosOrIpadosDevice(): boolean {
  if (typeof globalThis.navigator === 'undefined') {
    return false
  }
  const nav = globalThis.navigator
  const ua = nav.userAgent
  if (/(iPad|iPhone|iPod)/.test(ua)) {
    return true
  }
  // iPad (incl. “Request desktop website”) often reports as Mac with touch
  if (nav.platform === 'MacIntel' && nav.maxTouchPoints > 1) {
    return true
  }
  if ('standalone' in nav) {
    return true
  }
  return false
}

/** Safari on desktop macOS (not iOS, not Chrome/Edge engine disguised as Safari). */
export function isMacDesktopSafari(): boolean {
  if (typeof globalThis.navigator === 'undefined') {
    return false
  }
  if (isIosOrIpadosDevice()) {
    return false
  }
  const ua = globalThis.navigator.userAgent
  if (!/Macintosh|Mac OS X/.test(ua) || !/Safari\//.test(ua)) {
    return false
  }
  // Real Safari has “Version/… Safari/…”; Chrome/Edge/Brave/Firefox on Mac include a different engine token
  if (/(?:Chrome|Chromium|Edg|OPR|Brave|Firefox|FxiOS|CriOS)\//.test(ua)) {
    return false
  }
  return true
}

function getNavigatorUserAgent(): string | null {
  if (typeof globalThis.navigator === 'undefined') {
    return null
  }
  return globalThis.navigator.userAgent
}

/** Android phones and tablets, excluding iOS browsers that may mention Android. */
export function isAndroidDevice(): boolean {
  if (isIosOrIpadosDevice()) {
    return false
  }
  const ua = getNavigatorUserAgent()
  if (ua === null) {
    return false
  }
  return /Android/i.test(ua)
}

/** Firefox (and Focus) on Android — no `beforeinstallprompt`. */
export function isAndroidFirefox(): boolean {
  if (!isAndroidDevice()) {
    return false
  }
  const ua = getNavigatorUserAgent()
  if (ua === null) {
    return false
  }
  return /(?:Firefox|Fennec|Focus)\//.test(ua)
}

/**
 * Chrome on Android, not other Chromium browsers (Edge, Samsung Internet, Opera).
 * Those keep the native prompt or generic help until we write dedicated copy.
 */
export function isAndroidChrome(): boolean {
  if (!isAndroidDevice() || isAndroidFirefox()) {
    return false
  }
  const ua = getNavigatorUserAgent()
  if (ua === null) {
    return false
  }
  if (!/(?:Chrome|Chromium)\//.test(ua)) {
    return false
  }
  if (/(?:EdgA|Edg|OPR|OPT|SamsungBrowser|Brave)\//.test(ua)) {
    return false
  }
  return true
}

/** iOS/iPadOS or Safari on Mac — browsers that show print header/footer chrome. */
export function needsSafariPdfPrintHint(): boolean {
  return isIosOrIpadosDevice() || isMacDesktopSafari()
}
