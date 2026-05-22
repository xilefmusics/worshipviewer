import { Outlet, useNavigate, useRouterState } from '@tanstack/react-router'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { api } from '@/api/client'
import { parseProblemResponse } from '@/api/problem'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { CommandPalette } from '@/components/hub/CommandPalette'
import { SetlistPaletteRegistrarProvider } from '@/context/SetlistPaletteBridgeContext'
import type { SetlistPaletteBridge } from '@/lib/setlist-palette-bridge'
import { HUB_SEARCH_INPUT_CLASS } from '@/components/hub/hub-search-styles'
import { HubTabBar } from '@/components/hub/HubTabBar'
import { ChevronLeftIcon } from '@/components/icons/lucide-animated/chevron-left-icon'
import { PencilIcon } from '@/components/icons/lucide-animated/pencil-icon'
import { SearchIcon } from '@/components/icons/lucide-animated/search-icon'
import { IconHubPlus } from '@/components/icons/hub-tab-icons'
import { ProfileMenu } from '@/components/hub/ProfileMenu'
import { HubScrollContainerRefContext } from '@/context/HubScrollContainerContext'
import { HubSearchProvider } from '@/context/HubSearchProvider'
import { useHubSearch } from '@/hooks/useHubSearch'
import { useOnline } from '@/hooks/use-online'
import { useSession } from '@/hooks/useSession'
import { useTeamDetail } from '@/hooks/useTeamDetail'
import { useCollectionDetailQuery } from '@/hooks/useCollectionDetailQuery'
import { useSetlistDetailQuery } from '@/hooks/useSetlistDetailQuery'
import { useSongDetailQuery } from '@/hooks/useSongDetailQuery'
import { getTeamDisplayName, isPersonalTeamName } from '@/lib/team-display-name'
import {
  buildPlayerReturnSearch,
  parsePlayerEditorReturnSearch,
} from '@/lib/player/player-editor-return'
import { isUserTeamAdmin } from '@/lib/team-permissions'
import { teamDetailKey, teamsListRootKey } from '@/lib/teams-sessions-keys'
import { cn } from '@/lib/utils'

/** Hub chrome rows: full width up to ~90% of max-w-2xl so header search + footer tabs share one column. */
const hubChromeRowClass = 'flex w-full min-w-0 max-w-[37.8rem]'
/** Same gap as between header search and profile (`gap-[0.72rem]`). */
const hubChromeRowLayoutClass = 'items-center gap-[0.72rem]'
const hubDetailBackButtonClass =
  'my-[0.36rem] size-[3.6rem] shrink-0 rounded-full shadow-[var(--shadow-elevated)]'

/** Hub list tab id from pathname; stable when only a sub-segment changes (e.g. `/songs` → `/songs/:id`). */
function hubSearchSectionKey(pathname: string): string | null {
  const seg = pathname.split('/').filter(Boolean)[0]
  if (
    seg === 'collections' ||
    seg === 'songs' ||
    seg === 'setlists' ||
    seg === 'teams' ||
    seg === 'sessions'
  )
    return seg
  return null
}

