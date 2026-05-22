import type { components } from '@/api/schema'

type TocItem = components['schemas']['TocItem']

export type TocDisplayMode = 'order' | 'alphabetical' | 'liked'

export function displayTocEntries(toc: TocItem[], mode: TocDisplayMode): TocItem[] {
  if (mode === 'liked') {
    return toc.filter((row) => row.liked)
  }
  if (mode === 'alphabetical') {
    return [...toc].sort((a, b) =>
      a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }),
    )
  }
  return toc
}
