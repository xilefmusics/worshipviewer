import { createFileRoute } from '@tanstack/react-router'

import { HubShell } from '@/components/hub/HubShell'
import { requireSession } from '@/lib/auth-guard'

export const Route = createFileRoute('/_hub')({
  beforeLoad: async ({ context }) => {
    await requireSession(context)
  },
  component: HubShell,
})
