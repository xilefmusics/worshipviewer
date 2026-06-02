/** Stored free-mode column layout (includes viewport-adaptive mode). */
export type PlayerLayoutColumnCount = 1 | 2 | 3 | 'adaptive'

export function isPlayerLayoutColumnCount(value: unknown): value is PlayerLayoutColumnCount {
  return value === 1 || value === 2 || value === 3 || value === 'adaptive'
}

/**
 * Resolve adaptive columns: 1 on phone, 3 in landscape on tablet/desktop, else 2.
 * Phone uses the same 768px breakpoint as {@link useIsPhoneWidth}.
 */
export function resolveFreeColumnCount(
  columnCount: PlayerLayoutColumnCount,
  viewport: { isPhone: boolean; isLandscape: boolean },
): 1 | 2 | 3 {
  if (columnCount !== 'adaptive') return columnCount
  if (viewport.isPhone) return 1
  if (viewport.isLandscape) return 3
  return 2
}
