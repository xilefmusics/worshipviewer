import type { components } from '@/api/schema'

import { pagesPerItem, supportsIntraItemPaging } from '@/lib/player/effective-scroll-type'

export type ScrollType = components['schemas']['ScrollType']

export type PlayerNavState = {
  index: number
  pageOffset: number
}

export type NextPlayerAction =
  | { type: 'prev' }
  | { type: 'next' }
  | { type: 'home' }
  | { type: 'end' }
  | { type: 'jump'; index: number }

export type PlayerNavConfig = {
  itemCount: number
  betweenItems: boolean
  scrollType: ScrollType
  itemTypeAt: (index: number) => 'blob' | 'chords'
}

function clampIndex(index: number, itemCount: number): number {
  if (itemCount <= 0) return 0
  return Math.min(Math.max(index, 0), itemCount - 1)
}

function pagesFor(config: PlayerNavConfig, index: number): number {
  return pagesPerItem(config.scrollType, config.itemTypeAt(index))
}

export function initialPlayerNavState(serverIndex: number, itemCount: number): PlayerNavState {
  return { index: clampIndex(serverIndex, itemCount), pageOffset: 0 }
}

export function nextPlayerState(
  state: PlayerNavState,
  action: NextPlayerAction,
  config: PlayerNavConfig,
): PlayerNavState {
  const { itemCount } = config
  if (itemCount <= 0) return { index: 0, pageOffset: 0 }

  if (action.type === 'home') {
    return { index: 0, pageOffset: 0 }
  }

  if (action.type === 'end') {
    return { index: itemCount - 1, pageOffset: 0 }
  }

  if (action.type === 'jump') {
    return { index: clampIndex(action.index, itemCount), pageOffset: 0 }
  }

  const intra = supportsIntraItemPaging(config.scrollType, config.betweenItems)

  if (action.type === 'next') {
    if (intra) {
      const pages = pagesFor(config, state.index)
      if (state.pageOffset < pages - 1) {
        return { ...state, pageOffset: state.pageOffset + 1 }
      }
      if (state.index < itemCount - 1) {
        return { index: state.index + 1, pageOffset: 0 }
      }
      return state
    }
    if (state.index < itemCount - 1) {
      return { index: state.index + 1, pageOffset: 0 }
    }
    return state
  }

  // prev
  if (intra) {
    if (state.pageOffset > 0) {
      return { ...state, pageOffset: state.pageOffset - 1 }
    }
    if (state.index > 0) {
      const prevIndex = state.index - 1
      const pages = pagesFor(config, prevIndex)
      return { index: prevIndex, pageOffset: Math.max(0, pages - 1) }
    }
    return state
  }
  if (state.index > 0) {
    return { index: state.index - 1, pageOffset: 0 }
  }
  return state
}

export function isAtStart(state: PlayerNavState, config: PlayerNavConfig): boolean {
  if (state.index <= 0) {
    const intra = supportsIntraItemPaging(config.scrollType, config.betweenItems)
    return !intra || state.pageOffset <= 0
  }
  return false
}

export function isAtEnd(state: PlayerNavState, config: PlayerNavConfig): boolean {
  if (state.index >= config.itemCount - 1) {
    const intra = supportsIntraItemPaging(config.scrollType, config.betweenItems)
    if (!intra) return true
    const pages = pagesFor(config, state.index)
    return state.pageOffset >= pages - 1
  }
  return false
}
