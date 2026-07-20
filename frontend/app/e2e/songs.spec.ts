import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { expect, secondUserTest, test, uniqueToken } from './fixtures/auth'
import { HubPage } from './pages/hub'
import { openContextMenu, setOffline, waitForToast } from './helpers'

// Flow: D1
test('D1: open the song create chooser', async ({ page, context }) => {
  const hub = new HubPage(page)
  await hub.goto('/songs')
  await hub.createFab('Create song').click()
  await expect(page.getByRole('button', { name: 'New song' })).toBeEnabled()

  // Imports are enabled when online + writable team
  await expect(page.getByRole('button', { name: 'Import files' })).toBeEnabled()
  await expect(page.getByRole('button', { name: 'Import from Ultimate Guitar' })).toBeEnabled()

  await setOffline(context, true)
  await expect(page.getByRole('button', { name: 'Import files' })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Import from Ultimate Guitar' })).toBeDisabled()
  await setOffline(context, false)
})

// Flow: D2
secondUserTest('D2: create song with one editable collection', async ({ secondUser }) => {
  const token = uniqueToken('d2')
  const { page, seed } = secondUser
  await seed.createCollection({ title: `${token}-only` })
  const hub = new HubPage(page)
  await hub.goto('/songs')
  await hub.createFab('Create song').click()
  await page.getByRole('button', { name: 'New song' }).click()
  const dialog = page.getByRole('dialog', { name: 'New song' })
  await expect(dialog.getByLabel(/collection/i)).not.toBeVisible()
  await dialog.getByRole('button', { name: 'Create' }).click()
  await expect(page).toHaveURL(/\/songs\/[^/]+/)
})

// Flow: D3
test('D3: create song with multiple collections', async ({ page, seed }) => {
  const token = uniqueToken('d3')
  const personalId = await seed.getPersonalTeamId()
  await seed.createCollection({ title: `${token}-a`, owner: personalId })
  const collB = await seed.createCollection({ title: `${token}-b`, owner: personalId })
  const hub = new HubPage(page)
  await hub.goto('/songs')
  await hub.createFab('Create song').click()
  await page.getByRole('button', { name: 'New song' }).click()
  const dialog = page.getByRole('dialog', { name: 'New song' })
  await dialog.getByLabel(/collection/i).click()
  await page.getByRole('option').filter({ hasText: collB.title }).click()
  await dialog.getByRole('button', { name: 'Create' }).click()
  await expect(page).toHaveURL(/\/songs\/[^/]+/)
})

// Flow: D4
secondUserTest('D4: create song with no collection yet', async ({ secondUser }) => {
  const { page } = secondUser
  const hub = new HubPage(page)
  await hub.goto('/songs')
  await hub.createFab('Create song').click()
  await page.getByRole('button', { name: 'New song' }).click()
  const dialog = page.getByRole('dialog', { name: 'New song' })
  await dialog.getByRole('button', { name: 'Create' }).click()
  await expect(page.getByText(/no collection yet|create collection/i)).toBeVisible()
  await page.getByRole('button', { name: /create collection/i }).click()
  await expect(page).toHaveURL(/\/songs\/[^/]+/)
})

// Flow: D5
test('D5: import songs (files)', async ({ page, seed, context }) => {
  const token = uniqueToken('d5')
  await seed.createCollection({ title: `${token}-import` })
  const hub = new HubPage(page)
  await hub.goto('/songs')
  await hub.createFab('Create song').click()

  await setOffline(context, true)
  await expect(page.getByRole('button', { name: 'Import files' })).toBeDisabled()
  await setOffline(context, false)

  await page.getByRole('button', { name: 'Import files' }).click()
  const dialog = page.getByRole('dialog', { name: 'Import songs' })
  await expect(dialog).toBeVisible()
  const samplePath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'sample.chordpro')
  await dialog.locator('input[type="file"]').setInputFiles(samplePath)
  await dialog.getByRole('button', { name: /import/i }).click()
  await expect(page.getByText(/imported|created/i)).toBeVisible({ timeout: 20_000 })
  await hub.goto('/songs')
  await hub.search('E2E Import Song')
  await expect(hub.row(/E2E Import Song/i)).toBeVisible({ timeout: 15_000 })
})

