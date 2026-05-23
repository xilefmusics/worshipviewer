export type SongHydrationOutcome =
  | { kind: 'loading' }
  | { kind: 'ok'; notASong: boolean }
  | { kind: 'broken' }

/**
 * Given per-slot outcomes (parallel to `SongLink[]`), which indices are broken
 * and whether saving should stop.
 */
export function brokenSlotGate(outcomes: SongHydrationOutcome[]): {
  brokenIndices: Set<number>
  saveBlocked: boolean
} {
  const brokenIndices = new Set<number>()
  outcomes.forEach((o, i) => {
    if (o.kind === 'broken') brokenIndices.add(i)
    if (o.kind === 'ok' && o.notASong) brokenIndices.add(i)
  })
  return { brokenIndices, saveBlocked: brokenIndices.size > 0 }
}
