import { test, expect } from './fixtures/auth'

test('unauthenticated visit redirects to the login page', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveURL(/\/login/)
  // OTP email field on the login screen proves the app booted and routed
  await expect(page.getByLabel(/email/i)).toBeVisible()
})

test('app shell mounts (root element is populated)', async ({ page }) => {
  await page.goto('/login')
  await expect(page.locator('#root')).not.toBeEmpty()
})
