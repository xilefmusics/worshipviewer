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
  storage: Pick<Storage, 'getItem'> = globalThis.localStorage,
): AppearancePreference {
  return resolveAppearancePreference(storage.getItem(APPEARANCE_STORAGE_KEY))
}

export function writeAppearancePreference(
  preference: AppearancePreference,
  storage: Pick<Storage, 'setItem' | 'removeItem'> = globalThis.localStorage,
): void {
  if (preference === 'system') {
    storage.removeItem(APPEARANCE_STORAGE_KEY)
    return
  }

  storage.setItem(APPEARANCE_STORAGE_KEY, preference)
}

export function initAppearance(): void {
  if (typeof globalThis.document === 'undefined') return
  applyAppearancePreference(readAppearancePreference())
}
