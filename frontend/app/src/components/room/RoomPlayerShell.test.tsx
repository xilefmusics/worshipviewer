import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { RoomPlayerShell } from '@/components/room/RoomPlayerShell'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

describe('RoomPlayerShell', () => {
  it('renders only the room player panel', () => {
    render(<RoomPlayerShell player={<div>player</div>} />)

    expect(screen.getByRole('main', { name: 'rooms.panel.player' })).toHaveTextContent('player')
    expect(screen.queryByRole('region', { name: 'rooms.panel.details' })).not.toBeInTheDocument()
  })
})
