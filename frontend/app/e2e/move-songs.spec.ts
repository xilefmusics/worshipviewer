import { expect, test, uniqueToken } from './fixtures/auth'
import { gotoEn, waitForToast } from './helpers'

// Flow: F1
test('F1: move a song between collections', async ({ page, seed }) => {
  const token = uniqueToken('f1')
  const src = await seed.createCollection({ title: `${token}-src` })
  const dst = await seed.createCollection({ title: `${token}-dst` })
  const song = await seed.createSong({ collection: src.id, title: `${token}-move` })
  await seed.patchCollection(src.id, [song.id])

  await gotoEn(page, `/collections/${src.id}`)
  await page.getByRole('button', { name: /move to another collection/i }).first().click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('button', { name: dst.title }).click()
  await dialog.getByRole('button', { name: 'Move' }).click()
  await waitForToast(page, /Moved to/i)
})

test('F1: move failure shows error toast', async ({ page, seed }) => {
  const token = uniqueToken('f1fail')
  const src = await seed.createCollection({ title: `${token}-src` })
  const dst = await seed.createCollection({ title: `${token}-dst` })
  const song = await seed.createSong({ collection: src.id, title: `${token}-move` })
  await seed.patchCollection(src.id, [song.id])

  await gotoEn(page, `/collections/${src.id}`)
  await page.route(`**/api/v1/songs/${song.id}`, (route) => {
    if (route.request().method() === 'PATCH') {
      return route.fulfill({
        status: 500,
        contentType: 'application/problem+json',
        body: JSON.stringify({ title: 'Move failed' }),
      })
    }
    return route.continue()
  })
  await page.getByRole('button', { name: /move to another collection/i }).first().click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('button', { name: dst.title }).click()
  await dialog.getByRole('button', { name: 'Move' }).click()
  await expect(page.getByText(/move failed|could not move|failed/i)).toBeVisible({ timeout: 10_000 })
  await page.unroute(`**/api/v1/songs/${song.id}`)
})

test('F1: no other collections message', async ({ page, seed }) => {
  const token = uniqueToken('f1none')
  const coll = await seed.createCollection({ title: `${token}-only` })
  const song = await seed.createSong({ collection: coll.id, title: `${token}-s` })
  await seed.patchCollection(coll.id, [song.id])
  await gotoEn(page, `/collections/${coll.id}`)
  await page.getByRole('button', { name: /move to another collection/i }).first().click()
  await expect(page.getByText(/no other collections/i)).toBeVisible()
})

// Flow: F2
test('F2: add a song to a collection vs a setlist', async ({ page, seed }) => {
  const token = uniqueToken('f2')
  const coll = await seed.createCollection({ title: `${token}-coll` })
  const sl = await seed.createSetlist({ title: `${token}-sl` })
  const song = await seed.createSong({ collection: coll.id, title: `${token}-add` })
  await seed.patchCollection(coll.id, [song.id])

  // Into setlist via Add songs sheet
  await gotoEn(page, `/setlists/${sl.id}`)
  await page.getByRole('button', { name: /add songs/i }).click()
  await page.getByPlaceholder(/search songs/i).fill(`${token}-add`)
  await page.getByRole('button', { name: `${token}-add` }).click()

  // Into collection via ⌘K (desktop)
  await gotoEn(page, `/collections/${coll.id}`)
  await page.keyboard.press('Meta+k')
  await expect(page.getByText(/insert song into collection/i)).toBeVisible()
})
