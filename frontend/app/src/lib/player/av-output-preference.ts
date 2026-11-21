import { getLocalStorage, safeGetItem, safeSetItem } from '@/lib/browser-storage'

export type AvExternalOutput = 'display' | 'window'

const KEY = 'avExternalOutput'

export function readAvExternalOutput(): AvExternalOutput {
  return safeGetItem(KEY, getLocalStorage()) === 'window' ? 'window' : 'display'
}

export function writeAvExternalOutput(value: AvExternalOutput): void {
  safeSetItem(KEY, value, getLocalStorage())
}

const AUTO_OPEN_KEY = 'avOutputAutoOpen'

export function readAvOutputAutoOpen(): boolean {
  return safeGetItem(AUTO_OPEN_KEY, getLocalStorage()) !== 'false'
}

export function writeAvOutputAutoOpen(value: boolean): void {
  safeSetItem(AUTO_OPEN_KEY, String(value), getLocalStorage())
}
