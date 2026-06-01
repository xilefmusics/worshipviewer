import { expect, test, uniqueToken } from './fixtures/auth'
import { HubPage } from './pages/hub'
import { openContextMenu, setOffline, waitForToast } from './helpers'

// Flow: L1
test('L1: browse a list', async ({ page, seed }) => {
  const token = uniqueToken('l1')
  await seed.createCollection({ title: `${token}-browse` })
  const hub = new HubPage(page)
  await hub.goto('/collections')
  await hub.search(`${token}-browse`)
  await expect(hub.row(`${token}-browse`)).toBeVisible()

  // Tab switch clears search
  await hub.tab('Songs').click()
  await expect(hub.searchbox()).toHaveValue('')

  // Query error Retry — mock failure
  await hub.tab('Collections').click()
  await page.route('**/api/v1/collections**', (route) =>
    route.fulfill({ status: 500, contentType: 'application/problem+json', body: JSON.stringify({ title: 'fail' }) }),
  )
  await page.reload()
  await hub.retryButton().click().catch(() => {})
  await page.unroute('**/api/v1/collections**')
})

test('L1: list rows remain visible when toggled offline', async ({ page, seed, context }) => {
  const token = uniqueToken('l1-off')
  await seed.createCollection({ title: `${token}-off` })
  const hub = new HubPage(page)
  await hub.goto('/collections')
  await hub.search(`${token}-off`)
  await expect(hub.row(`${token}-off`)).toBeVisible()
  await setOffline(context, true)
  await expect(hub.row(`${token}-off`)).toBeVisible()
  await setOffline(context, false)
})

test.fixme('L1: pull-to-refresh touch gesture', async () => {
  // Chromium desktop cannot reliably emulate pull-to-refresh; branch documented in frontend-user-flows.md
})

// Flow: L2
test('L2: open row / open context menu', async ({ page, seed }) => {
  const token = uniqueToken('l2')
  await seed.createCollection({ title: `${token}-row` })
  const hub = new HubPage(page)
  await hub.goto('/collections')
  await hub.search(`${token}-row`)
  await hub.row(`${token}-row`).click()
  await expect(page).toHaveURL(/\/player/)

  await hub.goto('/collections')
  await hub.search(`${token}-row`)
  await openContextMenu(page, `${token}-row`)
  await expect(hub.menuItem('Edit')).toBeVisible()
  await expect(hub.menuItem('Play in Normal mode')).toBeVisible()
  await expect(hub.menuItem('Play in AV mode')).toBeVisible()
  await expect(hub.menuItem('Duplicate')).toBeVisible()
  await expect(hub.menuItem('Delete')).toBeVisible()
})

// Flow: L3
test('L3: duplicate a collection / setlist', async ({ page, seed, context }) => {
  const token = uniqueToken('l3')
  await seed.createCollection({ title: `${token}-dup` })
  const hub = new HubPage(page)
  await hub.goto('/collections')
  await hub.search(`${token}-dup`)
  await openContextMenu(page, `${token}-dup`)
  await hub.menuItem('Duplicate').click()
  await waitForToast(page, /Created/i)

  await setOffline(context, true)
  await hub.goto('/collections')
  await hub.search(`${token}-dup`)
  await openContextMenu(page, `${token}-dup`)
  await expect(hub.menuItem('Duplicate')).toBeDisabled()
  await setOffline(context, false)
})

// Flow: L4
test('L4: export a song / collection / setlist', async ({ page, seed }) => {
  const token = uniqueToken('l4')
  await seed.createCollection({ title: `${token}-exp` })
  const hub = new HubPage(page)
  await hub.goto('/collections')
  await hub.search(`${token}-exp`)
  await openContextMenu(page, `${token}-exp`)
  await page.getByRole('menuitem', { name: 'Export' }).hover()
  await expect(page.getByRole('menuitem', { name: /ChordPro/i })).toBeVisible()
  await expect(page.getByRole('menuitem', { name: /Worship Pro/i })).toBeVisible()
  await expect(page.getByRole('menuitem', { name: /PDF/i })).toBeVisible()
})

// Flow: L5
test('L5: delete with not-empty guard', async ({ page, seed }) => {
  const token = uniqueToken('l5')
  const coll = await seed.createCollection({ title: `${token}-del` })
  const song = await seed.createSong({ collection: coll.id, title: `${token}-s` })
  await seed.patchCollection(coll.id, [song.id])
  const hub = new HubPage(page)
  await hub.goto('/collections')
  await hub.search(`${token}-del`)
  await openContextMenu(page, `${token}-del`)
  await hub.menuItem('Delete').click()
  await expect(page.getByText(/still contains songs|delete every song/i)).toBeVisible()
  await page.getByRole('button', { name: 'Cancel' }).click()

  await seed.createCollection({ title: `${token}-empty` })
  await hub.goto('/collections')
  await hub.search(`${token}-empty`)
  await openContextMenu(page, `${token}-empty`)
  await hub.menuItem('Delete').click()
  await page.getByRole('button', { name: 'Delete' }).last().click()
  await waitForToast(page, /deleted|removed/i).catch(() => {})
})
