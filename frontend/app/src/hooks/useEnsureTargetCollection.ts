import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useState } from 'react'

import { api } from '@/api/client'
import type { components } from '@/api/schema'
import { fetchCollectionsPage } from '@/api/list-fetch'
import { parseProblemResponse } from '@/api/problem'
import { getLocalStorage, safeGetItem, safeSetItem } from '@/lib/browser-storage'
import { hubListKey } from '@/lib/hub-list-keys'
import { getNextPageIndex } from '@/lib/list-pagination'
import { isPersonalTeamName } from '@/lib/team-display-name'
import { canEditTeamLibrary } from '@/lib/team-permissions'
import type { Team } from '@/api/teams-sessions-fetch'

type Collection = components['schemas']['Collection']

const LAST_COLLECTION_LS = 'wv.songCreate.lastCollectionId'

function readLastCollectionFromLs(): string | null {
  const raw = safeGetItem(LAST_COLLECTION_LS, getLocalStorage())
  return raw && raw.trim() ? raw.trim() : null
}

export function writeLastCollectionToLs(collectionId: string) {
  safeSetItem(LAST_COLLECTION_LS, collectionId, getLocalStorage())
}

export type UseEnsureTargetCollectionOptions = {
  enabled: boolean
  userId: string | undefined
  teams: Team[]
}

export function useEnsureTargetCollection({
  enabled,
  userId,
  teams,
}: UseEnsureTargetCollectionOptions) {
  const queryClient = useQueryClient()
  const [collectionPick, setCollectionPick] = useState<string | null>(null)
  const [noCollectionPromptOpen, setNoCollectionPromptOpen] = useState(false)

  const writableTeams = useMemo(() => {
    if (!userId) return []
    return teams.filter((tm) => canEditTeamLibrary(tm, userId))
  }, [teams, userId])

  const {
    data: collectionsData,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
    isFetched: collectionsFetched,
  } = useInfiniteQuery({
    queryKey: hubListKey('collections', 'songTarget'),
    initialPageParam: 0,
    enabled: enabled && !!userId,
    staleTime: 60_000,
    queryFn: async ({ pageParam, signal }) => {
      const page = pageParam as number
      return fetchCollectionsPage(queryClient, { page, q: '', signal })
    },
    getNextPageParam: (_last, allPages) => getNextPageIndex(allPages),
  })

  useEffect(() => {
    if (!enabled || !hasNextPage || isFetchingNextPage) return
    void fetchNextPage()
  }, [enabled, hasNextPage, isFetchingNextPage, fetchNextPage])

  const editableCollections = useMemo(() => {
    const pages = collectionsData?.pages ?? []
    const flat = pages.flatMap((p) => p.items) as Collection[]
    if (!userId) return []
    const writableTeamIds = new Set(writableTeams.map((t) => t.id))
    return [...flat]
      .filter((c) => writableTeamIds.has(c.owner))
      .sort((a, b) => b.title.localeCompare(a.title, undefined, { numeric: true }))
  }, [collectionsData?.pages, userId, writableTeams])

  const defaultCollectionId = useMemo(() => {
    if (!enabled || !userId) return ''
    if (editableCollections.length === 0 && !collectionsFetched) return ''
    const last = readLastCollectionFromLs()
    if (last && editableCollections.some((c) => c.id === last)) return last
    const personalTeam = writableTeams.find((tm) => isPersonalTeamName(tm.name))
    if (personalTeam) {
      const onPersonal = editableCollections.find((c) => c.owner === personalTeam.id)
      if (onPersonal) return onPersonal.id
    }
    return editableCollections[0]?.id ?? ''
  }, [enabled, collectionsFetched, editableCollections, userId, writableTeams])

  const collectionId = collectionPick ?? defaultCollectionId
  const hasEditableCollection = editableCollections.length > 0

  const personalTeam = useMemo(
    () => writableTeams.find((tm) => isPersonalTeamName(tm.name)),
    [writableTeams],
  )

  const createCollectionMutation = useMutation({
    mutationFn: async (title: string) => {
      if (!personalTeam) {
        throw new Error('no_personal_team')
      }
      const { data, response } = await api.POST('/api/v1/collections', {
        body: {
          title,
          cover: 'mysongs',
          songs: [],
          owner: personalTeam.id,
        },
      })
      if (!response.ok) {
        const problem = await parseProblemResponse(response.clone())
        throw new Error(problem?.title ?? 'create_collection_failed')
      }
      return data as Collection
    },
    onSuccess: (created) => {
      void queryClient.invalidateQueries({ queryKey: hubListKey('collections', '') })
      setCollectionPick(created.id)
      writeLastCollectionToLs(created.id)
      setNoCollectionPromptOpen(false)
    },
  })

  const createPersonalCollection = useCallback(
    async (title: string) => {
      const created = await createCollectionMutation.mutateAsync(title)
      return created.id
    },
    [createCollectionMutation],
  )

  return {
    editableCollections,
    collectionId,
    setCollectionPick,
    showCollectionPicker: editableCollections.length > 1,
    hasEditableCollection,
    noCollectionPromptOpen,
    setNoCollectionPromptOpen,
    createPersonalCollection,
    createCollectionPending: createCollectionMutation.isPending,
    collectionsFetched,
    writableTeams,
  }
}
