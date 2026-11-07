import type { components } from '@/api/schema'
import { useTranslation } from 'react-i18next'
import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'

import { Button } from '@/components/ui/button'
import { TocSortOrderIcon } from '@/components/icons/toc-sort-icons'
import { MessageSquareIcon } from '@/components/icons/lucide-animated/message-square-icon'
import { UsersIcon } from '@/components/icons/lucide-animated/users-icon'
import { TocSidebar, TOC_SORT_BUTTON_CLASS } from '@/components/player/TocSidebar'
import { usePlayerTocSearchSync } from '@/hooks/usePlayerIndexSearchSync'
import { useTocMultilingualPreference } from '@/hooks/useTocMultilingualPreference'
import { useDeveloperOptionsPreference } from '@/hooks/useDeveloperOptionsPreference'
import { tocDisplayNr, type TocDisplayEntry } from '@/lib/player/toc-display'
import { PLAYER_TOC_WIDTH_CLASS } from '@/lib/player/player-chrome'
import { serializeRoomDebugLog, type RoomDebugEntry, type RoomDebugLog } from '@/lib/room-message-debug'
import { cn } from '@/lib/utils'

type TocItem = components['schemas']['TocItem']
type PlayerItem = components['schemas']['PlayerItem']

type PlayerTocSidebarProps = {
  toc: TocItem[]
  items: PlayerItem[]
  currentSourceIdx: number
  currentLanguageIndex: number | null
  onSelect: (sourceIdx: number, languageIndex: number | null) => void
  primaryTitleOnly?: boolean
  className?: string
  renderRowSuffix?: (entry: TocDisplayEntry) => ReactNode
  queueOrder?: readonly number[]
  members?: readonly { visit_id: string; display_name: string; joined_at?: string }[]
  roomOpenedAt?: string | null
  currentVisitId?: string
  protocolLog?: RoomDebugLog | null
}

function formatRoomTimestamp(timestamp: string | null | undefined, locale?: string): string | null {
  if (!timestamp) return null
  const date = new Date(timestamp)
  if (!Number.isFinite(date.getTime())) return null
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

function formatProtocolTimestamp(timestamp: string, locale?: string): string | null {
  const date = new Date(timestamp)
  if (!Number.isFinite(date.getTime())) return null
  return new Intl.DateTimeFormat(locale, { dateStyle: 'short', timeStyle: 'medium' }).format(date)
}

function downloadRoomDebugLog(log: RoomDebugLog): void {
  const blob = new Blob([serializeRoomDebugLog(log)], { type: 'application/json' })
  const href = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = href
  anchor.download = `room-${log.room_id.replace(/[^a-zA-Z0-9._-]/g, '_')}-messages.json`
  anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(href), 1000)
}

