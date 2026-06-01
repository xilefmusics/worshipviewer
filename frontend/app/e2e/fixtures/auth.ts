import { test as base, expect } from '@playwright/test'

/**
 * Hello-world / logged-out fixture.
 *
 * Mocks the session endpoint at the browser layer so no backend is required:
 * `GET /api/v1/users/me` → 401, which the app treats as "logged out" and
 * redirects to `/login`.
 *
 * A future authed fixture will instead return a `200` `User` body and stub the
 * list endpoints — captured under follow-ups in the plan, not built here.
 */
export const test = base.extend({
  page: async ({ page }, use) => {
    await page.route('**/api/v1/users/me', (route) =>
      route.fulfill({ status: 401, contentType: 'application/json', body: '{}' }),
    )
    await use(page)
  },
})

export { expect }
