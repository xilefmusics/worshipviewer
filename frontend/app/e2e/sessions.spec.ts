import { expect, test, uniqueToken } from './fixtures/auth'
import { gotoEn, setOffline } from './helpers'

// Flow: K1
test('K1: view & revoke sessions', async ({ page, seed, context }) => {
  const token = uniqueToken('k1')
  // Seed an extra session via second user login
  await seed.mintUser(`${token}-extra@wv.test`)

  await gotoEn(page, '/sessions')
  await expect(page.getByRole('heading', { name: /sessions/i })).toBeVisible()

  // Revoke offline-disabled
  await setOffline(context, true)
  const revokeButtons = page.getByRole('button', { name: /revoke/i })
  if ((await revokeButtons.count()) > 0) {
    await expect(revokeButtons.first()).toBeDisabled()
  }
  await setOffline(context, false)

  // Revoke with confirm (if another session row exists)
  const revoke = page.getByRole('button', { name: /revoke/i }).first()
  if (await revoke.isVisible()) {
    await revoke.click()
    await page.getByRole('button', { name: /revoke session/i }).click()
  }

  const loadMore = page.getByRole('button', { name: 'Load more' })
  if (await loadMore.isVisible()) {
    await loadMore.click()
  }
})
