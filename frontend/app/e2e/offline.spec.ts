import { expect, test, uniqueToken } from './fixtures/auth'
import { HubPage } from './pages/hub'
import { setOffline } from './helpers'

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
  await page.goto(`/player?type=collection&id=${coll.id}&mode=normal`)
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

  const { openContextMenu } = await import('./helpers')
  await openContextMenu(page, `${token}-dl`)
  await hub.menuItem(/save for offline|für offline speichern/i).click()
  await expect(page.getByText(/saved for offline|offline-wiedergabe gespeichert/i)).toBeVisible({
    timeout: 15_000,
  })

  await setOffline(context, true)
  await page.goto(`/player?type=setlist&id=${setlist.id}&mode=normal`)
  await expect(page.locator('[data-player-main], .player-book, main')).toBeVisible({ timeout: 20_000 })
})
