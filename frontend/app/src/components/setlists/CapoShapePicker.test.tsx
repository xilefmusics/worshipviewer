import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { CapoShapePicker } from '@/components/setlists/CapoShapePicker'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, unknown>) => {
      if (key === 'setlists.editor.capoChip') return `Capo: ${values?.shape ?? ''}`
      if (key === 'player.capo.playIn') return `Play in ${values?.key} shape (capo ${values?.fret})`
      if (key === 'player.capo.shape') return `${values?.key} (${values?.fret})`
      if (key === 'player.capo.reset') return 'Reset capo'
      if (key === 'player.capo.title') return 'Capo'
      return key
    },
  }),
}))

describe('setlist capo picker', () => {
  it('offers supported shapes with frets derived from the sounding key', async () => {
    const onChange = vi.fn()
    render(
      <CapoShapePicker
        soundingKey="D"
        selectedShape={null}
        canEditUi
        blockingAll={false}
        onChange={onChange}
      />,
    )

    await userEvent.click(screen.getByRole('button', { name: 'Capo: —' }))
    expect(screen.getByRole('button', { name: 'Play in G shape (capo 7)' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Play in C shape (capo 2)' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Play in E shape (capo 10)' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Play in D shape (capo 0)' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Play in A shape (capo 5)' })).toBeVisible()

    await userEvent.click(screen.getByRole('button', { name: 'Play in G shape (capo 7)' }))
    expect(onChange).toHaveBeenCalledWith('G')
  })

  it('shows the selected fret, recalculates after a key change, and resets the saved shape', async () => {
    const onChange = vi.fn()
    const { rerender } = render(
      <CapoShapePicker
        soundingKey="D"
        selectedShape="G"
        canEditUi
        blockingAll={false}
        onChange={onChange}
      />,
    )
    expect(screen.getByRole('button', { name: 'Capo: G (7)' })).toBeVisible()

    rerender(
      <CapoShapePicker
        soundingKey="A"
        selectedShape="G"
        canEditUi
        blockingAll={false}
        onChange={onChange}
      />,
    )
    expect(screen.getByRole('button', { name: 'Capo: G (2)' })).toBeVisible()

    await userEvent.click(screen.getByRole('button', { name: 'Capo: G (2)' }))
    await userEvent.click(screen.getByRole('button', { name: 'Reset capo' }))
    expect(onChange).toHaveBeenLastCalledWith(null)
  })
})
