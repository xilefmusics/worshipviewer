import { createFileRoute, Outlet } from '@tanstack/react-router'

export const Route = createFileRoute('/rooms/invite')({
  component: InviteLayout,
})

function InviteLayout() {
  return <Outlet />
}
