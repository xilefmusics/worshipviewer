import { getLocalStorage, safeGetItem, safeRemoveItem, safeSetItem } from '@/lib/browser-storage'

export const APPEARANCE_STORAGE_KEY = 'wv_appearance'

export type AppearancePreference = 'system' | 'light' | 'dark'

export function resolveAppearancePreference(value: string | null): AppearancePreference {
  if (value === 'light' || value === 'dark' || value === 'system') return value
  return 'system'
}

export function applyAppearancePreference(
  preference: AppearancePreference,
  root: HTMLElement = globalThis.document.documentElement,
): void {
  if (preference === 'system') {
    root.removeAttribute('data-theme')
    return
  }

  root.dataset.theme = preference
}

export function readAppearancePreference(
  storage: Pick<Storage, 'getItem'> | null = getLocalStorage(),
): AppearancePreference {
  return resolveAppearancePreference(safeGetItem(APPEARANCE_STORAGE_KEY, storage))
}

export function writeAppearancePreference(
  preference: AppearancePreference,
  storage: Pick<Storage, 'setItem' | 'removeItem'> | null = getLocalStorage(),
): void {
  if (preference === 'system') {
    safeRemoveItem(APPEARANCE_STORAGE_KEY, storage)
    return
  }

  safeSetItem(APPEARANCE_STORAGE_KEY, preference, storage)
}

export function initAppearance(): void {
  if (typeof globalThis.document === 'undefined') return
  applyAppearancePreference(readAppearancePreference())
}
