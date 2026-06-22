import { describe, expect, it } from 'vitest'

import de from '@/i18n/de.json'
import en from '@/i18n/en.json'

const FLOW_KEY_PREFIX = 'flow'

function flowKeys(locale: Record<string, unknown>): string[] {
  const setlists = locale.setlists as { editor?: Record<string, string> } | undefined
  const strings = setlists?.editor ?? {}
  return Object.keys(strings).filter((key) => key.startsWith(FLOW_KEY_PREFIX))
}

describe('setlist flow i18n parity', () => {
  it('has matching EN and DE keys for setlists.editor.flow* strings', () => {
    const enKeys = flowKeys(en as Record<string, unknown>)
    const deKeys = flowKeys(de as Record<string, unknown>)

    expect(enKeys.length).toBeGreaterThan(0)
    expect(deKeys.sort()).toEqual(enKeys.sort())
  })
})
