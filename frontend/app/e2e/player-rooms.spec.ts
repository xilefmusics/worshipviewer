import { expect, test } from './fixtures/auth'

// Flow: L6
test('L6: Player Room list offers fixed modes and disables occupied AV', async ({ page }) => {
  await page.route('**/api/v1/player-rooms?**', (route) => route.fulfill({ status: 200, headers: { 'X-Total-Count': '1' }, contentType: 'application/json', body: JSON.stringify([{ id: 'room-1', name: 'Sunday Setlist — host@example.com', team_id: 'team-1', source_type: 'setlist', source_id: 'setlist-1', source_title: 'Sunday Setlist', host_email: 'host@example.com', participant_count: 2, av_occupied: true, created_at: new Date().toISOString() }]) }))
  await page.goto('/player-rooms')
  await page.getByRole('button', { name: /^Sunday Setlist/ }).click()
  await expect(page.getByRole('tab', { name: 'Chords' })).toBeEnabled()
  await expect(page.getByRole('tab', { name: 'AV', exact: true })).toBeDisabled()
  await expect(page.getByRole('tab', { name: 'Slide' })).toBeEnabled()
  await expect(page.getByRole('button', { name: 'Join' })).toBeEnabled()
})

test('L6: invalid public Player Room invite has one terminal state', async ({ browser }) => {
  const context = await browser.newContext()
  const page = await context.newPage()
  await page.route('**/api/v1/player-rooms/invite/inspect', (route) => route.fulfill({ status: 404, contentType: 'application/problem+json', body: JSON.stringify({ title: 'Not Found', status: 404, code: 'not_found' }) }))
  await page.goto('/player-rooms/invite#invalid-secret')
  await expect(page.getByText('Player Room has ended')).toBeVisible()
  await context.close()
})
