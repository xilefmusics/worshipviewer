import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AvDisplaySettings } from '@/components/settings/AvDisplaySettings'

const { invoke, isTauri } = vi.hoisted(() => ({ invoke: vi.fn(), isTauri: vi.fn() }))
vi.mock('@tauri-apps/api/core', () => ({ invoke, isTauri }))
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))

const primary = { name: 'Primary', x: 0, y: 0, width: 1920, height: 1080, primary: true }
const projector = { name: 'Projector', x: 1920, y: 0, width: 1920, height: 1080, primary: false }
const monitor = { name: 'Monitor', x: -1920, y: 0, width: 1920, height: 1080, primary: false }

beforeEach(() => {
  window.localStorage.clear()
  invoke.mockReset()
  isTauri.mockReturnValue(true)
})

describe('AV display settings', () => {
  it('reports when no external displays are connected', async () => {
    invoke.mockResolvedValue([primary])
    render(<AvDisplaySettings />)
    expect(await screen.findByText('settings.playerRoles.output.noDisplays')).toBeInTheDocument()
    expect(screen.getByRole('combobox')).toBeDisabled()
    expect(screen.getAllByRole('option')).toHaveLength(1)
  })

  it('shows the only external display', async () => {
    invoke.mockResolvedValue([primary, projector])
    render(<AvDisplaySettings />)
    expect(await screen.findByRole('combobox')).toHaveTextContent('Projector')
  })

  it('saves and restores a choice among multiple external displays', async () => {
    invoke.mockResolvedValue([primary, projector, monitor])
    const first = render(<AvDisplaySettings />)
    const selector = await screen.findByRole('combobox')
    await userEvent.selectOptions(selector, JSON.stringify(monitor))
    expect(JSON.parse(window.localStorage.getItem('avOutputDisplay') ?? '{}')).toEqual(monitor)
    first.unmount()
    render(<AvDisplaySettings />)
    await waitFor(() => expect(screen.getByRole('combobox')).toHaveValue(JSON.stringify(monitor)))
  })

  it('explains browser limitations without requesting displays', () => {
    isTauri.mockReturnValue(false)
    render(<AvDisplaySettings />)
    expect(screen.getByRole('combobox', { name: 'settings.playerRoles.output.displaySelectionTitle' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'settings.playerRoles.output.browserOnly' })).toHaveAccessibleDescription('settings.playerRoles.output.browserOnly')
    expect(invoke).not.toHaveBeenCalled()
  })

  it('reports display enumeration errors', async () => {
    invoke.mockRejectedValue(new Error('unavailable'))
    render(<AvDisplaySettings />)
    expect(await screen.findByText('settings.playerRoles.output.displaysError')).toBeInTheDocument()
  })
})
