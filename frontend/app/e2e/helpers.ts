import type { Page } from '@playwright/test'

/** Wait until the authenticated hub shell has loaded. */
export async function waitForHub(page: Page): Promise<void> {
  await page.getByRole('searchbox', { name: 'Search library' }).waitFor({
    state: 'visible',
    timeout: 30_000,
  })
}

/** Navigate with English locale pinned. */
export async function gotoEn(page: Page, path: string): Promise<void> {
  const sep = path.includes('?') ? '&' : '?'
  await page.goto(`${path}${sep}lang=en`)
  if (/^\/(collections|songs|setlists|teams)$/.test(path.split('?')[0] ?? '')) {
    await waitForHub(page)
  }
}

export async function setOffline(
  context: import('@playwright/test').BrowserContext,
  offline: boolean,
): Promise<void> {
  await context.setOffline(offline)
}

export async function grantClipboard(context: import('@playwright/test').BrowserContext): Promise<void> {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
}

export async function readClipboard(page: Page): Promise<string> {
  return page.evaluate(() => navigator.clipboard.readText())
}

/** Right-click a list row to open the hub context menu. */
export async function openContextMenu(page: Page, name: string | RegExp): Promise<void> {
  await page.getByRole('button', { name }).click({ button: 'right' })
}

/** Open the Add (+) FAB for the current hub list route. */
export async function clickCreateFab(page: Page, ariaLabel: string | RegExp): Promise<void> {
  await page.getByRole('button', { name: ariaLabel }).click()
}

/** Search the hub list (300 ms debounce — wait after fill). */
export async function searchHub(page: Page, query: string): Promise<void> {
  const box = page.getByRole('searchbox', { name: 'Search library' })
  await box.fill(query)
  await page.waitForTimeout(350)
}

export async function waitForToast(page: Page, text: string | RegExp): Promise<void> {
  await page.getByText(text).waitFor({ state: 'visible', timeout: 10_000 })
}

/** Press a keyboard shortcut on the page body. */
export async function pressKey(page: Page, key: string): Promise<void> {
  await page.keyboard.press(key)
}

/** Capture popup from window.open (e.g. AV projection output). */
export async function capturePopup(page: Page, trigger: () => Promise<void>): Promise<Page> {
  const popupPromise = page.waitForEvent('popup')
  await trigger()
  return popupPromise
}

/** Desktop fine-pointer context for ⌘K flows. */
export const desktopFinePointer = {
  viewport: { width: 1280, height: 800 },
  hasTouch: false,
  isMobile: false,
}
