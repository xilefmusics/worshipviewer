import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { SettingsTabBar } from '@/components/settings/SettingsTabBar'

const navigate = vi.fn()
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigate,
  useRouterState: ({ select }: { select: (state: unknown) => unknown }) => select({ location: { search: { tab: 'player', roomReturnId: 'room-42', roomReturnMode: 'av' } } }),
}))
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))

describe('settings navigation', () => {
  it('selects new sections while preserving the return destination', () => {
    render(<SettingsTabBar />)
    expect(screen.getAllByRole('tab')).toHaveLength(6)
    expect(screen.getByRole('tab', { name: 'settings.tabs.player' })).toHaveAttribute('aria-selected', 'true')
    fireEvent.click(screen.getByRole('tab', { name: 'settings.tabs.audio' }))
    expect(navigate).toHaveBeenCalledWith({ to: '/settings', search: { tab: 'audio', roomReturnId: 'room-42', roomReturnMode: 'av' } })
    fireEvent.keyDown(screen.getByRole('tab', { name: 'settings.tabs.audio' }), { key: 'ArrowRight' })
    expect(navigate).toHaveBeenLastCalledWith({ to: '/settings', search: { tab: 'midi', roomReturnId: 'room-42', roomReturnMode: 'av' } })
    expect(screen.getByRole('tab', { name: 'settings.tabs.midi' })).toHaveFocus()
  })
})
