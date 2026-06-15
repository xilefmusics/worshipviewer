import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { fetchTeamsPage, TEAMS_PAGE_SIZE, type Team } from '@/api/teams-sessions-fetch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useHubSearch } from '@/hooks/useHubSearch'
import { useOnline } from '@/hooks/use-online'
import { useSession } from '@/hooks/useSession'
import { getNextPageIndex } from '@/lib/list-pagination'
import { getTeamDisplayName } from '@/lib/team-display-name'
import { teamsListRootKey } from '@/lib/teams-sessions-keys'
import { cn } from '@/lib/utils'

const allTeamsSelectValue = '__all_teams__'

type HubTeamFilterSelectProps = {
  id?: string
  className?: string
  triggerClassName?: string
}

export function HubTeamFilterSelect({
  id = 'hub-team-filter',
  className,
  triggerClassName,
}: HubTeamFilterSelectProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const { data: user } = useSession()
  const online = useOnline()
  const { selectedTeamId, setSelectedTeamId } = useHubSearch()
  const teamsQ = useInfiniteQuery({
    queryKey: [...teamsListRootKey, 'hubTeamFilter', ''] as const,
    initialPageParam: 0,
    enabled: online,
    networkMode: 'always',
    staleTime: online ? 0 : Number.POSITIVE_INFINITY,
    queryFn: async ({ pageParam, signal }) => {
      const page = pageParam as number
      return fetchTeamsPage(queryClient, { page, q: '', signal })
    },
    getNextPageParam: (last, all) => {
      const nextFromTotal = getNextPageIndex(all)
      if (nextFromTotal !== undefined) return nextFromTotal
      if (last.total !== undefined) return undefined
      return last.items.length >= TEAMS_PAGE_SIZE ? all.length : undefined
    },
  })
  const { data, fetchNextPage, hasNextPage, isError, isFetchingNextPage, isPending } = teamsQ

  useEffect(() => {
    if (!online) return
    if (hasNextPage && !isFetchingNextPage) {
      void fetchNextPage()
    }
  }, [fetchNextPage, hasNextPage, isFetchingNextPage, online])

  const teams = useMemo(() => {
    const byId = new Map<string, Team>()
    for (const page of data?.pages ?? []) {
      for (const team of page.items) byId.set(team.id, team)
    }
    return Array.from(byId.values())
  }, [data?.pages])

  useEffect(() => {
    if (selectedTeamId && teams.length > 0 && !teams.some((team) => team.id === selectedTeamId)) {
      setSelectedTeamId(null)
    }
  }, [selectedTeamId, setSelectedTeamId, teams])

  if (teams.length === 0 && (!online || isError)) return null
  const isLoadingTeams = teams.length === 0 && isPending

  return (
    <div className={cn('min-w-0', className)}>
      <label htmlFor={id} className="sr-only">
        {t('hub.filters.teamLabel')}
      </label>
      <Select
        value={selectedTeamId ?? allTeamsSelectValue}
        onValueChange={(value) => {
          setSelectedTeamId(value === allTeamsSelectValue ? null : value)
        }}
        disabled={teams.length === 0}
      >
        <SelectTrigger
          id={id}
          aria-label={t('hub.filters.teamAria')}
          className={cn('h-9 rounded-full bg-[var(--color-surface)] shadow-sm', triggerClassName)}
        >
          {isLoadingTeams ? (
            <span className="truncate text-[var(--color-muted-foreground)]">
              {t('hub.filters.loadingTeams')}
            </span>
          ) : (
            <SelectValue />
          )}
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={allTeamsSelectValue}>{t('hub.filters.allTeams')}</SelectItem>
          {teams.map((team) => (
            <SelectItem key={team.id} value={team.id}>
              {getTeamDisplayName(team, user?.id, t)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
