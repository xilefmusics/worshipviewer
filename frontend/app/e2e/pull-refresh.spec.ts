import { expect, test, uniqueToken } from './fixtures/auth'
import { HubPage } from './pages/hub'

// Flow: L1 — touch pull-to-refresh (iphone project only)
test('L1: pull-to-refresh touch gesture', async ({ page, seed }) => {
  const token = uniqueToken('l1-ptr')
  await seed.createCollection({ title: `${token}-ptr` })
  const hub = new HubPage(page)
  await hub.goto('/collections')

  const scrollport = page.locator('main')
  await expect(scrollport).toBeVisible()
  const box = await scrollport.boundingBox()
  if (!box) throw new Error('scrollport missing')

  const x = box.x + box.width / 2
  const startY = box.y + 24
  await page.touchscreen.tap(x, startY)
  await page.evaluate(
    ({ x, startY, endY }) => {
      const el = document.querySelector('main')
      if (!el) return
      el.scrollTop = 0
      const touchInit = { bubbles: true, cancelable: true, touches: [] as Touch[] }
      const start = new Touch({ identifier: 1, target: el, clientX: x, clientY: startY })
      el.dispatchEvent(new TouchEvent('touchstart', { ...touchInit, touches: [start] }))
      const move = new Touch({ identifier: 1, target: el, clientX: x, clientY: endY })
      el.dispatchEvent(new TouchEvent('touchmove', { ...touchInit, touches: [move] }))
      el.dispatchEvent(new TouchEvent('touchend', { ...touchInit, changedTouches: [move] }))
    },
    { x, startY, endY: startY + 72 },
  )

  await expect(page.getByText(/refreshing|pull to refresh|release to refresh/i)).toBeVisible({
    timeout: 10_000,
  })
})
