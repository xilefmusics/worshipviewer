import { describe, expect, it } from 'vitest'

import { formatAvTimerRemaining } from '@/lib/player/av-timer'

describe('formatAvTimerRemaining', () => {
  it('shows seconds only when less than a minute remains', () => {
    expect(formatAvTimerRemaining(59_000)).toBe('59')
    expect(formatAvTimerRemaining(1_000)).toBe('1')
  })

  it('keeps seconds visible when minutes remain, including zero seconds', () => {
    expect(formatAvTimerRemaining(5 * 60_000)).toBe('5:00')
    expect(formatAvTimerRemaining(5 * 60_000 + 12_000)).toBe('5:12')
  })

  it('shows hours when the timer exceeds an hour', () => {
    expect(formatAvTimerRemaining(61 * 60_000)).toBe('1:01:00')
  })

  it('shows nothing once the timer reaches zero', () => {
    expect(formatAvTimerRemaining(0)).toBe('')
    expect(formatAvTimerRemaining(-1)).toBe('')
  })
})
