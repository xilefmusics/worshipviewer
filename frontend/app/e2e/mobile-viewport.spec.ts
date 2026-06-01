import { expect, test, uniqueToken } from './fixtures/auth'
import { HubPage } from './pages/hub'
import { gotoEn } from './helpers'

test('hub list smoke on mobile portrait', async ({ page, seed }) => {
    const token = uniqueToken('mob-hub')
    await seed.createCollection({ title: `${token}-mob` })
    const hub = new HubPage(page)
    await hub.goto('/collections')
    await hub.search(`${token}-mob`)
    await expect(hub.row(`${token}-mob`)).toBeVisible()
})

test('player shell smoke on mobile rotation', async ({ page, seed }) => {
    const token = uniqueToken('mob-rot')
    const coll = await seed.createCollection({ title: `${token}-c` })
    const song = await seed.createSong({ collection: coll.id, title: `${token}-s` })
    await seed.patchCollection(coll.id, [song.id])
    await gotoEn(page, `/player?type=collection&id=${coll.id}&index=0&mode=normal`)
    await expect(page.locator('[data-player-main], .player-book, main')).toBeVisible()

    await page.setViewportSize({ width: 844, height: 390 })
    await expect(page.locator('[data-player-main], .player-book, main')).toBeVisible()
})
