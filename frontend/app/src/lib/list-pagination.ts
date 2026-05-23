/** Parse `X-Total-Count` (case-insensitive). Returns undefined if missing or invalid. */
export function parseTotalCount(response: Response): number | undefined {
  const raw =
    response.headers.get('x-total-count') ?? response.headers.get('X-Total-Count')
  if (raw == null || raw === '') return undefined
  const n = Number.parseInt(raw, 10)
  return Number.isFinite(n) ? n : undefined
}

export function getLoadedCount<T>(pages: Array<{ items: T[] }>): number {
  return pages.reduce((acc, p) => acc + p.items.length, 0)
}

/** Next 0-based page index, or undefined when no more pages per header rules. */
export function getNextPageIndex(
  allPages: Array<{ items: unknown[]; total: number | undefined }>,
): number | undefined {
  const last = allPages[allPages.length - 1]
  if (!last || last.total === undefined) return undefined
  const loaded = getLoadedCount(allPages)
  if (loaded >= last.total) return undefined
  return allPages.length
}
