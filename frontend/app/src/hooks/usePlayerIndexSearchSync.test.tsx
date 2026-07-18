import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router'
import { expect, it } from 'vitest'

import {
  usePlayerIndexSearchSync,
  usePlayerTocSearchSync,
} from '@/hooks/usePlayerIndexSearchSync'

function RoomHarness() {
  usePlayerIndexSearchSync('song', 'room-song', 0, 'normal')
  const toc = usePlayerTocSearchSync()
  return (
    <button type="button" onClick={() => toc.setMode('alphabetical')}>
      {toc.mode}
    </button>
  )
}

it('keeps player URL state local when mounted on a Player Room route', async () => {
  const rootRoute = createRootRoute({ component: Outlet })
  const roomRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/player/room/$roomId',
    component: RoomHarness,
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([roomRoute]),
    history: createMemoryHistory({ initialEntries: ['/player/room/room-1'] }),
  })

  render(<RouterProvider router={router} />)
  const mode = await screen.findByRole('button', { name: 'order' })
  await userEvent.click(mode)

  expect(mode).toHaveTextContent('alphabetical')
  expect(router.state.location.pathname).toBe('/player/room/room-1')
})
