import { expect, test } from './fixtures/auth'
import { SettingsPage } from './pages/settings'
// Flow: J1
test('J1: General tab', async ({ page }) => {
  const settings = new SettingsPage(page)
  await settings.goto('general')
  await expect(page.getByText(/language|appearance|collections layout/i).first()).toBeVisible()
  await page.getByRole('link', { name: 'Teams' }).click()
  await expect(page).toHaveURL(/\/teams/)
  await settings.goto('general')
  await page.getByRole('link', { name: 'Sessions' }).click()
  await expect(page).toHaveURL(/\/sessions/)
  await settings.backButton().click()
  await expect(page).toHaveURL(/\/collections/)
})

// Flow: J2 — e2e smoke; detailed options in component test
test('J2: Player Default tab', async ({ page }) => {
  const settings = new SettingsPage(page)
  await settings.goto('player')
  await expect(page.getByText(/chord format|scroll mode/i).first()).toBeVisible()
})

// Flow: J3 — e2e smoke; detailed options in component test
test('J3: Player AV tab', async ({ page }) => {
  const settings = new SettingsPage(page)
  await settings.goto('playerRoles')
  await expect(page.getByText(/font size|alignment|transition/i).first()).toBeVisible()
})
