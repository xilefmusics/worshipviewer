import type { APIRequestContext, BrowserContext, Page } from '@playwright/test'
import { test as base, expect } from '@playwright/test'

import { SeedClient, uniqueToken } from './api'

export { expect, uniqueToken }

export const ADMIN_SESSION_COOKIE = 'admin'
export const BASE_LANG = 'en'

/** Append `lang=en` so assertions match en.json. */
export function withLang(url: string): string {
  const u = new URL(url, 'http://placeholder')
  u.searchParams.set('lang', BASE_LANG)
  const qs = u.searchParams.toString()
  const pathWithQuery = `${u.pathname}${qs ? `?${qs}` : ''}`
  return pathWithQuery
}

export async function goto(page: Page, path: string): Promise<void> {
  await page.goto(withLang(path))
}

export async function addSessionCookie(
  context: BrowserContext,
  sessionId: string,
  baseURL: string,
): Promise<void> {
  await context.addCookies([
    {
      name: 'sso_session',
      value: sessionId,
      url: baseURL.endsWith('/') ? baseURL : `${baseURL}/`,
    },
  ])
}

type AdminFixtures = {
  seed: SeedClient
  adminSeed: SeedClient
}

type LoggedOutFixtures = Record<string, never>

type SecondUserFixtures = {
  secondUser: {
    email: string
    userId: string
    sessionId: string
    context: BrowserContext
    page: Page
    seed: SeedClient
  }
}

/** Default: admin session via `sso_session=admin`. */
export const test = base.extend<AdminFixtures>({
  context: async ({ browser, baseURL }, use) => {
    const context = await browser.newContext({ locale: 'en-US' })
    await addSessionCookie(context, ADMIN_SESSION_COOKIE, baseURL!)
    await use(context)
    await context.close()
  },
  page: async ({ context }, use) => {
    const page = await context.newPage()
    await use(page)
    await page.close()
  },
  request: async ({ playwright, baseURL }, use) => {
    const api = await playwright.request.newContext({
      baseURL,
      extraHTTPHeaders: { Cookie: `sso_session=${ADMIN_SESSION_COOKIE}` },
    })
    await use(api)
    await api.dispose()
  },
  seed: async ({ request, baseURL }, use) => {
    const seed = new SeedClient(request, baseURL!, ADMIN_SESSION_COOKIE)
    await use(seed)
  },
  adminSeed: async ({ seed }, use) => {
    await use(seed)
  },
})

/** Logged-out browser (no session cookie). */
export const loggedOutTest = base.extend<LoggedOutFixtures>({
  context: async ({ browser, baseURL }, use) => {
    const context = await browser.newContext({ locale: 'en-US' })
    await use(context)
    await context.close()
  },
  page: async ({ context }, use) => {
    const page = await context.newPage()
    await use(page)
    await page.close()
  },
})

/** Fresh non-admin user with its own browser context and session. */
export const secondUserTest = base.extend<SecondUserFixtures & { adminSeed: SeedClient }>({
  adminSeed: async ({ playwright, baseURL }, use) => {
    const api = await playwright.request.newContext({
      baseURL,
      extraHTTPHeaders: { Cookie: `sso_session=${ADMIN_SESSION_COOKIE}` },
    })
    const seed = new SeedClient(api, baseURL!, ADMIN_SESSION_COOKIE)
    await use(seed)
    await api.dispose()
  },
  secondUser: async ({ browser, adminSeed, baseURL, playwright }, use, testInfo) => {
    const token = uniqueToken(testInfo.title)
    const minted = await adminSeed.mintUser(`${token}@wv.test`)
    const userApi = await playwright.request.newContext({
      baseURL,
      extraHTTPHeaders: { Cookie: `sso_session=${minted.sessionId}` },
    })
    const userSeed = new SeedClient(userApi, baseURL!, minted.sessionId)
    const context = await browser.newContext({ locale: 'en-US' })
    await addSessionCookie(context, minted.sessionId, baseURL!)
    const page = await context.newPage()
    await use({
      email: minted.email,
      userId: minted.userId,
      sessionId: minted.sessionId,
      context,
      page,
      seed: userSeed,
    })
    await context.close()
    await userApi.dispose()
  },
})

export type { APIRequestContext, BrowserContext, Page }