function SessionLoadingFallback({ label }: { label: string }) {
  const reduceMotion = useReducedMotion()
  return (
    <motion.div
      className="flex min-h-dvh flex-col items-center justify-center gap-3 p-6 text-[var(--color-muted-foreground)]"
      initial={reduceMotion ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={reduceMotion ? { duration: 0 } : { duration: 0.28, ease: [0.25, 0.1, 0.25, 1] }}
    >
      <motion.span
        className="h-1.5 w-1.5 rounded-full bg-[var(--color-muted-foreground)]/55"
        aria-hidden
        animate={
          reduceMotion ? undefined : { opacity: [0.35, 1, 0.35], scale: [0.9, 1, 0.9] }
        }
        transition={
          reduceMotion ? undefined : { duration: 1.05, repeat: Infinity, ease: 'easeInOut' }
        }
      />
      <span>{label}</span>
    </motion.div>
  )
}

function HubChrome({
  children,
  searchAnchorRef,
  searchInputRef,
  paletteOpen,
}: {
  children: React.ReactNode
  searchAnchorRef: React.RefObject<HTMLDivElement | null>
  searchInputRef: React.RefObject<HTMLInputElement | null>
  paletteOpen: boolean
}) {
  const { t } = useTranslation()
  const { data: user } = useSession()
  const queryClient = useQueryClient()
  const { qInput, setQInput } = useHubSearch()
  const navigate = useNavigate()
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const locationSearch = useRouterState({ select: (s) => s.location.search })
  const isTeamsList = pathname === '/teams'
  const isTeamDetail = pathname.startsWith('/teams/') && pathname !== '/teams'
  const teamDetailId = isTeamDetail ? pathname.slice('/teams/'.length) : ''
  const isSetlistDetail = /^\/setlists\/[^/]+$/.test(pathname)
  const setlistEditorId = isSetlistDetail ? pathname.slice('/setlists/'.length) : ''
  const isCollectionDetail = /^\/collections\/[^/]+$/.test(pathname)
  const collectionEditorId = isCollectionDetail ? pathname.slice('/collections/'.length) : ''
  const isSongDetail = /^\/songs\/[^/]+$/.test(pathname)
  const songEditorId = isSongDetail ? pathname.slice('/songs/'.length) : ''
  const songEditorPlayerReturn = isSongDetail
    ? parsePlayerEditorReturnSearch(locationSearch as Record<string, unknown>)
    : null
  const setlistEditorPlayerReturn = isSetlistDetail
    ? parsePlayerEditorReturnSearch(locationSearch as Record<string, unknown>)
    : null
  const collectionEditorPlayerReturn = isCollectionDetail
    ? parsePlayerEditorReturnSearch(locationSearch as Record<string, unknown>)
    : null
  const { data: headerSetlist } = useSetlistDetailQuery(isSetlistDetail ? setlistEditorId : '')
  const { data: headerCollection } = useCollectionDetailQuery(isCollectionDetail ? collectionEditorId : '')
  const { data: headerSong } = useSongDetailQuery(isSongDetail ? songEditorId : '')
  const hideHubPlus =
    pathname === '/sessions' ||
    pathname === '/settings' ||
    isTeamDetail ||
    isSetlistDetail ||
    isCollectionDetail ||
    isSongDetail
  const showFooter = !isTeamDetail && !isSetlistDetail && !isCollectionDetail && !isSongDetail
  const reduceMotion = useReducedMotion()
  const [createHovered, setCreateHovered] = useState(false)
  const [searchFieldHovered, setSearchFieldHovered] = useState(false)
  const [searchFocused, setSearchFocused] = useState(false)
  const [detailTitleHovered, setDetailTitleHovered] = useState(false)
  const [isEditingDetailTitle, setIsEditingDetailTitle] = useState(false)
  const [detailTitleDraft, setDetailTitleDraft] = useState('')
  const searchIconActive = searchFieldHovered || searchFocused
  const mainScrollRef = useRef<HTMLElement>(null)
  const detailTitleInputRef = useRef<HTMLInputElement>(null)
  const prevHubSectionRef = useRef<string | null>(null)
  const online = useOnline()
  const { data: detailTeam } = useTeamDetail(teamDetailId, { enabled: isTeamDetail })
  const canEditTeamTitle = Boolean(
    isTeamDetail &&
      detailTeam &&
      user &&
      !isPersonalTeamName(detailTeam.name) &&
      isUserTeamAdmin(detailTeam, user.id),
  )

  const patchTeamName = useMutation({
    mutationFn: async (name: string) => {
      const { response } = await api.PATCH('/api/v1/teams/{id}', {
        params: { path: { id: teamDetailId } },
        body: { name },
      })
      if (!response.ok) {
        const problem = await parseProblemResponse(response.clone())
        throw new Error(problem?.title ?? t('teams.saveFailed'))
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: teamDetailKey(teamDetailId) })
      void queryClient.invalidateQueries({ queryKey: teamsListRootKey })
    },
  })

  const hubSectionKey = hubSearchSectionKey(pathname)
  useEffect(() => {
    const prev = prevHubSectionRef.current
    if (prev !== null && hubSectionKey !== null && hubSectionKey !== prev) {
      setQInput('')
    }
    prevHubSectionRef.current = hubSectionKey
  }, [hubSectionKey, setQInput])

  useEffect(() => {
    if (!isEditingDetailTitle) return
    detailTitleInputRef.current?.focus()
    detailTitleInputRef.current?.select()
  }, [isEditingDetailTitle])

  if (!user) return null

  const detailTitle = isTeamDetail
    ? detailTeam
      ? getTeamDisplayName(detailTeam, user.id, t)
      : t('common.load')
    : ''

  async function saveDetailTitleIfChanged() {
    if (!canEditTeamTitle || !detailTeam) {
      setIsEditingDetailTitle(false)
      return
    }
    const trimmed = detailTitleDraft.trim()
    if (!trimmed || trimmed === detailTeam.name) {
      setDetailTitleDraft(detailTeam.name)
      setIsEditingDetailTitle(false)
      return
    }
    try {
      await patchTeamName.mutateAsync(trimmed)
      setIsEditingDetailTitle(false)
    } catch {
      setDetailTitleDraft(detailTeam.name)
      setIsEditingDetailTitle(false)
    }
  }

  return (
    <div className="flex h-dvh max-h-dvh min-h-0 flex-col overflow-hidden">
      <header
        className={cn(
          'fixed left-0 right-0 top-0 z-40 flex justify-center bg-transparent px-3 pt-[calc(0.675rem+env(safe-area-inset-top,0px))]',
        )}
      >
        <div className={cn(hubChromeRowClass, hubChromeRowLayoutClass)}>
          {isTeamDetail ? (
            <>
              <Button
                type="button"
                size="icon"
                variant="outline"
                onClick={() => void navigate({ to: '/teams' })}
                className={hubDetailBackButtonClass}
                aria-label={t('teams.backToList')}
              >
                <ChevronLeftIcon className="text-[var(--color-foreground)]" size={20} />
              </Button>
              <div
                ref={searchAnchorRef}
                className={cn(
                  'group relative my-[0.36rem] min-w-0 flex-1',
                )}
                onMouseEnter={() => setDetailTitleHovered(true)}
                onMouseLeave={() => setDetailTitleHovered(false)}
              >
                {isEditingDetailTitle ? (
                  <Input
                    ref={detailTitleInputRef}
                    type="text"
                    value={detailTitleDraft}
                    onChange={(e) => setDetailTitleDraft(e.target.value)}
                    onBlur={() => void saveDetailTitleIfChanged()}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        void saveDetailTitleIfChanged()
                      } else if (e.key === 'Escape') {
                        e.preventDefault()
                        setDetailTitleDraft(detailTeam?.name ?? '')
                        setIsEditingDetailTitle(false)
                      }
                    }}
                    maxLength={120}
                    className={cn(HUB_SEARCH_INPUT_CLASS, 'min-w-0 pr-8 text-center')}
                    aria-label={t('teams.nameLabel')}
                    disabled={patchTeamName.isPending}
                  />
                ) : (
                  <>
                    <button
                      type="button"
                      className={cn(
                        HUB_SEARCH_INPUT_CLASS,
                        'flex min-w-0 items-center',
                        canEditTeamTitle && 'cursor-text',
                      )}
                      onClick={() => {
                        if (!canEditTeamTitle || !detailTeam) return
                        setDetailTitleDraft(detailTeam.name)
                        setIsEditingDetailTitle(true)
                      }}
                      aria-label={t('teams.nameLabel')}
                      disabled={!canEditTeamTitle}
                    >
                      <p className="w-full truncate px-5 text-center text-[0.7875rem] font-medium text-[var(--color-foreground)]">
                        {detailTitle}
                      </p>
                    </button>
                    {canEditTeamTitle ? (
                      <span
                        className={cn(
                          'pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[var(--color-muted-foreground)] transition-opacity',
                          detailTitleHovered ? 'opacity-100' : 'opacity-0',
                        )}
                        aria-hidden
                      >
                        <PencilIcon size={14} isHovered={detailTitleHovered} />
                      </span>
                    ) : null}
                  </>
                )}
              </div>
            </>
          ) : isSetlistDetail ? (
            <>
              <Button
                type="button"
                size="icon"
                variant="outline"
                onClick={() => {
                  if (setlistEditorPlayerReturn) {
                    void navigate({
                      to: '/player',
                      search: buildPlayerReturnSearch(setlistEditorPlayerReturn),
                    })
                    return
                  }
                  void navigate({ to: '/setlists' })
                }}
                className={hubDetailBackButtonClass}
                aria-label={t('setlists.editor.backToList')}
              >
                <ChevronLeftIcon className="text-[var(--color-foreground)]" size={20} />
              </Button>
              <div ref={searchAnchorRef} className="group relative my-[0.36rem] min-w-0 flex-1">
                <div className={cn(HUB_SEARCH_INPUT_CLASS, 'pointer-events-none flex min-w-0 items-center justify-center')}>
                  <p className="w-full truncate px-5 text-center text-[0.7875rem] font-medium text-[var(--color-foreground)]">
                    {headerSetlist?.title ?? t('common.load')}
                  </p>
                </div>
              </div>
            </>
          ) : isCollectionDetail ? (
            <>
              <Button
                type="button"
                size="icon"
                variant="outline"
                onClick={() => {
                  if (collectionEditorPlayerReturn) {
                    void navigate({
                      to: '/player',
                      search: buildPlayerReturnSearch(collectionEditorPlayerReturn),
                    })
                    return
                  }
                  void navigate({ to: '/collections' })
                }}
                className={hubDetailBackButtonClass}
                aria-label={t('collections.editor.backToList')}
              >
                <ChevronLeftIcon className="text-[var(--color-foreground)]" size={20} />
              </Button>
              <div ref={searchAnchorRef} className="group relative my-[0.36rem] min-w-0 flex-1">
                <div className={cn(HUB_SEARCH_INPUT_CLASS, 'pointer-events-none flex min-w-0 items-center justify-center')}>
                  <p className="w-full truncate px-5 text-center text-[0.7875rem] font-medium text-[var(--color-foreground)]">
                    {headerCollection?.title ?? t('common.load')}
                  </p>
                </div>
              </div>
            </>
          ) : isSongDetail ? (
            <>
              <Button
                type="button"
                size="icon"
                variant="outline"
                onClick={() => {
                  if (songEditorPlayerReturn) {
                    void navigate({
                      to: '/player',
                      search: buildPlayerReturnSearch(songEditorPlayerReturn),
                    })
                    return
                  }
                  void navigate({ to: '/songs' })
                }}
                className={hubDetailBackButtonClass}
                aria-label={t('songs.editor.backToList')}
              >
                <ChevronLeftIcon className="text-[var(--color-foreground)]" size={20} />
              </Button>
              <div ref={searchAnchorRef} className="group relative my-[0.36rem] min-w-0 flex-1">
                <div className={cn(HUB_SEARCH_INPUT_CLASS, 'pointer-events-none flex min-w-0 items-center justify-center')}>
                  <p className="w-full truncate px-5 text-center text-[0.7875rem] font-medium text-[var(--color-foreground)]">
                    {headerSong?.data.titles[0]?.trim() || '—'}
                  </p>
                </div>
              </div>
            </>
          ) : (
            <div
              ref={searchAnchorRef}
              className="relative my-[0.36rem] min-w-0 flex-1"
              onMouseEnter={() => setSearchFieldHovered(true)}
              onMouseLeave={() => setSearchFieldHovered(false)}
            >
              <div
                className={cn(paletteOpen && 'pointer-events-none invisible')}
                aria-hidden={paletteOpen}
              >
                <SearchIcon
                  aria-hidden
                  className="pointer-events-none absolute left-[0.65rem] top-1/2 z-10 -translate-y-1/2 text-[var(--color-muted-foreground)]"
                  isHovered={searchIconActive}
                  size={18}
                />
                <Input
                  ref={searchInputRef}
                  type="search"
                  value={qInput}
                  onChange={(e) => setQInput(e.target.value)}
                  onFocus={() => setSearchFocused(true)}
                  onBlur={() => setSearchFocused(false)}
                  placeholder={t('hub.searchPlaceholder')}
                  aria-label={t('hub.searchAria')}
                  tabIndex={paletteOpen ? -1 : 0}
                  className={HUB_SEARCH_INPUT_CLASS}
                />
              </div>
            </div>
          )}
          <div className="my-[0.36rem] flex min-w-0 shrink-0 items-center gap-2">
            <ProfileMenu user={user} offline={!online} />
          </div>
        </div>
      </header>

      <main
        ref={mainScrollRef}
        className={cn(
          'min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-3 pt-[calc(5.5575rem+env(safe-area-inset-top,0px))] [-webkit-overflow-scrolling:touch]',
          showFooter
            ? 'pb-[calc(6.12rem+env(safe-area-inset-bottom,0px))]'
            : 'pb-[calc(1rem+env(safe-area-inset-bottom,0px))]',
        )}
      >
        <HubScrollContainerRefContext.Provider value={mainScrollRef}>
          <AnimatePresence mode="sync" initial={false}>
            <motion.div
              key={pathname}
              className="flex w-full min-w-0 flex-col"
              initial={reduceMotion ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduceMotion ? undefined : { opacity: 0, y: -6, pointerEvents: 'none' }}
              transition={
                reduceMotion ? { duration: 0 } : { duration: 0.22, ease: [0.25, 0.1, 0.25, 1] }
              }
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </HubScrollContainerRefContext.Provider>
      </main>

      {showFooter ? (
        <footer
          className={cn(
            'fixed bottom-0 left-0 right-0 z-40 flex justify-center bg-transparent px-3 pb-[calc(0.54rem+env(safe-area-inset-bottom,0px))] pt-[0.36rem]',
          )}
        >
          <div className={cn(hubChromeRowClass, hubChromeRowLayoutClass, 'justify-center')}>
            <HubTabBar />
            {!hideHubPlus ? (
              <div className="my-[0.36rem] shrink-0">
                <Button
                  type="button"
                  variant="outline"
                  disabled={!online}
                  title={!online ? t('hub.createOfflineHint') : undefined}
                  onMouseEnter={() => setCreateHovered(true)}
                  onMouseLeave={() => setCreateHovered(false)}
                  onClick={() => {
                    if (!online) return
                    if (isTeamsList) {
                      void navigate({ to: '/teams', search: { new: '1' } })
                    } else if (pathname === '/setlists') {
                      void navigate({ to: '/setlists', search: { new: '1' } })
                    } else if (pathname === '/collections') {
                      void navigate({ to: '/collections', search: { new: '1' } })
                    } else if (pathname === '/songs') {
                      void navigate({ to: '/songs', search: { new: '1' } })
                    }
                  }}
                  className={cn(
                    'flex size-[3.6rem] flex-col items-center justify-center gap-0.5 rounded-full px-1 py-0 font-medium',
                    '[&_svg]:!size-[1.44rem] [&_svg]:shrink-0',
                    'text-[6.48px] leading-none tracking-tight text-[var(--color-muted-foreground)] sm:text-[7.2px]',
                    'shadow-[var(--shadow-elevated)] hover:bg-[var(--color-muted)]',
                  )}
                  aria-label={
                    isTeamsList
                      ? t('hub.createTeamAria')
                      : pathname === '/setlists'
                        ? t('hub.createSetlistAria')
                        : pathname === '/collections'
                          ? t('hub.createCollectionAria')
                          : pathname === '/songs'
                            ? t('hub.createSongAria')
                            : t('hub.createAria')
                  }
                >
                  <IconHubPlus isHovered={createHovered} />
                  <span className="line-clamp-1 w-full min-w-0 px-0.5 text-center [overflow-wrap:anywhere]">
                    {t('hub.createLabel')}
                  </span>
                </Button>
              </div>
            ) : null}
          </div>
        </footer>
      ) : null}
    </div>
  )
}

