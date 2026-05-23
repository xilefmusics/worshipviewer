export type EditorPlayFlushResult = 'success' | 'failure' | 'blocked'

export type EditorPlayOptions = {
  canPlay: boolean
  needsFlush: boolean
  flushNow: () => Promise<boolean | void>
  navigate: () => void
}

/**
 * Flush pending editor changes (when needed) then navigate to the player.
 * Returns whether navigation occurred.
 */
export async function runEditorPlay({
  canPlay,
  needsFlush,
  flushNow,
  navigate,
}: EditorPlayOptions): Promise<boolean> {
  if (!canPlay) return false

  if (needsFlush) {
    const ok = await flushNow()
    if (ok === false) return false
  }

  navigate()
  return true
}

export function editorPlayBlockedReason(options: {
  empty?: boolean
  brokenRows?: boolean
  patchInFlight?: boolean
  saveFailure?: boolean
  parseError?: boolean
}): EditorPlayFlushResult | null {
  if (options.parseError) return 'blocked'
  if (options.brokenRows) return 'blocked'
  if (options.empty) return 'blocked'
  if (options.patchInFlight) return 'blocked'
  if (options.saveFailure) return 'failure'
  return null
}