// Flow: D6
test('D6: add a song to a setlist (context menu)', async ({ page, seed, context }) => {
  const token = uniqueToken('d6')
  const coll = await seed.createCollection({ title: `${token}-c` })
  await seed.createSong({ collection: coll.id, title: `${token}-song` })
  const setlist = await seed.createSetlist({ title: `${token}-sl` })
  const hub = new HubPage(page)
  await hub.goto('/songs')
  await hub.search(`${token}-song`)
  await openContextMenu(page, `${token}-song`)
  await hub.menuItem('Add to setlist').click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel(/setlist/i).click()
  await page.getByRole('option').filter({ hasText: setlist.title }).click()
  await dialog.getByRole('button', { name: 'Add' }).click()
  await waitForToast(page, /Added to/i)

  // Offline disables
  await setOffline(context, true)
  await hub.goto('/songs')
  await hub.search(`${token}-song`)
  await openContextMenu(page, `${token}-song`)
  await expect(hub.menuItem('Add to setlist')).toHaveAttribute('data-disabled', 'true').or(
    expect(hub.menuItem('Add to setlist')).toBeDisabled(),
  )
  await setOffline(context, false)

  // not_a_song hides item
  await seed.createSong({ collection: coll.id, title: `${token}-nas`, not_a_song: true })
  await hub.goto('/songs')
  await hub.search(`${token}-nas`)
  await openContextMenu(page, `${token}-nas`)
  await expect(hub.menuItem('Add to setlist')).toHaveCount(0)
})

// Flow: D7
test('D7: import a song from Ultimate Guitar page source', async ({ page, seed }) => {
  const token = uniqueToken('d7')
  await seed.createCollection({ title: `${token}-import` })
  const hub = new HubPage(page)
  await hub.goto('/songs')
  await hub.createFab('Create song').click()
  await page.getByRole('button', { name: 'Import from Ultimate Guitar' }).click()

  const dialog = page.getByRole('dialog', { name: 'Import from Ultimate Guitar' })
  await expect(dialog.getByRole('link', { name: 'Open Ultimate Guitar' })).toHaveAttribute(
    'target',
    '_blank',
  )
  await expect(dialog.getByLabel('Control + U')).toBeVisible()
  await expect(dialog.getByLabel('Option + Command + U')).toHaveCount(0)

  const dataContent = JSON.stringify({
    store: {
      page: {
        data: {
          tab_view: { wiki_tab: { content: 'Tempo: 120\n[Verse 1]\n[ch]C[/ch] Test lyrics' } },
          tab: { song_name: `${token} UG Song`, artist_name: 'Test Artist', tonality_name: 'C' },
        },
      },
    },
  }).replaceAll('"', '&quot;')
  const html = `<!DOCTYPE html><html><body><div class="js-store" data-content="${dataContent}"></div></body></html>`

  await dialog.getByLabel('Ultimate Guitar page source').fill(html)
  await dialog.getByRole('button', { name: 'Process' }).click()
  await expect(page).toHaveURL(/\/songs\/[^/]+/, { timeout: 20_000 })
  await expect(page.getByLabel('Title 1').first()).toHaveValue(`${token} UG Song`, {
    timeout: 20_000,
  })
})

test('Ultimate Guitar import rejects invalid source without creating a song', async ({ page, seed }) => {
  const token = uniqueToken('d7-invalid')
  await seed.createCollection({ title: `${token}-import` })
  let createRequests = 0
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().endsWith('/api/v1/songs')) {
      createRequests += 1
    }
  })

  const hub = new HubPage(page)
  await hub.goto('/songs')
  await hub.createFab('Create song').click()
  await page.getByRole('button', { name: 'Import from Ultimate Guitar' }).click()
  const dialog = page.getByRole('dialog', { name: 'Import from Ultimate Guitar' })
  await dialog.getByLabel('Ultimate Guitar page source').fill('<html><body>Other site</body></html>')
  await dialog.getByRole('button', { name: 'Process' }).click()

  await expect(dialog.getByRole('alert')).toContainText('does not look like Ultimate Guitar')
  await expect(dialog).toBeVisible()
  expect(createRequests).toBe(0)
})