export function PlayerTocSidebar({
  toc,
  items,
  currentSourceIdx,
  currentLanguageIndex,
  onSelect,
  primaryTitleOnly = false,
  className,
  renderRowSuffix,
  queueOrder,
  members,
  roomOpenedAt,
  currentVisitId,
  protocolLog,
}: PlayerTocSidebarProps) {
  const { t, i18n } = useTranslation()
  const [activePanel, setActivePanel] = useState<'contents' | 'members' | 'protocol'>('contents')
  const developerOptions = useDeveloperOptionsPreference()
  const showProtocol = developerOptions && protocolLog != null
  const visiblePanel = activePanel === 'protocol' && !showProtocol ? 'contents' : activePanel
  const multilingual = useTocMultilingualPreference()
  const {
    mode,
    setMode,
    setLanguageIds,
    activeLanguageIds,
    activeTagIds,
    toggleTagId,
  } = usePlayerTocSearchSync()
  const languageAwareSelection = !primaryTitleOnly && (multilingual || mode === 'alphabetical')
  const displayedToc = useMemo(() => {
    if (mode !== 'order' || !queueOrder) return toc

    const queuePositions = new Map(queueOrder.map((sourceIdx, index) => [sourceIdx, index]))
    const originalPositions = new Map(toc.map((row, index) => [row.idx, index]))
    const originalNumbers = new Map(toc.map((row) => [row.idx, tocDisplayNr(toc, row)]))
    return [...toc]
      .sort((a, b) =>
        (queuePositions.get(a.idx) ?? Number.MAX_SAFE_INTEGER) -
          (queuePositions.get(b.idx) ?? Number.MAX_SAFE_INTEGER) ||
        (originalPositions.get(a.idx) ?? 0) - (originalPositions.get(b.idx) ?? 0),
      )
      .map((row) => ({ ...row, nr: originalNumbers.get(row.idx) ?? row.nr }))
  }, [mode, queueOrder, toc])
  const locale = i18n?.resolvedLanguage ?? i18n?.language
  const openedAt = formatRoomTimestamp(roomOpenedAt, locale)
  const protocolMessage = (entry: RoomDebugEntry): string => {
    if (!('change' in entry.event)) {
      return t('rooms.protocol.presenceUpdated', { count: entry.event.members.length })
    }

    const { change } = entry.event
    if (change.type === 'set_background') return t('rooms.protocol.backgroundSet')

    const item = items[change.song]
    const songTitle = item?.type === 'chords'
      ? item.song.data.titles?.find((title) => title.trim()) || item.song.id
      : null
    const title = songTitle || t('rooms.protocol.songNumber', { number: change.song + 1 })

    if (change.type === 'selection') {
      if (change.activate) return t('rooms.protocol.songSelected', { title })
      const sectionIndex = change.section ?? change.slide
      const section = item?.type === 'chords'
        ? item.song.data.sections[sectionIndex]?.title?.trim()
        : null
      return t('rooms.protocol.slideSelected', {
        title,
        section: section || t('rooms.protocol.untitledSection'),
        slide: change.section == null ? 1 : change.slide + 1,
      })
    }

    return t(change.voted ? 'rooms.protocol.voteAdded' : 'rooms.protocol.voteRemoved', { title })
  }

  const renderContents = (tocClassName = className) => (
    <TocSidebar
      toc={displayedToc}
      items={items}
      currentSourceIdx={currentSourceIdx}
      currentLanguageIndex={currentLanguageIndex}
      onSelect={(sourceIdx, languageIndex) =>
        onSelect(sourceIdx, languageAwareSelection ? languageIndex : null)
      }
      expandAlphabeticalTranslations={!primaryTitleOnly}
      primaryTitleOnly={primaryTitleOnly}
      mode={mode}
      onModeChange={setMode}
      activeLanguageIds={activeLanguageIds}
      onLanguageIdsChange={setLanguageIds}
      activeTagIds={activeTagIds}
      onTagIdsChange={(ids) => {
        const next = new Set(ids)
        for (const id of activeTagIds) if (!next.has(id)) toggleTagId(id)
        for (const id of next) if (!activeTagIds.has(id)) toggleTagId(id)
      }}
      renderRowSuffix={renderRowSuffix}
      className={tocClassName}
      ariaLabel={t('player.toc.title')}
    />
  )

  if (members == null) return renderContents()

  return (
    <div className={cn('flex h-full min-h-0 shrink-0 flex-col border-r border-[var(--color-border)] bg-[var(--color-surface)]', className ?? PLAYER_TOC_WIDTH_CLASS)}>
      {visiblePanel === 'contents' ? (
        renderContents("h-auto min-h-0 min-w-0 w-full flex-1 shrink border-r-0")
      ) : visiblePanel === 'members' ? (
        <section className="flex min-h-0 min-w-0 flex-1 flex-col" role="region" aria-label={t('rooms.participants')}>
          {openedAt ? (
            <p className="shrink-0 border-b border-[var(--color-border)] px-4 py-3 text-xs text-[var(--color-muted-foreground)]">
              {t('rooms.openedSince', { time: openedAt })}
            </p>
          ) : null}
          <ul className="player-outline-list player-outline-list--fill" aria-label={t('rooms.participants')}>
            {members.length === 0 ? (
              <li className="px-4 py-4 text-center text-sm text-[var(--color-muted-foreground)]">{t('rooms.emptyMembers')}</li>
            ) : members.map((member) => {
              const joinedAt = formatRoomTimestamp(member.joined_at, locale)
              return (
                <li key={member.visit_id} className="flex min-w-0 flex-col gap-1 px-4 py-3 text-sm">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="min-w-0 flex-1 truncate">{member.display_name}</span>
                    {member.visit_id === currentVisitId ? (
                      <span className="shrink-0 text-xs text-[var(--color-muted-foreground)]">{t('rooms.you')}</span>
                    ) : null}
                  </div>
                  {joinedAt ? (
                    <span className="text-xs text-[var(--color-muted-foreground)]">
                      {t('rooms.joinedAt', { time: joinedAt })}
                    </span>
                  ) : null}
                </li>
              )
            })}
          </ul>
        </section>
      ) : (
        <section className="flex min-h-0 min-w-0 flex-1 flex-col" role="region" aria-label={t('rooms.protocol.title')}>
          <div className="flex shrink-0 justify-end border-b border-[var(--color-border)] p-2">
            {protocolLog ? (
              <Button type="button" size="sm" variant="outline" onClick={() => downloadRoomDebugLog(protocolLog)}>
                {t('rooms.protocol.downloadJson')}
              </Button>
            ) : null}
          </div>
          {protocolLog?.entries.length ? (
            <ol className="player-outline-list player-outline-list--fill" aria-label={t('rooms.protocol.title')}>
              {protocolLog.entries.map((entry, index) => (
                <li key={`${entry.recorded_at}:${index}`} className="grid grid-cols-[auto_minmax(0,1fr)] gap-3 px-3 py-2 text-sm">
                  <time
                    className="whitespace-nowrap text-xs tabular-nums text-[var(--color-muted-foreground)]"
                    dateTime={entry.recorded_at}
                  >
                    {formatProtocolTimestamp(entry.recorded_at, locale) ?? t('rooms.protocol.unknownTime')}
                  </time>
                  <span className="min-w-0">{protocolMessage(entry)}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="p-4 text-sm text-[var(--color-muted-foreground)]">{t('rooms.protocol.empty')}</p>
          )}
        </section>
      )}
      <div role="group" aria-label={t('rooms.sidebarTabs')} className={cn('grid shrink-0 gap-1 border-t border-[var(--color-border)] p-2', showProtocol ? 'grid-cols-3' : 'grid-cols-2')}>
        <button
          type="button"
          aria-pressed={visiblePanel === 'contents'}
          aria-label={t('player.toc.title')}
          className={cn(TOC_SORT_BUTTON_CLASS, 'text-sm leading-4 font-medium', visiblePanel === 'contents' ? 'bg-[var(--color-primary)] text-[var(--color-primary-foreground)]' : 'bg-[var(--color-muted)] text-[var(--color-foreground)] hover:bg-[var(--color-muted)]/80')}
          onClick={() => setActivePanel('contents')}
        >
          <TocSortOrderIcon size={16} />
        </button>
        <button
          type="button"
          aria-pressed={visiblePanel === 'members'}
          aria-label={`${t('rooms.members')}: ${members.length}`}
          className={cn(TOC_SORT_BUTTON_CLASS, 'gap-2 text-sm leading-4 font-medium', visiblePanel === 'members' ? 'bg-[var(--color-primary)] text-[var(--color-primary-foreground)]' : 'bg-[var(--color-muted)] text-[var(--color-foreground)] hover:bg-[var(--color-muted)]/80')}
          onClick={() => setActivePanel('members')}
        >
          <UsersIcon size={16} isHovered={activePanel === 'members'} />
          <span className="shrink-0 text-xs opacity-80">{members.length}</span>
        </button>
        {showProtocol ? (
          <button
            type="button"
            aria-pressed={visiblePanel === 'protocol'}
            aria-label={t('rooms.protocol.title')}
            title={t('rooms.protocol.title')}
            className={cn(TOC_SORT_BUTTON_CLASS, 'text-sm leading-4 font-medium', visiblePanel === 'protocol' ? 'bg-[var(--color-primary)] text-[var(--color-primary-foreground)]' : 'bg-[var(--color-muted)] text-[var(--color-foreground)] hover:bg-[var(--color-muted)]/80')}
            onClick={() => setActivePanel('protocol')}
          >
            <MessageSquareIcon size={16} />
          </button>
        ) : null}
      </div>
    </div>
  )
}
