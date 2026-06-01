import { expect, test } from './fixtures/auth'
import { gotoEn, setOffline } from './helpers'

// Flow: K1
test('K1: view & revoke sessions', async ({ page, seed, context }) => {
  await seed.createExtraSessionsForCurrentUser(2)

  await gotoEn(page, '/sessions')
  await expect(page.getByRole('heading', { name: /sessions/i })).toBeVisible()

  const revokeButtons = page.getByRole('button', { name: /revoke/i })
  await expect(revokeButtons.first()).toBeVisible({ timeout: 10_000 })

  // Revoke offline-disabled
  await setOffline(context, true)
  await expect(revokeButtons.first()).toBeDisabled()
  await setOffline(context, false)

  // Revoke with confirm
  const revokeCountBefore = await revokeButtons.count()
  await revokeButtons.first().click()
  await page.getByRole('button', { name: /revoke session/i }).click()
  await expect(page.getByRole('button', { name: /revoke/i })).toHaveCount(revokeCountBefore - 1, {
    timeout: 10_000,
  })
})

test('K1: load more sessions when paginated', async ({ page, seed }) => {
  await seed.createExtraSessionsForCurrentUser(51)
  await gotoEn(page, '/sessions')
  const loadMore = page.getByRole('button', { name: 'Load more' })
  await expect(loadMore).toBeVisible({ timeout: 15_000 })
  await loadMore.click()
  await expect(loadMore).not.toBeVisible({ timeout: 10_000 })
})
