import { expect, test, uniqueToken } from './fixtures/auth'
import { gotoEn } from './helpers'

import { MINIMAL_SONG_DATA } from './fixtures/api'

async function openPlayer(page: import('@playwright/test').Page, seed: import('./fixtures/api').SeedClient, token: string) {
  const coll = await seed.createCollection({ title: `${token}-c` })
  const song = await seed.createSong({ collection: coll.id, title: `${token}-player` })
  await seed.patchSong(song.id, {
    data: {
      ...MINIMAL_SONG_DATA,
      titles: [`${token}-player`],
      key: { level: 0 },
    },
  })
  await seed.patchCollection(coll.id, [song.id])
  await gotoEn(page, `/player?type=collection&id=${coll.id}&index=0&mode=normal`)
  return { coll, song }
}

// Flow: H1
test('H1: open player & navigate items', async ({ page, seed }) => {
  const token = uniqueToken('h1')
  await openPlayer(page, seed, token)
  await expect(page.getByText(`${token}-player`)).toBeVisible()
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('Home')
  await page.keyboard.press('End')
  await page.keyboard.press('Escape')
  await expect(page).toHaveURL(/\/collections/)
})

// Flow: H2
test('H2: chrome, TOC jump, filters', async ({ page, seed }) => {
  const token = uniqueToken('h2')
  await openPlayer(page, seed, token)
  await page.locator('body').click({ position: { x: 640, y: 400 } })
  await expect(page.getByText(/contents/i)).toBeVisible()
  const tocEntry = page.getByRole('button', { name: /verse/i }).first()
  if (await tocEntry.isVisible()) {
    await tocEntry.click()
  }
  await page.keyboard.press('m')
})

// Flow: H3 — logic covered in transpose-key.test.ts; e2e smoke for popover
test('H3: transpose current song', async ({ page, seed }) => {
  const token = uniqueToken('h3')
  await openPlayer(page, seed, token)
  await page.locator('body').click({ position: { x: 640, y: 400 } })
  const transposeBtn = page.getByRole('button', { name: /transpose/i })
  await expect(transposeBtn).toBeVisible()
  await transposeBtn.click()
  await page.getByRole('button', { name: 'D' }).click()
  await page.keyboard.press('r')
})

// Flow: H4
test('H4: other normal-mode keyboard controls', async ({ page, seed }) => {
  const token = uniqueToken('h4')
  await openPlayer(page, seed, token)
  await page.keyboard.press('s')
  await page.keyboard.press('n')
  await page.keyboard.press('l')
})
