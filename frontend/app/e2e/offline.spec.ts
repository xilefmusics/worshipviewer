import { expect, test, uniqueToken } from './fixtures/auth'
import { HubPage } from './pages/hub'
import { openContextMenu, setOffline } from './helpers'

test('offline: hub list keeps rows when toggled offline mid-session', async ({ page, seed, context }) => {
  const token = uniqueToken('off-mid')
  await seed.createSetlist({ title: `${token}-list` })
  const hub = new HubPage(page)
  await hub.goto('/setlists')
  await hub.search(`${token}-list`)
  await expect(hub.row(`${token}-list`)).toBeVisible()

  await setOffline(context, true)
  await expect(hub.row(`${token}-list`)).toBeVisible()
  await setOffline(context, false)
})

test('offline: collection player shows not-cached message', async ({ page, seed, context }) => {
  const token = uniqueToken('off-coll')
  const coll = await seed.createCollection({ title: `${token}-c` })
  const hub = new HubPage(page)
  await hub.goto('/collections')
  await hub.search(`${token}-c`)
  await hub.row(`${token}-c`).click()
  await expect(page).toHaveURL(/\/player/)

  await setOffline(context, true)
  await page.goto(`/player?type=collection&id=${coll.id}&mode=sheet`)
  await expect(page.getByText(/isn't available offline|offline nicht verfügbar/i)).toBeVisible({
    timeout: 15_000,
  })
})

test('offline: reload with cached session shows hub', async ({ page, seed, context }) => {
  const token = uniqueToken('off-cold')
  await seed.createSetlist({ title: `${token}-cold` })
  const hub = new HubPage(page)
  await hub.goto('/setlists')
  await hub.search(`${token}-cold`)
  await expect(hub.row(`${token}-cold`)).toBeVisible()

  await setOffline(context, true)
  await page.reload()
  await expect(page.getByText(/offline.*saved|offline.*gespeichert/i)).toBeVisible({ timeout: 20_000 })
  await expect(hub.row(`${token}-cold`)).toBeVisible({ timeout: 20_000 })
})

test('offline: save for offline then play without prior open', async ({ page, seed, context }) => {
  const token = uniqueToken('off-dl')
  const setlist = await seed.createSetlist({ title: `${token}-dl` })
  const hub = new HubPage(page)
  await hub.goto('/setlists')
  await hub.search(`${token}-dl`)

  await openContextMenu(page, `${token}-dl`)
  await hub.menuItem(/save for offline|für offline speichern/i).click()
  await expect(page.getByText(/saved for offline|offline-wiedergabe gespeichert/i)).toBeVisible({
    timeout: 15_000,
  })

  await setOffline(context, true)
  await page.goto(`/player?type=setlist&id=${setlist.id}&mode=sheet`)
  await expect(page.locator('[data-player-main], .player-book, main')).toBeVisible({ timeout: 20_000 })
})

test('offline: cached setlist row marker persists and can be removed', async ({ page, seed }) => {
  const token = uniqueToken('off-marker')
  await seed.createSetlist({ title: `${token}-setlist` })
  const hub = new HubPage(page)
  await hub.goto('/setlists')
  await hub.search(`${token}-setlist`)

  await openContextMenu(page, `${token}-setlist`)
  await hub.menuItem(/save for offline/i).click()
  await expect(page.getByText(/saved for offline/i)).toBeVisible({ timeout: 15_000 })
  await expect(page.getByRole('img', { name: 'Saved offline' })).toBeVisible()

  await page.reload()
  await hub.search(`${token}-setlist`)
  await expect(page.getByRole('img', { name: 'Saved offline' })).toBeVisible()

  await openContextMenu(page, `${token}-setlist`)
  await hub.menuItem(/remove offline copy/i).click()
  await expect(page.getByRole('img', { name: 'Saved offline' })).toHaveCount(0)
})

test('offline: cached collection shows marker in card view', async ({ page, seed }) => {
  const token = uniqueToken('off-card')
  await seed.createCollection({ title: `${token}-collection` })
  await page.addInitScript(() => {
    window.localStorage.setItem('wv.hub.viewMode.collections', 'card')
  })

  const hub = new HubPage(page)
  await hub.goto('/collections')
  await hub.search(`${token}-collection`)
  await expect(hub.row(`${token}-collection`)).toBeVisible()

  await openContextMenu(page, `${token}-collection`)
  await hub.menuItem(/save for offline/i).click()
  await expect(page.getByRole('img', { name: 'Saved offline' })).toBeVisible()
})
