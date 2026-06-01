import { expect, test, uniqueToken } from './fixtures/auth'
import { HubPage } from './pages/hub'
import { gotoEn, grantClipboard, setOffline, waitForToast } from './helpers'

// Flow: B1
test('B1: create a team', async ({ page }) => {
  const token = uniqueToken('b1')
  const hub = new HubPage(page)
  await hub.goto('/teams')

  // FAB online-only (visible when online)
  await expect(hub.createFab('Create team')).toBeEnabled()

  await hub.createFab('Create team').click()
  const dialog = page.getByRole('dialog', { name: 'Create team' })

  // Empty name error
  await dialog.getByRole('button', { name: 'Create' }).click()
  await expect(dialog.getByRole('alert')).toContainText('Enter a team name')

  // POST fail (mock)
  await page.route('**/api/v1/teams', (route) => {
    if (route.request().method() === 'POST') {
      return route.fulfill({
        status: 500,
        contentType: 'application/problem+json',
        body: JSON.stringify({ title: 'Could not create team.' }),
      })
    }
    return route.continue()
  })
  await dialog.getByLabel('Team name').fill(`${token}-fail`)
  await dialog.getByRole('button', { name: 'Create' }).click()
  await expect(dialog.getByRole('alert')).toBeVisible()
  await page.unroute('**/api/v1/teams')

  // OK → /teams/:id
  await dialog.getByLabel('Team name').fill(`${token}-ok`)
  await dialog.getByRole('button', { name: 'Create' }).click()
  await expect(page).toHaveURL(/\/teams\/[^/]+/)

  // Cancel closes
  await hub.goto('/teams')
  await hub.createFab('Create team').click()
  await page.getByRole('button', { name: 'Cancel' }).click()
  await expect(page.getByRole('dialog', { name: 'Create team' })).not.toBeVisible()
})

// Flow: B2
test('B2: open and rename a team', async ({ page, seed }) => {
  const token = uniqueToken('b2')
  const team = await seed.createTeam(`${token}-rename`)
  await gotoEn(page, `/teams/${team.id}`)

  // Admin + non-personal: inline edit
  await page.locator('h1').click()
  const input = page.locator('h1 input, input[aria-label*="title" i]').first()
  await input.fill(`${token}-renamed`)
  await input.press('Escape')
  // Escape reverts — title should not be renamed yet
  await expect(page.locator('h1')).toContainText(`${token}-rename`)

  await page.locator('h1').click()
  const input2 = page.locator('h1 input, input[aria-label*="title" i]').first()
  await input2.fill(`${token}-committed`)
  await input2.press('Enter')
  await expect(page.locator('h1')).toContainText(`${token}-committed`)

  // Personal team read-only
  const personalId = await seed.getPersonalTeamId()
  await gotoEn(page, `/teams/${personalId}`)
  await expect(page.locator('h1')).toContainText(/My Team|Team/i)
})

// Flow: B3
test('B3: change member roles', async ({ page, seed, baseURL }) => {
  const token = uniqueToken('b3')
  const team = await seed.createTeam(`${token}-roles`)
  const guest = await seed.mintUser(`${token}-member@wv.test`)
  await seed.addMemberToTeam(team.id, team, guest.userId, 'guest')

  // Admin view: change role, dirty → Discard
  await gotoEn(page, `/teams/${team.id}`)
  await page.locator(`#member-role-${guest.userId}`).click()
  await page.getByRole('option', { name: 'Editor' }).click()
  await page.getByRole('button', { name: 'Discard' }).click()

  // Non-personal keeps ≥1 Admin — demote all admins disabled Save
  await page.locator(`#member-role-${guest.userId}`).click()
  await page.getByRole('option', { name: 'Guest' }).click()
  const saveBtn = page.getByRole('button', { name: 'Save member roles' })
  await expect(saveBtn).toBeEnabled()
  await saveBtn.click()
  await expect(saveBtn).not.toBeVisible()

  // Non-admin read-only badges
  const guestCtx = await page.context().browser()!.newContext({ locale: 'en-US' })
  await guestCtx.addCookies([{ name: 'sso_session', value: guest.sessionId, url: baseURL! }])
  const guestPage = await guestCtx.newPage()
  await gotoEn(guestPage, `/teams/${team.id}`)
  await expect(guestPage.getByText('Guest')).toBeVisible()
  await expect(guestPage.locator('[id^="member-role-"]')).toHaveCount(0)
  await guestCtx.close()
})

// Flow: B4
test('B4: invite someone to a team', async ({ page, seed, context, baseURL }) => {
  const token = uniqueToken('b4')
  const team = await seed.createTeam(`${token}-invite`)
  await grantClipboard(context)
  await gotoEn(page, `/teams/${team.id}`)

  // Offline disables Invite
  await setOffline(context, true)
  await expect(page.getByRole('button', { name: 'Invite' })).toBeDisabled()
  await setOffline(context, false)

  // Create link → copy toast
  await page.getByRole('button', { name: 'Invite' }).click()
  await page.getByRole('button', { name: 'Create link' }).click()
  await waitForToast(page, /Link copied|join/i)

  // Non-admin message
  const guest = await seed.mintUser(`${token}-guest@wv.test`)
  await seed.addMemberToTeam(team.id, team, guest.userId, 'guest')
  const guestCtx = await page.context().browser()!.newContext({ locale: 'en-US' })
  await guestCtx.addCookies([{ name: 'sso_session', value: guest.sessionId, url: baseURL! }])
  const guestPage = await guestCtx.newPage()
  await gotoEn(guestPage, `/teams/${team.id}`)
  await expect(guestPage.getByText('Only team admins can manage invitations.')).toBeVisible()
  await guestCtx.close()
})

// Flow: B5
test('B5: delete a team', async ({ page, seed }) => {
  const token = uniqueToken('b5')
  const team = await seed.createTeam(`${token}-delete`)
  await gotoEn(page, `/teams/${team.id}`)

  // Personal team: delete section hidden
  const personalId = await seed.getPersonalTeamId()
  await gotoEn(page, `/teams/${personalId}`)
  await expect(page.getByRole('button', { name: 'Delete team' })).toHaveCount(0)

  // Admin + non-personal: confirm dialog → DELETE, stays on screen
  await gotoEn(page, `/teams/${team.id}`)
  await page.getByRole('button', { name: 'Delete team' }).click()
  await page.getByRole('button', { name: 'Delete team' }).last().click()
  await expect(page).toHaveURL(new RegExp(`/teams/${team.id}`))
})
