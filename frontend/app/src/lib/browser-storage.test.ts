import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  getLocalStorage,
  getLocalStorageOrFallback,
  safeGetItem,
  safeRemoveItem,
  safeSetItem,
} from '@/lib/browser-storage'

describe('browser storage safety', () => {
  const originalLocalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')

  afterEach(() => {
    if (originalLocalStorage) {
      Object.defineProperty(globalThis, 'localStorage', originalLocalStorage)
    }
  })

  it('returns null when localStorage access throws', () => {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get: () => {
        throw new DOMException('blocked', 'SecurityError')
      },
    })

    expect(getLocalStorage()).toBeNull()
    expect(getLocalStorageOrFallback().getItem('x')).toBeNull()
  })

  it('catches getItem, setItem, and removeItem failures', () => {
    const storage = {
      getItem: vi.fn(() => {
        throw new DOMException('blocked', 'SecurityError')
      }),
      setItem: vi.fn(() => {
        throw new DOMException('full', 'QuotaExceededError')
      }),
      removeItem: vi.fn(() => {
        throw new DOMException('blocked', 'SecurityError')
      }),
    }

    expect(safeGetItem('x', storage)).toBeNull()
    expect(safeSetItem('x', '1', storage)).toBe(false)
    expect(safeRemoveItem('x', storage)).toBe(false)
  })
})