export function HubShell() {
  const { t } = useTranslation()
  const { isPending, data: user } = useSession()
  const [paletteOk, setPaletteOk] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [setlistPaletteBridge, setSetlistPaletteBridge] = useState<SetlistPaletteBridge | null>(null)
  const searchAnchorRef = useRef<HTMLDivElement | null>(null)
  const searchInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    const mq = globalThis.matchMedia?.('(pointer: fine)')
    if (!mq) return
    const fn = () => setPaletteOk(mq.matches)
    fn()
    mq.addEventListener('change', fn)
    return () => mq.removeEventListener('change', fn)
  }, [])

  if (isPending) {
    return (
      <SessionLoadingFallback label={t('common.load')} />
    )
  }

  if (!user) {
    return null
  }

  return (
    <HubSearchProvider>
      <SetlistPaletteRegistrarProvider value={setSetlistPaletteBridge}>
        <HubChrome searchAnchorRef={searchAnchorRef} searchInputRef={searchInputRef} paletteOpen={paletteOpen}>
          <Outlet />
        </HubChrome>
        <CommandPalette
          enabled={paletteOk}
          open={paletteOpen}
          onOpenChange={setPaletteOpen}
          searchAnchorRef={searchAnchorRef}
          searchInputRef={searchInputRef}
          setlistBridge={setlistPaletteBridge}
        />
      </SetlistPaletteRegistrarProvider>
    </HubSearchProvider>
  )
}
