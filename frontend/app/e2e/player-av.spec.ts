import { expect, test, uniqueToken } from './fixtures/auth'
import { capturePopup, gotoEn } from './helpers'

import { MINIMAL_SONG_DATA } from './fixtures/api'

async function openAvPlayer(page: import('@playwright/test').Page, seed: import('./fixtures/api').SeedClient, token: string) {
  const coll = await seed.createCollection({ title: `${token}-av` })
  const song = await seed.createSong({
    collection: coll.id,
    title: `${token}-avsong`,
  })
  await seed.patchSong(song.id, {
    data: {
      ...MINIMAL_SONG_DATA,
      titles: [`${token}-avsong`],
      sections: [
        {
          title: 'Verse',
          repeat_count: 1,
          lines: [
            {
              parts: [
                {
                  chord: null,
                  comment: false,
                  languages: ['Amazing grace'],
                },
              ],
            },
          ],
        },
      ],
    },
  })
  await seed.patchCollection(coll.id, [song.id])
  await gotoEn(page, `/player?type=collection&id=${coll.id}&index=0&mode=av`)
}

// Flow: I1
test('I1: AV navigation (slides vs items)', async ({ page, seed }) => {
  const token = uniqueToken('i1')
  await openAvPlayer(page, seed, token)
  await expect(page.getByText(/Amazing grace/i)).toBeVisible()
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
  await expect(page.locator('.av-slide-view--blackout')).toBeVisible()
  await page.keyboard.press('Shift+r')
  await page.getByRole('button', { name: /background/i }).click()
  await page.getByRole('button', { name: /red/i }).click()
  await expect(page.locator('.av-background-layer--preset-1')).toBeVisible()
})

// Flow: I3
test('I3: open & drive projection output window', async ({ page, seed }) => {
  const token = uniqueToken('i3')
  await openAvPlayer(page, seed, token)
  const popup = await capturePopup(page, async () => {
    await page.keyboard.press('o')
  })
  await expect(popup).toHaveURL(/\/player\/output/)
  await expect(popup.locator('.av-slide-view, .av-output')).toBeVisible({ timeout: 10_000 })
  await popup.close()

  await gotoEn(page, '/player/output')
  await expect(page.locator('.av-slide-view')).toBeVisible({ timeout: 10_000 })
})
