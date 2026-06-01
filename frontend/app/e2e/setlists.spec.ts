import { expect, secondUserTest, test, uniqueToken } from './fixtures/auth'
import { HubPage } from './pages/hub'
import { gotoEn } from './helpers'

// Flow: E1
secondUserTest('E1: create setlist (personal team)', async ({ secondUser }) => {
  const token = uniqueToken('e1')
  const { page } = secondUser
  const hub = new HubPage(page)
  await hub.goto('/setlists')
  await hub.createFab('Create setlist').click()
  const dialog = page.getByRole('dialog', { name: 'New setlist' })
  await expect(dialog.getByText('Team')).not.toBeVisible()
  await dialog.getByRole('button', { name: 'Create' }).click()
  await expect(dialog.getByRole('alert')).toContainText('Enter a title')
  await dialog.getByLabel('Title').fill(`${token}-sl`)
  await dialog.getByRole('button', { name: 'Create' }).click()
  await expect(page).toHaveURL(/\/setlists\/[^/]+/)
})

// Flow: E2
test('E2: create setlist (another team)', async ({ page, seed }) => {
  const token = uniqueToken('e2')
  await seed.createTeam(`${token}-a`)
  await seed.createTeam(`${token}-b`)
  const hub = new HubPage(page)
  await hub.goto('/setlists')
  await hub.createFab('Create setlist').click()
  const dialog = page.getByRole('dialog', { name: 'New setlist' })
  await expect(dialog.getByLabel('Team')).toBeVisible()
  await dialog.getByLabel('Title').fill(`${token}-team-sl`)
  await dialog.getByRole('button', { name: 'Create' }).click()
  await expect(page).toHaveURL(/\/setlists\/[^/]+/)
})

// Flow: E3
test('E3: add songs via picker sheet', async ({ page, seed }) => {
  const token = uniqueToken('e3')
  const coll = await seed.createCollection({ title: `${token}-c` })
  await seed.createSong({ collection: coll.id, title: `${token}-pick` })
  const sl = await seed.createSetlist({ title: `${token}-sl` })
  await gotoEn(page, `/setlists/${sl.id}`)
  await page.getByRole('button', { name: /add songs/i }).click()
  await page.getByPlaceholder(/search songs/i).fill(`${token}-pick`)
  await page.getByRole('button', { name: `${token}-pick` }).click()
  await expect(page.getByRole('dialog', { name: /add a song/i })).not.toBeVisible()
})

// Flow: E4 — e2e portion (full component test in setlists-key.spec.tsx)
test('E4: add songs via command palette (desktop)', async ({ page, seed }) => {
  const token = uniqueToken('e4')
  const coll = await seed.createCollection({ title: `${token}-c` })
  await seed.createSong({ collection: coll.id, title: `${token}-cmd` })
  const sl = await seed.createSetlist({ title: `${token}-sl` })
  await gotoEn(page, `/setlists/${sl.id}`)
  await page.keyboard.press('Meta+k')
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect(page.getByText(/insert song into setlist/i)).toBeVisible()
})

// Flow: E6
test('E6: reorder / remove / rename / play', async ({ page, seed }) => {
  const token = uniqueToken('e6')
  const coll = await seed.createCollection({ title: `${token}-c` })
  const song = await seed.createSong({ collection: coll.id, title: `${token}-s` })
  const sl = await seed.createSetlist({ title: `${token}-sl` })
  await seed.patchSetlist(sl.id, { songs: [{ id: song.id, key: null, nr: '1', tempo: null }] })
  await gotoEn(page, `/setlists/${sl.id}`)

  // Rename
  const title = page.getByLabel(/title/i).first()
  await title.fill(`${token}-renamed`)
  await title.blur()
  await page.waitForTimeout(1000)

  // Play gated when empty — create empty setlist
  const empty = await seed.createSetlist({ title: `${token}-empty` })
  await gotoEn(page, `/setlists/${empty.id}`)
  await expect(page.getByRole('button', { name: /play/i })).toBeDisabled()

  // Play when songs present
  await gotoEn(page, `/setlists/${sl.id}`)
  await page.getByRole('button', { name: /play/i }).click()
  await expect(page).toHaveURL(/\/player/)

  // Remove desktop trash
  await gotoEn(page, `/setlists/${sl.id}`)
  await page.getByRole('button', { name: /remove|trash/i }).first().click()
  await expect(page.getByText(/removed|undo/i)).toBeVisible()

  await page.getByRole('button', { name: 'Back' }).click()
  await expect(page).toHaveURL(/\/setlists/)
})
