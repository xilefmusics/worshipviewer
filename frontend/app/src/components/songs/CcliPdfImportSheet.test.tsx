import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { CcliPdfImportSheet } from '@/components/songs/CcliPdfImportSheet'

const mocks = vi.hoisted(() => ({
  parsePdf: vi.fn(),
  postSong: vi.fn(),
  writeLastCollectionToLs: vi.fn(),
  createPersonalCollection: vi.fn(),
  setCollectionPick: vi.fn(),
  setNoCollectionPromptOpen: vi.fn(),
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, string>) =>
      values?.error ? `${key}: ${values.error}` : key,
  }),
}))
vi.mock('@/api/client', () => ({ api: { POST: (...args: unknown[]) => mocks.postSong(...args) } }))
vi.mock('@/api/teams-sessions-fetch', () => ({
  fetchTeamsPage: vi.fn(async () => ({ items: [], total: 0 })),
}))
vi.mock('@/hooks/useEnsureTargetCollection', () => ({
  useEnsureTargetCollection: () => ({
    editableCollections: [{ id: 'collection:1', title: 'My Songs' }],
    collectionId: 'collection:1',
    setCollectionPick: mocks.setCollectionPick,
    showCollectionPicker: false,
    hasEditableCollection: true,
    noCollectionPromptOpen: false,
    setNoCollectionPromptOpen: mocks.setNoCollectionPromptOpen,
    createPersonalCollection: mocks.createPersonalCollection,
    createCollectionPending: false,
    collectionsFetched: true,
  }),
  writeLastCollectionToLs: (...args: unknown[]) => mocks.writeLastCollectionToLs(...args),
}))
vi.mock('@/hooks/useSession', () => ({ useSession: () => ({ data: { id: 'user:1' } }) }))
vi.mock('@/lib/chord-engine', () => ({
  getChordEngine: async () => ({ parsePdf: (...args: unknown[]) => mocks.parsePdf(...args) }),
}))

function renderSheet(onImported = vi.fn()) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const result = render(
    <QueryClientProvider client={queryClient}>
      <CcliPdfImportSheet
        open
        onOpenChange={vi.fn()}
        online
        onImported={onImported}
      />
    </QueryClientProvider>,
  )
  return { ...result, onImported }
}

function testPdfFile() {
  const file = new File(['pdf contents'], 'song.pdf', { type: 'application/pdf' })
  Object.defineProperty(file, 'arrayBuffer', {
    value: async () => new TextEncoder().encode('pdf contents').buffer,
  })
  return file
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.parsePdf.mockReturnValue({
    titles: ['Imported CCLI Song'],
    sections: [{ title: 'Verse', lines: [] }],
    tags: { 'pdf.ccli_song_number': '123456' },
  })
  mocks.postSong.mockResolvedValue({ response: { ok: true }, data: { id: 'song:1' } })
})

describe('CcliPdfImportSheet', () => {
  // Flow: D8
  it('parses the selected PDF bytes, saves into the chosen collection, and opens the song', async () => {
    const onImported = vi.fn()
    renderSheet(onImported)
    const file = testPdfFile()
    const input = document.querySelector('input[type="file"]')
    expect(input).toBeTruthy()
    fireEvent.change(input as HTMLInputElement, { target: { files: [file] } })

    fireEvent.click(screen.getByRole('button', { name: 'songs.ccliPdfImport.import' }))

    await waitFor(() => expect(mocks.parsePdf).toHaveBeenCalledTimes(1))
    expect(mocks.parsePdf).toHaveBeenCalledWith(new Uint8Array(new TextEncoder().encode('pdf contents')))
    await waitFor(() => expect(mocks.postSong).toHaveBeenCalledTimes(1))
    expect(mocks.postSong).toHaveBeenCalledWith('/api/v1/songs', {
      body: expect.objectContaining({
        collection: 'collection:1',
        data: expect.objectContaining({
          titles: ['Imported CCLI Song'],
          tags: { 'pdf.ccli_song_number': '123456' },
        }),
      }),
    })
    expect(mocks.writeLastCollectionToLs).toHaveBeenCalledWith('collection:1')
    expect(onImported).toHaveBeenCalledWith('song:1')
  })

  it('shows parser failures and does not save an unrecognized PDF', async () => {
    mocks.parsePdf.mockImplementation(() => {
      throw new Error('PDF has no usable text layer')
    })
    const { onImported } = renderSheet()
    const input = document.querySelector('input[type="file"]')
    fireEvent.change(input as HTMLInputElement, { target: { files: [testPdfFile()] } })

    fireEvent.click(screen.getByRole('button', { name: 'songs.ccliPdfImport.import' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'songs.ccliPdfImport.parseFailed: PDF has no usable text layer',
    )
    expect(mocks.postSong).not.toHaveBeenCalled()
    expect(onImported).not.toHaveBeenCalled()
  })
})
