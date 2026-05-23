/** Returns the item index to prefetch, or null when prefetch should not run. */
export function prefetchNextItemIndex(
  online: boolean,
  currentIndex: number,
  totalItems: number,
): number | null {
  if (!online) return null
  if (totalItems <= 1) return null
  const next = currentIndex + 1
  if (next >= totalItems) return null
  return next
}
