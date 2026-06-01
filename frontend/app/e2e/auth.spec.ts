import { loggedOutTest, expect, test, goto, uniqueToken, addSessionCookie } from './fixtures/auth'
import { LoginPage } from './pages/login'
import { gotoEn } from './helpers'

// Flow: A1 — frontend-user-flows.md › A. Authentication & entry
loggedOutTest('A1: sign in with email one-time code', async ({ page }) => {
  const login = new LoginPage(page)

  // OTP request fail keeps email step
  await page.route('**/auth/otp/request', (route) =>
    route.fulfill({ status: 429, contentType: 'application/problem+json', body: JSON.stringify({ title: 'Too many requests' }) }),
  )
  await login.goto()
  await login.emailInput().fill('fail@wv.test')
  await login.sendCodeButton().click()
  await expect(login.alert()).toBeVisible()
  await expect(login.emailInput()).toBeVisible()
  await expect(login.codeInput()).not.toBeVisible()

  // Successful request → code step (mock only request, not verify/login)
  await page.unroute('**/auth/otp/request')
  await page.route('**/auth/otp/request', (route) => route.fulfill({ status: 204, body: '' }))
  await login.sendCodeButton().click()
  await expect(login.codeInput()).toBeVisible()

  // "Use a different email" returns to email step
  await login.useDifferentEmailButton().click()
  await expect(login.emailInput()).toBeVisible()
  await expect(login.codeInput()).not.toBeVisible()

  // Back to code step
  await login.sendCodeButton().click()
  await expect(login.codeInput()).toBeVisible()

  // Code < 4 chars — verify button disabled
  await login.codeInput().fill('12')
  await expect(login.verifyButton()).toBeDisabled()

  // Verify fail stays on code step
  await page.route('**/auth/otp/verify', (route) =>
    route.fulfill({ status: 400, contentType: 'application/problem+json', body: JSON.stringify({ title: 'Invalid code' }) }),
  )
  await login.codeInput().fill('123456')
  await login.verifyButton().click()
  await expect(login.alert()).toBeVisible()
  await expect(login.codeInput()).toBeVisible()
})

// Flow: A2
loggedOutTest('A2: sign in with Google', async ({ page }) => {
  const login = new LoginPage(page)
  await login.goto('/collections')
  await page.route('**/auth/login**', (route) => {
    const url = route.request().url()
    expect(url).toContain('/auth/login?redirect_to=')
    return route.fulfill({ status: 302, headers: { Location: '/login?lang=en' } })
  })
  await login.googleButton().click()
})

// Flow: A3
test('A3: index / signed-in / 404 redirects', async ({ page, context }) => {
  // /login while signed in → /
  await goto(page, '/login')
  await expect(page).toHaveURL(/\/collections/)

  // / → /collections
  await goto(page, '/')
  await expect(page).toHaveURL(/\/collections/)

  // Protected w/o session → /login?return_to=
  const loggedOut = await context.browser()!.newContext({ locale: 'en-US' })
  const guestPage = await loggedOut.newPage()
  await guestPage.goto('/collections?lang=en')
  await expect(guestPage).toHaveURL(/\/login\?.*return_to=/)
  await loggedOut.close()

  // Unknown path → 404 with Back home / Sign out
  await goto(page, '/this-route-does-not-exist')
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Back home' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible()
})

// Flow: A4
test('A4: log out clears local data', async ({ seed, browser, baseURL }) => {
  const token = uniqueToken('a4')
  let user = await seed.mintUser(`${token}@wv.test`)

  async function authedPage() {
    const context = await browser.newContext({ locale: 'en-US' })
    await addSessionCookie(context, user.sessionId, baseURL!)
    return { context, page: await context.newPage() }
  }

  async function reauth() {
    user = await seed.createSessionForUser(user.userId, user.email)
  }

  {
    const { context, page } = await authedPage()
    await goto(page, '/logout')
    await expect(page).toHaveURL(/\/login/)
    await context.close()
    await reauth()
  }

  {
    const { context, page } = await authedPage()
    await goto(page, '/no-such-route-xyz')
    await page.getByRole('button', { name: 'Sign out' }).click()
    await expect(page).toHaveURL(/\/login/)
    await context.close()
    await reauth()
  }

  {
    const { context, page } = await authedPage()
    await goto(page, '/settings')
    await page.getByRole('button', { name: 'Log out' }).click()
    await expect(page).toHaveURL(/\/login/)
    await context.close()
    await reauth()
  }

  {
    const { context, page } = await authedPage()
    await goto(page, '/collections')
    await page.getByRole('button', { name: 'Open profile menu' }).click()
    await page.getByRole('menuitem', { name: 'Log out' }).click()
    await expect(page).toHaveURL(/\/login/)
    await context.close()
    await reauth()
  }

  {
    const { context, page } = await authedPage()
    await goto(page, '/collections')
    await context.setOffline(true)
    await page.getByRole('button', { name: 'Open profile menu' }).click()
    await page.getByRole('menuitem', { name: 'Log out' }).click()
    await expect(page).toHaveURL(/\/login/)
    await context.close()
  }
})

// Flow: A5
loggedOutTest('A5: accept a team invitation (/join)', async ({ page }) => {
  await gotoEn(page, '/join')
  await expect(page).toHaveURL(/\/login.*return_to=/)
})

test('A5: accept a team invitation — authed branches', async ({ page, seed, baseURL }) => {
  const token = uniqueToken('join')
  const team = await seed.createTeam(`${token}-team`)
  const invite = await seed.createInvitation(team.id)
  const guest = await seed.mintUser(`${token}-guest@wv.test`)

  // Missing params
  await goto(page, '/join')
  await expect(page.getByText(/missing required information/i)).toBeVisible()
  await page.getByRole('button', { name: 'Back to teams' }).click()
  await expect(page).toHaveURL(/\/teams/)

  // Accept OK → /teams/:id (as guest)
  const guestCtx = await page.context().browser()!.newContext({ locale: 'en-US' })
  await guestCtx.addCookies([{ name: 'sso_session', value: guest.sessionId, url: baseURL! }])
  const guestPage = await guestCtx.newPage()
  await gotoEn(guestPage, `/join?team_id=${team.id}&invitation_id=${invite.id}`)
  await expect(guestPage).toHaveURL(new RegExp(`/teams/${team.id}`))
  await guestCtx.close()

  // Error → Retry / Back (invalid invitation for already-used invite on second accept attempt)
  const badCtx = await page.context().browser()!.newContext({ locale: 'en-US' })
  await badCtx.addCookies([{ name: 'sso_session', value: guest.sessionId, url: baseURL! }])
  const badPage = await badCtx.newPage()
  await gotoEn(badPage, `/join?team_id=${team.id}&invitation_id=${invite.id}`)
  await expect(badPage.getByRole('alert')).toBeVisible()
  await expect(badPage.getByRole('button', { name: 'Retry' })).toBeVisible()
  await expect(badPage.getByRole('button', { name: 'Back to teams' })).toBeVisible()
  await badCtx.close()
})
