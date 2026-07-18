import { useNavigate, useRouterState } from '@tanstack/react-router'
import { useCallback, useEffect, useMemo, useState } from 'react'

import type { PlayerMode } from '@/lib/player/player-mode'
import {
  parseTocLangSearch,
  parseTocTagsSearch,
  resolveTocDisplayMode,
} from '@/lib/player/player-toc-search'
import type { TocDisplayMode } from '@/lib/player/toc-display'
import { buildPlayerSearch, type PlayerEntityType } from '@/lib/player-route'

type PlayerSearch = {
  type?: PlayerEntityType
  id?: string
  index?: number
  mode?: PlayerMode
  toc?: TocDisplayMode
  tocLang?: string | string[]
  tocTags?: string | string[]
}

function usePlayerLocation() {
  const location = useRouterState({ select: (state) => state.location })
  return {
    active: location.pathname === '/player' || location.pathname === '/player/',
    search: location.search as PlayerSearch,
  }
}

function playerSearchSnapshot(
  search: PlayerSearch,
  type: PlayerEntityType,
  id: string,
  mode: PlayerMode,
) {
  return {
    type,
    id,
    index: search.index,
    mode: search.mode ?? mode,
    toc: search.toc,
    tocLang: parseTocLangSearch(search.tocLang),
    tocTags: parseTocTagsSearch(search.tocTags),
  }
}

export function usePlayerIndexSearchSync(
  type: PlayerEntityType,
  id: string,
  index: number,
  mode: PlayerMode,
) {
  const navigate = useNavigate()
  const { active, search } = usePlayerLocation()

  useEffect(() => {
    if (!active) return
    if (search.index === index) return
    void navigate({
      to: '/player',
      search: buildPlayerSearch({ ...playerSearchSnapshot(search, type, id, mode), index }),
      replace: true,
    })
  }, [active, id, index, mode, navigate, search, type])
}

export function usePlayerTocSearchSync() {
  const navigate = useNavigate()
  const { active, search } = usePlayerLocation()
  const [localSearch, setLocalSearch] = useState<{
    toc: TocDisplayMode
    tocLang: string[]
    tocTags: string[]
  }>({ toc: 'order', tocLang: [], tocTags: [] })

  const mode = active ? resolveTocDisplayMode(search.toc) : localSearch.toc
  const activeLanguageIds = useMemo(
    () => new Set(active ? parseTocLangSearch(search.tocLang) : localSearch.tocLang),
    [active, localSearch.tocLang, search.tocLang],
  )
  const activeTagIds = useMemo(
    () => new Set(active ? parseTocTagsSearch(search.tocTags) : localSearch.tocTags),
    [active, localSearch.tocTags, search.tocTags],
  )

  const updateToc = useCallback(
    (partial: {
      toc?: TocDisplayMode
      tocLang?: readonly string[]
      tocTags?: readonly string[]
    }) => {
      if (!active) {
        setLocalSearch((current) => ({
          toc: partial.toc ?? current.toc,
          tocLang: [...(partial.tocLang ?? current.tocLang)],
          tocTags: [...(partial.tocTags ?? current.tocTags)],
        }))
        return
      }
      if (!search.type || !search.id) return
      void navigate({
        to: '/player',
        search: buildPlayerSearch({
          type: search.type,
          id: search.id,
          index: search.index,
          mode: search.mode,
          toc: partial.toc ?? resolveTocDisplayMode(search.toc),
          tocLang: partial.tocLang ?? parseTocLangSearch(search.tocLang),
          tocTags: partial.tocTags ?? parseTocTagsSearch(search.tocTags),
        }),
        replace: true,
      })
    },
    [active, navigate, search.id, search.index, search.mode, search.toc, search.tocLang, search.tocTags, search.type],
  )

  const setMode = useCallback(
    (next: TocDisplayMode) => {
      updateToc({ toc: next })
    },
    [updateToc],
  )

  const setLanguageIds = useCallback(
    (languageIds: readonly string[]) => {
      updateToc({ tocLang: languageIds })
    },
    [updateToc],
  )

  const toggleLanguageId = useCallback(
    (languageId: string) => {
      const next = new Set(activeLanguageIds)
      if (next.has(languageId)) next.delete(languageId)
      else next.add(languageId)
      updateToc({ tocLang: [...next] })
    },
    [activeLanguageIds, updateToc],
  )

  const toggleTagId = useCallback(
    (tagId: string) => {
      const next = new Set(activeTagIds)
      if (next.has(tagId)) next.delete(tagId)
      else next.add(tagId)
      updateToc({ tocTags: [...next] })
    },
    [activeTagIds, updateToc],
  )

  return {
    mode,
    setMode,
    setLanguageIds,
    activeLanguageIds,
    toggleLanguageId,
    activeTagIds,
    toggleTagId,
  }
}
