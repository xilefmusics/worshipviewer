import AxeBuilder from '@axe-core/playwright'

import { expect, loggedOutTest, test } from './fixtures/auth'
import { gotoEn } from './helpers'

function criticalViolations(results: Awaited<ReturnType<AxeBuilder['analyze']>>) {
  return results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious')
}

loggedOutTest('a11y: login page smoke', async ({ page }) => {
  await page.goto('/?lang=en')
  const results = await new AxeBuilder({ page }).analyze()
  expect(criticalViolations(results)).toEqual([])
})

test('a11y: hub songs list smoke', async ({ page }) => {
  await gotoEn(page, '/songs')
  const results = await new AxeBuilder({ page }).analyze()
  expect(criticalViolations(results)).toEqual([])
})

test('a11y: player route smoke', async ({ page, seed }) => {
  const coll = await seed.createCollection({ title: 'a11y-coll' })
  const song = await seed.createSong({ collection: coll.id, title: 'a11y-song' })
  await seed.patchCollection(coll.id, [song.id])
  await gotoEn(page, `/player?type=collection&id=${coll.id}&mode=normal`)
  await page.locator('body').click({ position: { x: 400, y: 300 } })
  const results = await new AxeBuilder({ page }).analyze()
  expect(criticalViolations(results)).toEqual([])
})
