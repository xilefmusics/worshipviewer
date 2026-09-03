import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { HubTabBar } from '@/components/hub/HubTabBar'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, ...props }: { children: ReactNode; to: string } & Record<string, unknown>) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
  useRouterState: ({ select }: { select: (state: { location: { pathname: string } }) => unknown }) =>
    select({ location: { pathname } }),
}))
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) =>
      ({
        en: {
          'hub.tabs.collections': 'Collections',
          'hub.tabs.songs': 'Songs',
          'hub.tabs.setlists': 'Setlists',
          'hub.tabs.rooms': 'Rooms',
          'hub.tabs.aria': 'Library and rooms',
        },
        de: {
          'hub.tabs.collections': 'Sammlungen',
          'hub.tabs.songs': 'Lieder',
          'hub.tabs.setlists': 'Setlisten',
          'hub.tabs.rooms': 'Räume',
          'hub.tabs.aria': 'Bibliothek und Räume',
        },
      }[locale] as Record<string, string>)[key] ?? key,
  }),
}))

let pathname = '/media'
let locale: 'en' | 'de' = 'en'

describe('Hub primary navigation', () => {
  it('keeps Media absent from the primary hub tab bar', () => {
    render(<HubTabBar />)
    expect(screen.queryByRole('link', { name: /media/i })).not.toBeInTheDocument()
    expect(screen.getAllByRole('link')).toHaveLength(4)
  })

  it('promotes Rooms in the approved order and keeps Teams out of the tab bar', () => {
    locale = 'en'
    pathname = '/collections'
    render(<HubTabBar />)

    expect(screen.getAllByRole('link').map((link) => link.textContent?.trim())).toEqual([
      'Collections',
      'Songs',
      'Setlists',
      'Rooms',
    ])
    expect(screen.queryByRole('link', { name: 'Teams' })).not.toBeInTheDocument()
  })

  it('marks Rooms active only on its hub route and uses its animated room icon', () => {
    locale = 'en'
    pathname = '/rooms'
    render(<HubTabBar />)

    const rooms = screen.getByRole('link', { name: 'Rooms' })
    expect(rooms).toHaveAttribute('href', '/rooms')
    expect(rooms).toHaveAttribute('aria-current', 'page')
    expect(rooms).toHaveTextContent('Rooms')
    expect(rooms.querySelector('circle')).toBeInTheDocument()
  })

  it('keeps the Rooms tab inactive on a team detail route', () => {
    locale = 'en'
    pathname = '/teams/team-1'
    render(<HubTabBar />)

    expect(screen.getByRole('link', { name: 'Rooms' })).not.toHaveAttribute('aria-current')
  })

  it.each([
    ['en' as const, 'Rooms', 'Library and rooms'],
    ['de' as const, 'Räume', 'Bibliothek und Räume'],
  ])('uses the localized Rooms label and navigation name in %s', (language, label, ariaLabel) => {
    locale = language
    pathname = '/rooms'
    render(<HubTabBar />)

    expect(screen.getByRole('link', { name: label })).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: ariaLabel })).toBeInTheDocument()
  })
})
