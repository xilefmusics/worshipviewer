import { getLocalStorage, safeGetItem, safeSetItem } from '@/lib/browser-storage'

export type AvDisplay = { name: string; x: number; y: number; width: number; height: number; primary: boolean }

const DISPLAY_KEY = 'avOutputDisplay'

export function readAvOutputDisplay(): AvDisplay | null {
  try {
    const value: unknown = JSON.parse(safeGetItem(DISPLAY_KEY, getLocalStorage()) ?? 'null')
    if (!value || typeof value !== 'object') return null
    const display = value as Record<string, unknown>
    if (typeof display.name !== 'string' || typeof display.x !== 'number' || typeof display.y !== 'number' ||
      typeof display.width !== 'number' || typeof display.height !== 'number' || display.primary !== false) return null
    return display as AvDisplay
  } catch {
    return null
  }
}

export function writeAvOutputDisplay(display: AvDisplay): void {
  safeSetItem(DISPLAY_KEY, JSON.stringify(display), getLocalStorage())
}

/** Match the native output's rules, including a uniquely named display that moved. */
export function matchAvOutputDisplay(saved: AvDisplay | null, displays: AvDisplay[]): AvDisplay | null {
  if (!saved) return null
  const matches = displays.filter((display) => !display.primary && display.name === saved.name)
  return matches.find((display) => display.x === saved.x && display.y === saved.y) ??
    (matches.length === 1 ? matches[0] : null)
}
