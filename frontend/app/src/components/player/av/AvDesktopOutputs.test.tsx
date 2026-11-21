import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AvDesktopOutputs } from '@/components/player/av/AvDesktopOutputs'

const invoke = vi.hoisted(() => vi.fn())
const toastError = vi.hoisted(() => vi.fn())
vi.mock('@tauri-apps/api/core', () => ({ invoke }))
vi.mock('sonner', () => ({ toast: { error: toastError } }))
vi.mock('react-i18next', () => {
  const t = (key: string) => key
  return { useTranslation: () => ({ t }) }
})

const primary = { name: 'Primary', x: 0, y: 0, width: 1920, height: 1080, primary: true }
const display = { name: 'Projector', x: 1920, y: 0, width: 1920, height: 1080, primary: false }

describe('desktop presentation outputs', () => {
  beforeEach(() => {
    invoke.mockReset()
    toastError.mockReset()
    invoke.mockImplementation(async (command: string) => command === 'presentation_outputs' ? [] : undefined)
  })

  it.each([
    { displays: [primary, display], kind: 'display' },
    { displays: [primary], kind: 'share' },
  ])('opens $kind directly for the available displays', async ({ displays, kind }) => {
    invoke.mockImplementation(async (command: string) => command === 'presentation_displays' ? displays : command === 'presentation_outputs' ? [] : undefined)
    render(<AvDesktopOutputs sessionId="shared" summary="none" />)
    await userEvent.click(screen.getByRole('button', { name: /player.av.openOutput/ }))
    await waitFor(() => expect(invoke).toHaveBeenCalledWith('presentation_start', {
      options: { kind, display: null, session: 'shared', width: 1920, height: 1080 },
    }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('stops an existing output on the next click and opens again after it is closed', async () => {
    let outputs: { id: string; session: string }[] = []
    invoke.mockImplementation(async (command: string) => {
      if (command === 'presentation_outputs') return [...outputs]
      if (command === 'presentation_displays') return [primary, display]
      if (command === 'presentation_start') outputs = [{ id: 'output-1', session: 'shared' }]
      if (command === 'presentation_stop') outputs = []
    })
    const user = userEvent.setup()
    render(<AvDesktopOutputs sessionId="shared" summary="none" />)
    await user.click(screen.getByRole('button', { name: /player.av.openOutput/ }))
    await user.click(await screen.findByRole('button', { name: /player.av.stopOutput/ }))
    expect(invoke).toHaveBeenCalledWith('presentation_stop', { id: 'output-1' })
    await user.click(await screen.findByRole('button', { name: /player.av.openOutput/ }))
    expect(invoke.mock.calls.filter(([command]) => command === 'presentation_start')).toHaveLength(2)
  })

  it('starts an output if a previously open window was closed externally', async () => {
    let outputs = [{ id: 'output-1', session: 'shared' }]
    invoke.mockImplementation(async (command: string) => {
      if (command === 'presentation_outputs') return [...outputs]
      if (command === 'presentation_displays') return [primary]
    })
    render(<AvDesktopOutputs sessionId="shared" summary="none" />)
    const button = await screen.findByRole('button', { name: /player.av.stopOutput/ })
    outputs = []
    await userEvent.click(button)
    await waitFor(() => expect(invoke).toHaveBeenCalledWith('presentation_start', expect.anything()))
    expect(invoke).not.toHaveBeenCalledWith('presentation_stop', expect.anything())
  })

  it('reports an unavailable desktop bridge', async () => {
    invoke.mockRejectedValue(new Error('unknown command'))
    render(<AvDesktopOutputs sessionId="shared" summary="none" />)
    await userEvent.click(screen.getByRole('button', { name: /player.av.openOutput/ }))
    await waitFor(() => expect(toastError).toHaveBeenCalledWith(expect.stringContaining('player.av.desktopUnavailable')))
    expect(invoke).not.toHaveBeenCalledWith('presentation_start', expect.anything())
  })
})
