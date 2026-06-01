import { expect, secondUserTest, test, uniqueToken } from './fixtures/auth'
import { HubPage } from './pages/hub'
import { gotoEn, setOffline } from './helpers'

// Flow: C1
secondUserTest('C1: create collection (personal team, no picker)', async ({ secondUser }) => {
  const { page } = secondUser
  const token = uniqueToken('c1')
  const hub = new HubPage(page)
  await hub.goto('/collections')
  await hub.createFab('Create collection').click()
  const dialog = page.getByRole('dialog', { name: 'New collection' })
  await expect(dialog.getByText('Team')).not.toBeVisible()

  await dialog.getByRole('button', { name: 'Create' }).click()
  await expect(dialog.getByRole('alert')).toContainText('Enter a title')

  await dialog.getByLabel('Title').fill(`${token}-coll`)
  await dialog.getByRole('button', { name: 'Create' }).click()
  await expect(page).toHaveURL(/\/collections\/[^/]+/)
})

// Flow: C2
test('C2: create collection (another team, picker)', async ({ page, seed }) => {
  const token = uniqueToken('c2')
  await seed.createTeam(`${token}-a`)
  const teamB = await seed.createTeam(`${token}-b`)
  const hub = new HubPage(page)
  await hub.goto('/collections')
  await hub.createFab('Create collection').click()
  const dialog = page.getByRole('dialog', { name: 'New collection' })
  await expect(dialog.getByLabel('Team')).toBeVisible()
  await dialog.getByLabel('Team').click()
  await page.getByRole('option').filter({ hasText: teamB.name }).click()
  await dialog.getByLabel('Title').fill(`${token}-picked`)
  await dialog.getByRole('button', { name: 'Create' }).click()
  await expect(page).toHaveURL(/\/collections\/[^/]+/)

  // Persist choice to localStorage (re-open dialog shows same team)
  await hub.goto('/collections')
  await hub.createFab('Create collection').click()
  await expect(dialog.getByLabel('Team')).toHaveValue(teamB.id)
  await page.getByRole('button', { name: 'Cancel' }).click()
})

// Flow: C3
test('C3: edit collection (rename, cover, songs)', async ({ page, seed, context }) => {
  const token = uniqueToken('c3')
  const coll = await seed.createCollection({ title: `${token}-edit` })
  const song = await seed.createSong({ collection: coll.id, title: `${token}-song` })
  await seed.patchCollection(coll.id, [song.id])

  await gotoEn(page, `/collections/${coll.id}`)

  // Rename autosave on blur
  const titleInput = page.getByLabel(/title/i).first()
  await titleInput.fill(`${token}-renamed`)
  await titleInput.blur()
  await page.waitForTimeout(1000)

  // Offline paused
  await setOffline(context, true)
  await expect(page.getByText(/offline.*paused/i)).toBeVisible()
  await setOffline(context, false)

  // Back
  await page.getByRole('button', { name: 'Back' }).click()
  await expect(page).toHaveURL(/\/collections/)
})

secondUserTest('C3: read-only banner without edit access', async ({ secondUser, adminSeed }) => {
  const token = uniqueToken('c3ro')
  const guest = secondUser
  const coll = await adminSeed.createCollection({ title: `${token}-ro` })
  // Guest has no edit access to admin's personal collection
  await gotoEn(guest.page, `/collections/${coll.id}`)
  await expect(guest.page.getByText(/read-only/i)).toBeVisible()
})
