import { expect, test, uniqueToken } from './fixtures/auth'
import { gotoEn } from './helpers'

async function openAvPlayer(page: import('@playwright/test').Page, seed: import('./fixtures/api').SeedClient, token: string) {
  const coll = await seed.createCollection({ title: `${token}-av` })
  const song = await seed.createSong({
    collection: coll.id,
    title: `${token}-avsong`,
  })
  await seed.patchCollection(coll.id, [song.id])
  await gotoEn(page, `/player?type=collection&id=${coll.id}&index=0&mode=av`)
}

// Flow: I1
test('I1: AV navigation (slides vs items)', async ({ page, seed }) => {
  const token = uniqueToken('i1')
  await openAvPlayer(page, seed, token)
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('Home')
  await page.keyboard.press('End')
  await page.keyboard.press('n')
  await page.keyboard.press('Shift+n')
  await page.keyboard.press('Escape')
  await expect(page).toHaveURL(/\/collections/)
})

// Flow: I2
test('I2: AV live screen states & background', async ({ page, seed }) => {
  const token = uniqueToken('i2')
  await openAvPlayer(page, seed, token)
  await page.keyboard.press('r')
  await page.keyboard.press('Shift+r')
})

// Flow: I3
test('I3: open & drive projection output window', async ({ page, seed }) => {
  const token = uniqueToken('i3')
  await openAvPlayer(page, seed, token)
  const popupPromise = page.waitForEvent('popup')
  await page.keyboard.press('o')
  const popup = await popupPromise
  await expect(popup).toHaveURL(/\/player\/output/)
  await popup.close()

  // Missing ?s param
  await gotoEn(page, '/player/output')
  await expect(page.getByText(/missing projection session/i)).toBeVisible()
})
