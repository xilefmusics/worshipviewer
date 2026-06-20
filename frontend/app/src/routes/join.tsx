import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { api } from '@/api/client'
import { problemMessageFromBody } from '@/api/problem'
import { Button } from '@/components/ui/button'
import { requireSession } from '@/lib/auth-guard'
import { teamDetailKey, teamInvitationsKey, teamsListRootKey } from '@/lib/teams-sessions-keys'

export const Route = createFileRoute('/join')({
  validateSearch: (search: Record<string, unknown>) => ({
    team_id: typeof search.team_id === 'string' ? search.team_id : '',
    invitation_id: typeof search.invitation_id === 'string' ? search.invitation_id : '',
  }),
  beforeLoad: async ({ context }) => {
    await requireSession(context)
  },
  component: JoinTeamPage,
})

function JoinTeamPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { team_id: teamId, invitation_id: invitationId } = Route.useSearch()
  const [joinErr, setJoinErr] = useState<string | null>(null)
  const ranRef = useRef(false)

  const { mutate, isPending } = useMutation({
    mutationFn: async () => {
      const { error, response } = await api.POST('/api/v1/teams/{team_id}/invitations/{invitation_id}/accept', {
        params: { path: { team_id: teamId, invitation_id: invitationId } },
      })
      if (!response.ok) {
        throw new Error(problemMessageFromBody(error, t('joinTeam.failed')))
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: teamsListRootKey })
      await queryClient.invalidateQueries({ queryKey: teamDetailKey(teamId) })
      await queryClient.invalidateQueries({ queryKey: teamInvitationsKey(teamId) })
      void navigate({ to: '/teams/$teamId', params: { teamId: teamId } })
    },
    onError: (e: Error) => {
      setJoinErr(e.message)
    },
  })

  useEffect(() => {
    if (!teamId || !invitationId) return
    if (ranRef.current) return
    ranRef.current = true
    mutate()
  }, [teamId, invitationId, mutate])

  if (!teamId || !invitationId) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-[var(--color-bg)] p-6 text-center">
        <p className="text-sm text-[var(--color-muted-foreground)]">{t('joinTeam.invalidLink')}</p>
        <Button type="button" variant="outline" onClick={() => void navigate({ to: '/teams' })}>
          {t('joinTeam.backToTeams')}
        </Button>
      </div>
    )
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-[var(--color-bg)] p-6 text-center">
      {joinErr ? (
        <>
          <p className="text-sm text-[var(--color-destructive)]" role="alert">
            {joinErr}
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            <Button type="button" variant="outline" onClick={() => void navigate({ to: '/teams' })}>
              {t('joinTeam.backToTeams')}
            </Button>
            <Button
              type="button"
              onClick={() => {
                setJoinErr(null)
                mutate()
              }}
              disabled={isPending}
            >
              {t('hub.error.retry')}
            </Button>
          </div>
        </>
      ) : teamId && invitationId ? (
        <p className="text-sm text-[var(--color-muted-foreground)]">{t('joinTeam.joining')}</p>
      ) : null}
    </div>
  )
}
