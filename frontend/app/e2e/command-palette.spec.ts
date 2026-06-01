import { expect, test, uniqueToken } from './fixtures/auth'
import { desktopFinePointer } from './helpers'
import { HubPage } from './pages/hub'

test.use(desktopFinePointer)

test('command palette opens with Meta+k on fine pointer', async ({ page, seed }) => {
  const token = uniqueToken('cmdk')
  await seed.createCollection({ title: `${token}-cmdk` })
  const hub = new HubPage(page)
  await hub.goto('/collections')
  await page.keyboard.press('Meta+k')
  await expect(page.getByRole('dialog')).toBeVisible()
})

test('hub search field visible on coarse pointer project', async ({ browser, baseURL, seed }) => {
  const token = uniqueToken('touch-search')
  await seed.createCollection({ title: `${token}-touch` })
  const context = await browser.newContext({ ...desktopFinePointer, hasTouch: true })
  const cookieUrl = baseURL!.endsWith('/') ? baseURL! : `${baseURL!}/`
  await context.addCookies([
    {
      name: 'sso_session',
      value: 'admin',
      url: cookieUrl,
    },
  ])
  const page = await context.newPage()
  const hub = new HubPage(page)
  await hub.goto('/collections')
  await expect(hub.searchbox()).toBeVisible()
  await hub.search(`${token}-touch`)
  await expect(hub.row(`${token}-touch`)).toBeVisible()
  await context.close()
})
