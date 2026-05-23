import type { PlayerScrollType } from '@/lib/player/effective-scroll-type'

/** Book spread: two adjacent player items side by side (legacy player semantics). */
export function isBookSpreadMode(scrollType: PlayerScrollType): boolean {
  return scrollType === 'book'
}

function clampIndex(index: number, itemCount: number): number {
  if (itemCount <= 0) return 0
  return Math.min(Math.max(index, 0), itemCount - 1)
}

/** Right-page item index in book spread, or null when only the left page is shown. */
export function bookSpreadRightIndex(index: number, itemCount: number): number | null {
  if (itemCount <= 0) return null
  const maxIndex = itemCount - 1
  if (index === 0 || index >= maxIndex) return null
  return index + 1
}

/** Align a TOC jump target to a valid book-spread left page index. */
export function bookJumpIndex(index: number, itemCount: number): number {
  const clamped = clampIndex(index, itemCount)
  if (clamped > 0 && clamped % 2 === 0) {
    return clamped - 1
  }
  return clamped
}

export function bookSpreadNextIndex(index: number, itemCount: number): number {
  if (itemCount <= 0) return 0
  let next = index
  if (next < itemCount - 1) next += 1
  if (index > 0 && next < itemCount - 1) next += 1
  return next
}

export function bookSpreadPrevIndex(index: number): number {
  let prev = index
  if (prev > 0) prev -= 1
  if (prev > 0) prev -= 1
  return prev
}
