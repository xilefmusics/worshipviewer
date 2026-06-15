import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/api/client', () => ({
  api: {
    POST: vi.fn(async () => ({ response: { ok: true, status: 204 } })),
  },
}))

vi.mock('@/lib/clear-local', () => ({
  clearAllLocalData: vi.fn(async () => {}),
}))

import { initLogoutQueue, performLogout } from '@/lib/logout-queue'

describe('logout queue storage safety', () => {
  const originalLocalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator')

  afterEach(() => {
    if (originalLocalStorage) {
      Object.defineProperty(globalThis, 'localStorage', originalLocalStorage)
    }
    if (originalNavigator) {
      Object.defineProperty(globalThis, 'navigator', originalNavigator)
    }
  })

  it('does not throw when startup storage access is blocked', () => {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get: () => {
        throw new DOMException('blocked', 'SecurityError')
      },
    })

    expect(() => initLogoutQueue()).not.toThrow()
  })

  it('does not throw when offline queue writes are blocked', async () => {
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: { onLine: false },
    })
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get: () => {
        throw new DOMException('blocked', 'SecurityError')
      },
    })

    await expect(performLogout({} as never)).resolves.toBeUndefined()
  })
})
