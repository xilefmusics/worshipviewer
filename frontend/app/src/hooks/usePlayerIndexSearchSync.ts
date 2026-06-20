import { getRouteApi, useNavigate } from '@tanstack/react-router'
import { useCallback, useEffect, useMemo } from 'react'

import type { PlayerMode } from '@/lib/player/player-mode'
import {
  parseTocLangSearch,
  parseTocTagsSearch,
  resolveTocDisplayMode,
} from '@/lib/player/player-toc-search'
import type { TocDisplayMode } from '@/lib/player/toc-display'
import { buildPlayerSearch, type PlayerEntityType } from '@/lib/player-route'

const playerRoute = getRouteApi('/player/')

function playerSearchSnapshot(
  search: ReturnType<typeof playerRoute.useSearch>,
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
  const search = playerRoute.useSearch({
    select: (state) => ({
      index: state.index,
      mode: state.mode,
      toc: state.toc,
      tocLang: state.tocLang,
      tocTags: state.tocTags,
    }),
  })

  useEffect(() => {
    if (search.index === index) return
    void navigate({
      to: '/player',
      search: buildPlayerSearch({ ...playerSearchSnapshot(search, type, id, mode), index }),
      replace: true,
    })
  }, [id, index, mode, navigate, search, type])
}

export function usePlayerTocSearchSync() {
  const navigate = useNavigate()
  const search = playerRoute.useSearch({
    select: (state) => ({
      type: state.type,
      id: state.id,
      index: state.index,
      mode: state.mode,
      toc: state.toc,
      tocLang: state.tocLang,
      tocTags: state.tocTags,
    }),
  })

  const mode = resolveTocDisplayMode(search.toc)
  const activeLanguageIds = useMemo(
    () => new Set(parseTocLangSearch(search.tocLang)),
    [search.tocLang],
  )
  const activeTagIds = useMemo(() => new Set(parseTocTagsSearch(search.tocTags)), [search.tocTags])

  const updateToc = useCallback(
    (partial: {
      toc?: TocDisplayMode
      tocLang?: readonly string[]
      tocTags?: readonly string[]
    }) => {
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
    [navigate, search.id, search.index, search.mode, search.toc, search.tocLang, search.tocTags, search.type],
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
