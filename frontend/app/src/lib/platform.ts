export type KeyboardShortcutPlatform = 'mac' | 'windows-linux' | 'mobile'

type NavigatorPlatformInfo = Pick<Navigator, 'maxTouchPoints' | 'platform' | 'userAgent'> & {
  userAgentData?: {
    mobile?: boolean
    platform?: string
  }
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

/** iOS/iPadOS or Safari on Mac — browsers that show print header/footer chrome. */
export function needsSafariPdfPrintHint(): boolean {
  return isIosOrIpadosDevice() || isMacDesktopSafari()
}
