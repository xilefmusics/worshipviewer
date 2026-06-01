import { expect, loggedOutTest } from './fixtures/auth'

loggedOutTest('unauthenticated visit redirects to the login page', async ({ page }) => {
  await page.goto('/?lang=en')
  await expect(page).toHaveURL(/\/login/)
  await expect(page.getByLabel(/email/i)).toBeVisible()
})

loggedOutTest('app shell mounts (root element is populated)', async ({ page }) => {
  await page.goto('/login?lang=en')
  await expect(page.locator('#root')).not.toBeEmpty()
})
