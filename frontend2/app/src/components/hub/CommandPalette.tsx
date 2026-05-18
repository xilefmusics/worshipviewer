import * as Dialog from '@radix-ui/react-dialog'
import { useNavigate } from '@tanstack/react-router'
import { Command } from 'cmdk'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { useTranslation } from 'react-i18next'
import { motion, useReducedMotion } from 'motion/react'

import { SearchIcon } from '@/components/icons/lucide-animated/search-icon'
import { HUB_SEARCH_CMD_INPUT_CLASS } from '@/components/hub/hub-search-styles'
import type { SetlistPaletteBridge } from '@/lib/setlist-palette-bridge'
import { resolveSongDataKey } from '@/lib/setlist-song-links'
import { useHubSearch } from '@/hooks/useHubSearch'
import { useSongPickerQuery, type Song } from '@/hooks/useSongPickerQuery'
import { usePwaInstall } from '@/pwa/pwa-install-context'

const HUB_CMDK_TOP = '--hub-cmdk-top'
const HUB_CMDK_LEFT = '--hub-cmdk-left'
const HUB_CMDK_W = '--hub-cmdk-w'

function clearHubCmdkVars() {
  const root = document.documentElement
  root.style.removeProperty(HUB_CMDK_TOP)
  root.style.removeProperty(HUB_CMDK_LEFT)
  root.style.removeProperty(HUB_CMDK_W)
}

type CommandPaletteProps = {
  enabled: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
  searchAnchorRef: RefObject<HTMLDivElement | null>
  searchInputRef: RefObject<HTMLInputElement | null>
  setlistBridge: SetlistPaletteBridge | null
}

const panelSpring = { type: 'spring' as const, stiffness: 520, damping: 36, mass: 0.78 }

