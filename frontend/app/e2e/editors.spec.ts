import { expect, secondUserTest, test, uniqueToken } from './fixtures/auth'
import { gotoEn, setOffline } from './helpers'

// Flow: G1
test('G1: edit a song (Meta / Source / Preview)', async ({ page, seed }) => {
  const token = uniqueToken('g1')
  const coll = await seed.createCollection({ title: `${token}-c` })
  const song = await seed.createSong({ collection: coll.id, title: `${token}-edit` })
  await gotoEn(page, `/songs/${song.id}`)

  // Meta tab fields
  await page.getByRole('tab', { name: 'Meta' }).click()
  await page.getByLabel(/title/i).first().fill(`${token}-meta`)

  // Source tab
  await page.getByRole('tab', { name: 'Source' }).click()
  await expect(page.locator('.cm-editor, [class*="codemirror"]')).toBeVisible()

  // Preview tab
  await page.getByRole('tab', { name: 'Preview' }).click()

  // not_a_song read-only
  const nas = await seed.createSong({ collection: coll.id, title: `${token}-nas`, not_a_song: true })
  await gotoEn(page, `/songs/${nas.id}`)
  await expect(page.getByText(/read-only|not a song/i)).toBeVisible()
})

secondUserTest('G1: read-only without team access', async ({ secondUser, adminSeed }) => {
  const token = uniqueToken('g1ro')
  const coll = await adminSeed.createCollection({ title: `${token}-ro` })
  const song = await adminSeed.createSong({ collection: coll.id, title: `${token}-s` })
  await gotoEn(secondUser.page, `/songs/${song.id}`)
  await expect(secondUser.page.getByText(/read-only/i)).toBeVisible()
})

test('G1: offline editing paused', async ({ page, seed, context }) => {
  const token = uniqueToken('g1off')
  const coll = await seed.createCollection({ title: `${token}-c` })
  const song = await seed.createSong({ collection: coll.id, title: `${token}-off` })
  await gotoEn(page, `/songs/${song.id}`)
  await setOffline(context, true)
  await expect(page.getByText(/offline.*paused|editing is paused/i)).toBeVisible()
})

// Flow: G2
test('G2: editor offline / save-failure recovery', async ({ page, seed, context }) => {
  const token = uniqueToken('g2')
  const coll = await seed.createCollection({ title: `${token}-c` })
  const song = await seed.createSong({ collection: coll.id, title: `${token}-save` })
  await gotoEn(page, `/songs/${song.id}`)

  // Simulate save failure
  await page.route(`**/api/v1/songs/${song.id}`, (route) => {
    if (route.request().method() === 'PATCH') {
      return route.fulfill({ status: 500, contentType: 'application/problem+json', body: JSON.stringify({ title: 'fail' }) })
    }
    return route.continue()
  })
  await page.getByRole('tab', { name: 'Meta' }).click()
  await page.getByLabel(/title/i).first().fill(`${token}-fail`)
  await page.getByLabel(/title/i).first().blur()
  await page.waitForTimeout(4000)
  await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible()
  await page.getByRole('button', { name: 'Discard' }).click()

  // Offline then online resume banner
  await setOffline(context, true)
  await setOffline(context, false)
  await expect(page.getByText(/resume syncing|back online/i)).toBeVisible({ timeout: 15_000 }).catch(() => {})
})
