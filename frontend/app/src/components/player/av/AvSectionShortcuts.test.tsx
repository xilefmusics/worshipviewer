import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { AvSectionShortcuts } from '@/components/player/av/AvSectionShortcuts'
import type { AvSectionOutline } from '@/lib/player/av-lyric-slides'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, string>) => {
      if (key === 'player.av.sectionJump') return `Jump to ${values?.section} (${values?.key})`
      if (key === 'player.av.sectionJumpNoShortcut') return `Jump to ${values?.section}`
      return key
    },
  }),
}))

function chorusOutline(count: number): AvSectionOutline[] {
  return Array.from({ length: count }, (_, index) => ({
    title: 'Chorus',
    textIdx: index,
    outlineIdx: index,
    len: 1,
    duplicate: index > 0,
    hasText: true,
  }))
}

describe('AvSectionShortcuts', () => {
  it('shows occurrence-specific shortcut keys and button-only later repeats', async () => {
    const user = userEvent.setup()
    const onJump = vi.fn()

    render(
      <AvSectionShortcuts
        outline={chorusOutline(5)}
        screenState="live"
        onJump={onJump}
        onToggleBlank={vi.fn()}
        onToggleBlackout={vi.fn()}
      />,
    )

    const secondChorus = screen.getByRole('button', { name: 'Jump to Chorus (2) (Shift+C)' })
    expect(secondChorus).toHaveAttribute('aria-keyshortcuts', 'Shift+C')
    expect(screen.getByRole('button', { name: 'Jump to Chorus (3) (Alt+C)' }))
      .toHaveAttribute('aria-keyshortcuts', 'Alt+C')
    expect(screen.getByRole('button', { name: 'Jump to Chorus (4) (Shift+Alt+C)' }))
      .toHaveAttribute('aria-keyshortcuts', 'Shift+Alt+C')

    const fifthChorus = screen.getByRole('button', { name: 'Jump to Chorus (5)' })
    expect(fifthChorus).not.toHaveAttribute('aria-keyshortcuts')
    expect(fifthChorus.querySelector('kbd')).toBeNull()

    await user.click(secondChorus)
    await user.click(fifthChorus)

    expect(onJump.mock.calls).toEqual([[1], [4]])
  })
})
