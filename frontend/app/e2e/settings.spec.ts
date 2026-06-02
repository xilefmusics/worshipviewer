import { expect, test } from './fixtures/auth'
import { SettingsPage } from './pages/settings'
// Flow: J1
test('J1: General tab', async ({ page }) => {
  const settings = new SettingsPage(page)
  await settings.goto('general')
  await expect(page.getByText(/language|appearance|collections layout/i).first()).toBeVisible()
  await settings.backButton().click()
  await expect(page).toHaveURL(/\/collections/)
  await page.getByRole('link', { name: 'Teams' }).click()
  await expect(page).toHaveURL(/\/teams/)
  await page.getByRole('button', { name: /open profile menu/i }).click()
  await page.getByRole('menuitem', { name: 'Settings' }).click()
  await expect(page).toHaveURL(/\/settings/)
  await page.getByRole('button', { name: /open profile menu/i }).click()
  await page.getByRole('menuitem', { name: 'Sessions' }).click()
  await expect(page).toHaveURL(/\/sessions/)
  await settings.backButton().click()
  await expect(page).toHaveURL(/\/collections/)
})

// Flow: J2 — e2e smoke; detailed options in component test
test('J2: Player Default tab', async ({ page }) => {
  const settings = new SettingsPage(page)
  await settings.goto('player')
  await expect(page.getByText(/chord format|player layout/i).first()).toBeVisible()
})

// Flow: J3 — e2e smoke; detailed options in component test
test('J3: Player AV tab', async ({ page }) => {
  const settings = new SettingsPage(page)
  await settings.goto('playerRoles')
  await expect(page.getByText(/font size|alignment|transition/i).first()).toBeVisible()
})

test('J2+J3: settings preferences round-trip after reload', async ({ page }) => {
  const settings = new SettingsPage(page)
  await settings.goto('player')
  await page.getByRole('radio', { name: /nashville/i }).click()
  await page.reload()
  await expect(page.getByRole('radio', { name: /nashville/i })).toBeChecked()

  await settings.goto('playerRoles')
  await page.getByRole('radio', { name: /fade/i }).click()
  await page.reload()
  await expect(page.getByRole('radio', { name: /fade/i })).toBeChecked()
})
