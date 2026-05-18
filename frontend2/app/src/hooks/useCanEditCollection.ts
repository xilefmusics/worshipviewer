import { useTeamDetail } from '@/hooks/useTeamDetail'
import { useSession } from '@/hooks/useSession'
import { canEditTeamLibrary } from '@/lib/team-permissions'

export function useCanEditCollection(ownerTeamId: string | undefined) {
  const { data: user } = useSession()
  const { data: team, isFetched } = useTeamDetail(ownerTeamId ?? '', {
    enabled: Boolean(ownerTeamId && user?.id),
  })
  const canEdit = Boolean(user?.id && team && canEditTeamLibrary(team, user.id))
  return { canEdit, team, isFetched, user }
}
