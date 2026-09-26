import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { SongCreateChooserSheet } from '@/components/songs/SongCreateChooserSheet'

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))

describe('SongCreateChooserSheet', () => {
  it('opens the CCLI PDF import option', () => {
    const onOpenChange = vi.fn()
    const onImportCcliPdf = vi.fn()
    render(
      <SongCreateChooserSheet
        open
        onOpenChange={onOpenChange}
        online
        canImport
        onNewSong={vi.fn()}
        onImport={vi.fn()}
        onImportCcliPdf={onImportCcliPdf}
        onImportUltimateGuitar={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'hub.createChooser.importCcliPdf' }))

    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(onImportCcliPdf).toHaveBeenCalledTimes(1)
  })
})
