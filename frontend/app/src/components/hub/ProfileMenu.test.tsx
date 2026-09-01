import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import i18next from 'i18next'
import { I18nextProvider, initReactI18next } from 'react-i18next'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { User } from '@/api/session'
import { ProfileMenu } from '@/components/hub/ProfileMenu'
import { SongEditorNavigationBridgeProvider } from '@/context/SongEditorNavigationBridgeContext'
import de from '@/i18n/de.json'
import en from '@/i18n/en.json'
import { PwaInstallContext } from '@/pwa/pwa-install-context'

const navigate = vi.hoisted(() => vi.fn())

vi.mock('@tanstack/react-router', () => ({ useNavigate: () => navigate }))
vi.mock('@/routes/__root', () => ({
  Route: { useRouteContext: () => ({ queryClient: {} }) },
}))

const userByRole = (role: User['role']): User => ({
  id: `${role}-user`,
  email: `${role}@example.com`,
  role,
  created_at: '2026-08-31T00:00:00Z',
})

beforeEach(() => {
  navigate.mockClear()
})

async function renderMenu({
  language = 'en',
  role = 'default',
  offline = false,
  canShowInstall = true,
  flushBeforeLeave = vi.fn(async () => true),
}: {
  language?: 'en' | 'de'
  role?: User['role']
  offline?: boolean
  canShowInstall?: boolean
  flushBeforeLeave?: () => Promise<boolean>
} = {}) {
  const i18n = i18next.createInstance()
  await i18n.use(initReactI18next).init({
    resources: { en: { translation: en }, de: { translation: de } },
    lng: language,
    fallbackLng: 'en',
    interpolation: { escapeValue: false },
  })

  const setBridge = vi.fn()
  render(
    <I18nextProvider i18n={i18n}>
      <PwaInstallContext.Provider value={{ canShowInstall, openInstall: vi.fn() }}>
        <SongEditorNavigationBridgeProvider
          bridge={{ flushBeforeLeave }}
          setBridge={setBridge}
        >
          <ProfileMenu user={userByRole(role)} offline={offline} />
        </SongEditorNavigationBridgeProvider>
      </PwaInstallContext.Provider>
    </I18nextProvider>,
  )

  const interaction = userEvent.setup()
  await interaction.click(
    screen.getByRole('button', {
      name: offline ? /profile menu \(offline\)|profilmenü öffnen \(offline\)/i : /profile menu|profilmenü/i,
    }),
  )
  return { interaction, flushBeforeLeave }
}

describe('ProfileMenu tutorials link', () => {
  it.each(['default', 'admin'] as const)(
    'places Tutorials after About and before Install app for the %s role',
    async (role) => {
      await renderMenu({ role })

      const menu = screen.getByRole('menu')
      const itemLabels = within(menu)
        .getAllByRole('menuitem')
        .map((item) => item.textContent?.trim())
      const aboutIndex = itemLabels.indexOf('About')
      const tutorialsIndex = itemLabels.indexOf('Tutorials')
      const installIndex = itemLabels.indexOf('Install app')

      expect(tutorialsIndex).toBe(aboutIndex + 1)
      expect(installIndex).toBe(tutorialsIndex + 1)
    },
  )

  it.each([
    ['en' as const, 'Tutorials'],
    ['de' as const, 'Tutorials'],
  ])('uses the localized label in %s', async (language, label) => {
    await renderMenu({ language, canShowInstall: false })
    expect(screen.getByRole('menuitem', { name: label })).toBeEnabled()
  })

  it('remains enabled offline and keeps secure external-link attributes', async () => {
    await renderMenu({ offline: true })
    const tutorials = screen.getByRole('menuitem', { name: 'Tutorials' })

    expect(tutorials).toBeEnabled()
    expect(tutorials).toHaveAttribute('href', 'https://www.worshipviewer.com/tutorials')
    expect(tutorials).toHaveAttribute('target', '_blank')
    expect(tutorials).toHaveAttribute('rel', 'noopener noreferrer')
  })

  it('activates from the keyboard without invoking the leave-editor flow', async () => {
    const flushBeforeLeave = vi.fn(async () => true)
    const { interaction } = await renderMenu({ flushBeforeLeave })
    const tutorials = screen.getByRole('menuitem', { name: 'Tutorials' })

    tutorials.focus()
    await interaction.keyboard('{Enter}')

    expect(flushBeforeLeave).not.toHaveBeenCalled()
    expect(tutorials).toHaveAttribute('href', 'https://www.worshipviewer.com/tutorials')
  })

  it('activates with a pointer without invoking the leave-editor flow', async () => {
    const flushBeforeLeave = vi.fn(async () => true)
    const { interaction } = await renderMenu({ flushBeforeLeave })
    const tutorials = screen.getByRole('menuitem', { name: 'Tutorials' })

    await interaction.click(tutorials)

    expect(flushBeforeLeave).not.toHaveBeenCalled()
    expect(tutorials).toHaveAttribute('target', '_blank')
  })
})

describe('ProfileMenu Teams destination', () => {
  it('places Teams in the former Player Rooms slot without duplicating Player Rooms', async () => {
    await renderMenu({ canShowInstall: false })

    const menu = screen.getByRole('menu')
    const items = within(menu).getAllByRole('menuitem')
    expect(items[0]).toHaveTextContent('Teams')
    expect(screen.queryByRole('menuitem', { name: /player room/i })).not.toBeInTheDocument()
  })

  it('navigates to Teams with pointer activation', async () => {
    const { interaction } = await renderMenu({ canShowInstall: false })
    const teams = screen.getByRole('menuitem', { name: 'Teams' })

    await interaction.click(teams)
    expect(navigate).toHaveBeenCalledWith({ to: '/teams' })
  })

  it('navigates to Teams with keyboard activation', async () => {
    const { interaction } = await renderMenu({ canShowInstall: false })
    const teams = screen.getByRole('menuitem', { name: 'Teams' })

    teams.focus()
    await interaction.keyboard('{Enter}')
    expect(navigate).toHaveBeenCalledWith({ to: '/teams' })
  })
})
