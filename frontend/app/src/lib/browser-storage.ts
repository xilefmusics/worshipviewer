export type BrowserStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

const noopStorage: BrowserStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
}

export function getLocalStorage(): BrowserStorage | null {
  try {
    return typeof globalThis.localStorage === 'undefined' ? null : globalThis.localStorage
  } catch {
    return null
  }
}

export function getLocalStorageOrFallback(): BrowserStorage {
  const storage = getLocalStorage()
  if (!storage) return noopStorage
  return {
    getItem: (key) => safeGetItem(key, storage),
    setItem: (key, value) => {
      safeSetItem(key, value, storage)
    },
    removeItem: (key) => {
      safeRemoveItem(key, storage)
    },
  }
}

export function safeGetItem(
  key: string,
  storage: Pick<Storage, 'getItem'> | null = getLocalStorage(),
): string | null {
  if (!storage) return null
  try {
    return storage.getItem(key)
  } catch {
    return null
  }
}

export function safeSetItem(
  key: string,
  value: string,
  storage: Pick<Storage, 'setItem'> | null = getLocalStorage(),
): boolean {
  if (!storage) return false
  try {
    storage.setItem(key, value)
    return true
  } catch {
    return false
  }
}

export function safeRemoveItem(
  key: string,
  storage: Pick<Storage, 'removeItem'> | null = getLocalStorage(),
): boolean {
  if (!storage) return false
  try {
    storage.removeItem(key)
    return true
  } catch {
    return false
  }
}
