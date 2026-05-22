import { createFileRoute, useLocation, useNavigate } from '@tanstack/react-router'
import { useCallback, useEffect, useState } from 'react'

import { TeamsListView } from '@/components/teams/TeamsListView'

export const Route = createFileRoute('/_hub/teams')({
  component: TeamsRoute,
})

function TeamsRoute() {
  const location = useLocation()
  const navigate = useNavigate()
  const [createIntent, setCreateIntent] = useState(false)

  useEffect(() => {
    const raw = (location.search as Record<string, unknown>).new
    if (raw !== '1' && raw !== 1) return
    // Latch "create team" open then strip `?new=1` from the URL; state cannot live in the URL alone.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional latch from query param
    setCreateIntent(true)
    void navigate({ to: '/teams', replace: true })
  }, [location.search, navigate])

  const onConsume = useCallback(() => setCreateIntent(false), [])

  return <TeamsListView createIntent={createIntent} onConsumeCreateIntent={onConsume} />
}