export function CommandPalette({
  enabled,
  open,
  onOpenChange,
  searchAnchorRef,
  searchInputRef,
  setlistBridge,
}: CommandPaletteProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { setQInput } = useHubSearch()
  const { canShowInstall, openInstall } = usePwaInstall()
  const reduceMotion = useReducedMotion()
  const [paletteQuery, setPaletteQuery] = useState('')
  const [isClosing, setIsClosing] = useState(false)
  const isClosingRef = useRef(false)

  useEffect(() => {
    isClosingRef.current = isClosing
  }, [isClosing])

  const beginClose = useCallback(() => {
    if (!open || isClosingRef.current) return
    if (reduceMotion) {
      onOpenChange(false)
      return
    }
    setIsClosing(true)
  }, [open, reduceMotion, onOpenChange])

  useLayoutEffect(() => {
    if (!open || !searchAnchorRef.current) {
      clearHubCmdkVars()
      return
    }
    const el = searchAnchorRef.current
    const sync = () => {
      const r = el.getBoundingClientRect()
      const root = document.documentElement
      root.style.setProperty(HUB_CMDK_TOP, `${r.top}px`)
      root.style.setProperty(HUB_CMDK_LEFT, `${r.left}px`)
      root.style.setProperty(HUB_CMDK_W, `${r.width}px`)
    }
    sync()
    window.addEventListener('resize', sync)
    return () => {
      window.removeEventListener('resize', sync)
      clearHubCmdkVars()
    }
  }, [open, searchAnchorRef])

  useEffect(() => {
    if (!enabled) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        if (open && !isClosingRef.current) beginClose()
        else if (!open) {
          setIsClosing(false)
          setPaletteQuery('')
          onOpenChange(true)
        }
      }
    }
    globalThis.addEventListener('keydown', onKey)
    return () => globalThis.removeEventListener('keydown', onKey)
  }, [enabled, open, onOpenChange, beginClose])

  function handleDialogOpenChange(next: boolean) {
    if (next) {
      setIsClosing(false)
      setPaletteQuery('')
      onOpenChange(true)
    } else {
      beginClose()
    }
  }

  function onPanelAnimationComplete() {
    if (!isClosingRef.current) return
    isClosingRef.current = false
    setIsClosing(false)
    onOpenChange(false)
  }

  function go(to: '/collections' | '/songs' | '/setlists' | '/teams' | '/sessions' | '/settings') {
    void navigate({ to })
    beginClose()
  }

  function applyPaletteTextToHubSearchAndClose() {
    setQInput(paletteQuery)
    beginClose()
    globalThis.setTimeout(() => searchInputRef.current?.focus(), 280)
  }

  const songPick = useSongPickerQuery(paletteQuery)

  async function insertSongFromCmdk(songId: string, songData: Song['data']) {
    const b = setlistBridge
    if (!b || !b.canInsert) return
    await b.flushBeforeInsert()
    b.insertSongLink({
      id: songId,
      key: resolveSongDataKey(songData as Record<string, unknown>),
      nr: null,
    })
    beginClose()
  }

  function duplicateCount(songId: string) {
    if (!setlistBridge) return 0
    return setlistBridge.songLinks.reduce((n, l) => n + (l.id === songId ? 1 : 0), 0)
  }

  if (!enabled) return null

  return (
    <Dialog.Root open={open} onOpenChange={handleDialogOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay asChild>
          <motion.div
            className="fixed inset-0 z-[100] bg-black/25"
            initial={reduceMotion ? false : { opacity: 0 }}
            animate={
              reduceMotion
                ? { opacity: 1 }
                : isClosing
                  ? { opacity: 0 }
                  : { opacity: 1 }
            }
            transition={
              reduceMotion
                ? { duration: 0 }
                : isClosing
                  ? { duration: 0.24, ease: [0.4, 0, 0.2, 1] }
                  : { duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }
            }
          />
        </Dialog.Overlay>
        <Dialog.Content
          asChild
          aria-describedby={undefined}
          onCloseAutoFocus={(e) => e.preventDefault()}
        >
          <motion.div
            className="fixed z-[101] flex max-h-[min(32rem,calc(100dvh-2rem))] w-[var(--hub-cmdk-w,100%)] max-w-none flex-col overflow-hidden rounded-[1.8rem] border border-[var(--color-border)] bg-[var(--color-surface)] p-0 text-[var(--color-foreground)] shadow-[var(--shadow-elevated)] outline-none left-[var(--hub-cmdk-left,0px)] top-[var(--hub-cmdk-top,0px)] will-change-transform"
            style={{ transformOrigin: 'top center' }}
            initial={reduceMotion ? false : { scaleY: 0.68, opacity: 0.9 }}
            animate={
              reduceMotion
                ? { scaleY: 1, opacity: 1 }
                : isClosing
                  ? { scaleY: 0.68, opacity: 0.88 }
                  : { scaleY: 1, opacity: 1 }
            }
            transition={reduceMotion ? { duration: 0 } : panelSpring}
            onAnimationComplete={onPanelAnimationComplete}
          >
            <Dialog.Title className="sr-only">{t('hub.cmdk.label')}</Dialog.Title>
            <Command label={t('hub.cmdk.label')} className="flex min-h-0 flex-1 flex-col">
              <div className="relative shrink-0 border-b border-[var(--color-border)]">
                <SearchIcon
                  aria-hidden
                  className="pointer-events-none absolute left-[0.65rem] top-1/2 z-10 -translate-y-1/2 text-[var(--color-muted-foreground)]"
                  isHovered={open && !isClosing}
                  size={18}
                />
                <Command.Input
                  value={paletteQuery}
                  onValueChange={setPaletteQuery}
                  placeholder={t('hub.cmdk.inputPlaceholder')}
                  aria-label={t('hub.cmdk.commandInputAria')}
                  className={HUB_SEARCH_CMD_INPUT_CLASS}
                />
              </div>
              <Command.List className="min-h-0 flex-1 overflow-y-auto p-2">
                <Command.Empty className="px-2 py-3 text-sm text-[var(--color-muted-foreground)]">
                  {t('hub.cmdk.empty')}
                </Command.Empty>
                <Command.Group heading={t('hub.cmdk.actions')} className="text-xs text-[var(--color-muted-foreground)]">
                  <Command.Item
                    value="action-search-library"
                    keywords={['search', 'find', 'library', 'filter', 'query', t('hub.cmdk.searchAction')]}
                    className="cursor-pointer rounded-md px-2 py-2 text-sm text-[var(--color-foreground)] aria-selected:bg-[var(--color-muted)]"
                    onSelect={applyPaletteTextToHubSearchAndClose}
                  >
                    {t('hub.cmdk.searchAction')}
                  </Command.Item>
                </Command.Group>
                {setlistBridge ? (
                  <Command.Group
                    heading={t(
                      setlistBridge.cmdkInsertHeadingKey ?? 'setlists.editor.cmdkInsertHeading',
                    )}
                    className="text-xs text-[var(--color-muted-foreground)]"
                  >
                    {(songPick.data?.items ?? []).map((song) => {
                      const title = song.data.titles[0]?.trim() || '—'
                      const dup = duplicateCount(song.id)
                      const dupKey = setlistBridge.duplicateBadgeKey ?? 'setlists.editor.duplicateBadge'
                      return (
                        <Command.Item
                          key={song.id}
                          value={`insert-song ${song.id} ${title}`}
                          disabled={!setlistBridge.canInsert}
                          className="cursor-pointer rounded-md px-2 py-2 text-sm text-[var(--color-foreground)] aria-selected:bg-[var(--color-muted)] disabled:opacity-50"
                          onSelect={() => void insertSongFromCmdk(song.id, song.data)}
                        >
                          <span className="font-medium">{title}</span>
                          {dup ? (
                            <span className="ml-2 text-[0.65rem] uppercase text-[var(--color-muted-foreground)]">
                              {t(dupKey, { count: dup })}
                            </span>
                          ) : null}
                        </Command.Item>
                      )
                    })}
                  </Command.Group>
                ) : null}
                <Command.Group heading={t('hub.cmdk.navigate')} className="text-xs text-[var(--color-muted-foreground)]">
                  <Command.Item
                    value="nav-collections"
                    keywords={['collections', 'library', t('hub.tabs.collections')]}
                    className="cursor-pointer rounded-md px-2 py-2 text-sm text-[var(--color-foreground)] aria-selected:bg-[var(--color-muted)]"
                    onSelect={() => go('/collections')}
                  >
                    {t('hub.tabs.collections')}
                  </Command.Item>
                  <Command.Item
                    value="nav-songs"
                    keywords={['songs', 'music', t('hub.tabs.songs')]}
                    className="cursor-pointer rounded-md px-2 py-2 text-sm text-[var(--color-foreground)] aria-selected:bg-[var(--color-muted)]"
                    onSelect={() => go('/songs')}
                  >
                    {t('hub.tabs.songs')}
                  </Command.Item>
                  <Command.Item
                    value="nav-setlists"
                    keywords={['setlists', 'sets', t('hub.tabs.setlists')]}
                    className="cursor-pointer rounded-md px-2 py-2 text-sm text-[var(--color-foreground)] aria-selected:bg-[var(--color-muted)]"
                    onSelect={() => go('/setlists')}
                  >
                    {t('hub.tabs.setlists')}
                  </Command.Item>
                  <Command.Item
                    value="nav-settings"
                    keywords={['settings', 'preferences', t('hub.profile.settings')]}
                    className="cursor-pointer rounded-md px-2 py-2 text-sm text-[var(--color-foreground)] aria-selected:bg-[var(--color-muted)]"
                    onSelect={() => go('/settings')}
                  >
                    {t('hub.profile.settings')}
                  </Command.Item>
                  <Command.Item
                    value="nav-teams"
                    keywords={['teams', t('hub.profile.teams')]}
                    className="cursor-pointer rounded-md px-2 py-2 text-sm text-[var(--color-foreground)] aria-selected:bg-[var(--color-muted)]"
                    onSelect={() => go('/teams')}
                  >
                    {t('hub.profile.teams')}
                  </Command.Item>
                  <Command.Item
                    value="nav-sessions"
                    keywords={['sessions', t('hub.profile.sessions')]}
                    className="cursor-pointer rounded-md px-2 py-2 text-sm text-[var(--color-foreground)] aria-selected:bg-[var(--color-muted)]"
                    onSelect={() => go('/sessions')}
                  >
                    {t('hub.profile.sessions')}
                  </Command.Item>
                  {canShowInstall ? (
                    <Command.Item
                      value="nav-install"
                      keywords={['install', 'app', 'pwa', t('hub.profile.install')]}
                      className="cursor-pointer rounded-md px-2 py-2 text-sm text-[var(--color-foreground)] aria-selected:bg-[var(--color-muted)]"
                      onSelect={() => {
                        openInstall()
                        beginClose()
                      }}
                    >
                      {t('hub.profile.install')}
                    </Command.Item>
                  ) : null}
                </Command.Group>
              </Command.List>
            </Command>
          </motion.div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
