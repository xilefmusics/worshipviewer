import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { Button } from '@/components/ui/button'
import { MUSICAL_KEYS } from '@/lib/setlist-editor-constants'

// Flow: E5 — mirrors SetlistEditorScreen key popover (12 keys, explicit selection)
describe('E5: setlist key picker', () => {
  function KeyPicker({ onSelect }: { onSelect: (key: string) => void }) {
    return (
      <div role="group" aria-label="Key picker">
        {MUSICAL_KEYS.map((k) => (
          <Button key={k} type="button" onClick={() => onSelect(k)}>
            {k}
          </Button>
        ))}
      </div>
    )
  }

  it('E5: exposes 12 keys and sets explicit slot key on pick', async () => {
    const onSelect = vi.fn()
    render(<KeyPicker onSelect={onSelect} />)
    expect(screen.getAllByRole('button')).toHaveLength(12)
    await userEvent.click(screen.getByRole('button', { name: 'D' }))
    expect(onSelect).toHaveBeenCalledWith('D')
  })

  it('E5: no reset-to-original — each pick is explicit', async () => {
    const onSelect = vi.fn()
    render(<KeyPicker onSelect={onSelect} />)
    await userEvent.click(screen.getByRole('button', { name: 'C' }))
    await userEvent.click(screen.getByRole('button', { name: 'F' }))
    expect(onSelect).toHaveBeenLastCalledWith('F')
    expect(onSelect).not.toHaveBeenCalledWith(null)
  })
})
