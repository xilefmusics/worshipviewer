import { expect, test } from './fixtures/auth'

// Flow: L6
test('L6: Room list joins chords directly and offers fixed modes in actions', async ({ page }) => {
  await page.route('**/api/v1/rooms?**', (route) => route.fulfill({ status: 200, headers: { 'X-Total-Count': '1' }, contentType: 'application/json', body: JSON.stringify([{ id: 'room-1', name: 'Sunday Setlist — host@example.com', team_id: 'team-1', host_email: 'host@example.com', session_count: 2, av_occupied: true, created_at: new Date().toISOString() }]) }))
  await page.route('**/api/v1/rooms/room-1/join', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ room_id: 'room-1', id: 'room-1:session-1', mode: 'sheet', resume_credential: 'resume', connection_ticket: 'ticket' }) }))
  await page.goto('/rooms')

  await page.getByRole('button', { name: 'Actions for Sunday Setlist — host@example.com' }).click()
  await expect(page.getByRole('menuitem', { name: 'Chords' })).toBeEnabled()
  await expect(page.getByRole('menuitem', { name: 'Text' })).toBeEnabled()
  await expect(page.getByRole('menuitem', { name: 'AV', exact: true })).toBeDisabled()
  await expect(page.getByRole('menuitem', { name: 'Slide' })).toBeEnabled()
  await expect(page.getByRole('group', { name: 'General' })).toBeVisible()

  await page.getByRole('button', { name: 'Close', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  const joinRequest = page.waitForRequest('**/api/v1/rooms/room-1/join')
  await page.getByRole('button', { name: /^Sunday Setlist/ }).click()
  expect((await joinRequest).postDataJSON()).toEqual({ mode: 'sheet', hide_chords: false, resume_credential: null })
})

test('L6: invalid public Room invite has one terminal state', async ({ browser }) => {
  const context = await browser.newContext()
  const page = await context.newPage()
  await page.route('**/api/v1/rooms/invite/inspect', (route) => route.fulfill({ status: 404, contentType: 'application/problem+json', body: JSON.stringify({ title: 'Not Found', status: 404, code: 'not_found' }) }))
  await page.goto('/rooms/invite#invalid-secret')
  await expect(page.getByText('Room has ended')).toBeVisible()
  await context.close()
})
