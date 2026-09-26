import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { CreateMediaDialog } from '@/components/media/CreateMediaDialog'
import { MediaFields } from '@/components/media/MediaFields'

const mocks = vi.hoisted(() => ({
  createMedia: vi.fn(),
  createUploadedMedia: vi.fn(),
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))
vi.mock('@/hooks/useWritableTeams', () => ({
  useWritableTeams: () => ({
    teams: [{ id: 'team:1', name: 'Team', members: [] }],
    user: { id: 'user:1' },
    isPending: false,
  }),
}))
vi.mock('@/api/media', () => ({
  createMedia: mocks.createMedia,
  mediaDetailKey: (id: string) => ['media', 'detail', id],
  mediaListRootKey: ['media'],
}))
vi.mock('@/api/media-upload', () => ({
  createUploadedMedia: mocks.createUploadedMedia,
}))

function renderDialog(onCreated = vi.fn(), defaultIsBackground = false) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const rendered = render(
    <QueryClientProvider client={client}>
      <CreateMediaDialog
        open
        onOpenChange={vi.fn()}
        onCreated={onCreated}
        defaultIsBackground={defaultIsBackground}
      />
    </QueryClientProvider>,
  )
  return { ...rendered, client }
}

describe('CreateMediaDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.createUploadedMedia.mockResolvedValue({
      id: 'media:deck',
      owner: 'team:1',
      title: 'Sunday slides',
      content: { type: 'slide_deck', pages: [{ blob_id: 'blob:1' }] },
    })
  })

  it('M1: requires files before creating a slide deck', async () => {
    const user = userEvent.setup()
    renderDialog()
    await user.type(screen.getByLabelText('media.fields.title'), 'Sunday slides')
    await user.click(screen.getByRole('button', { name: 'media.actions.create' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('media.validation.fileRequired')
  })

  it('creates an uploaded slide deck atomically before reporting it as created', async () => {
    const user = userEvent.setup()
    const onCreated = vi.fn()
    const { client } = renderDialog(onCreated)
    let resolveInvalidation!: () => void
    const invalidation = new Promise<void>((resolve) => {
      resolveInvalidation = resolve
    })
    const invalidateQueries = vi
      .spyOn(client, 'invalidateQueries')
      .mockImplementation(() => invalidation)
    await user.type(screen.getByLabelText('media.fields.title'), 'Sunday slides')
    await user.upload(
      screen.getByLabelText('setlists.editor.mediaQuickUploadAria'),
      new File(['pdf'], 'slides.pdf', { type: 'application/pdf' }),
    )

    await waitFor(() =>
      expect(mocks.createUploadedMedia).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: 'slide_deck',
          title: 'Sunday slides',
          owner: 'team:1',
        }),
      ),
    )
    await waitFor(() => expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['media'] }))
    expect(onCreated).not.toHaveBeenCalled()
    resolveInvalidation()
    await waitFor(() => expect(onCreated).toHaveBeenCalled())
    expect(onCreated).toHaveBeenCalledWith(
      'media:deck',
      expect.objectContaining({
        content: expect.objectContaining({ type: 'slide_deck' }),
      }),
    )
    expect(client.getQueryData(['media', 'detail', 'media:deck'])).toEqual(
      expect.objectContaining({ id: 'media:deck' }),
    )
  })
})

describe('CreateMediaDialog quick upload', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.createUploadedMedia.mockResolvedValue({
      id: 'media:new',
      title: 'Uploaded',
      owner: 'team:1',
      content: { type: 'slide_deck', pages: [] },
    })
  })
  it.each([
    ['welcome.png', 'image/png', 'slide_deck'],
    ['song.mp3', 'audio/mpeg', 'audio'],
    ['clip.mp4', 'video/mp4', 'video'],
  ])('creates %s from the drop area without filling out the form', async (name, type, kind) => {
    const onCreated = vi.fn()
    renderDialog(onCreated)
    const file = new File(['content'], name, { type })
    const input = screen.getByLabelText('setlists.editor.mediaQuickUploadAria')
    fireEvent.drop(input.closest('label')!, {
      dataTransfer: { files: [file] },
    })
    await waitFor(() =>
      expect(mocks.createUploadedMedia).toHaveBeenCalledWith(
        expect.objectContaining({
          kind,
          title: name.replace(/\.[^.]+$/, ''),
          owner: 'team:1',
          files: [file],
        }),
      ),
    )
    await waitFor(() => expect(onCreated).toHaveBeenCalled())
  })

  it('uses an entered title when choosing files', async () => {
    const user = userEvent.setup()
    renderDialog()
    await user.type(screen.getByLabelText('media.fields.title'), 'Service slides')
    const files = [
      new File(['image'], 'welcome.png', { type: 'image/png' }),
      new File(['pdf'], 'slides.pdf', { type: 'application/pdf' }),
    ]
    await user.upload(screen.getByLabelText('setlists.editor.mediaQuickUploadAria'), files)
    await waitFor(() =>
      expect(mocks.createUploadedMedia).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: 'slide_deck',
          title: 'Service slides',
          files,
        }),
      ),
    )
  })

  it('rejects mixed audio and slides without uploading', async () => {
    mocks.createUploadedMedia.mockClear()
    renderDialog()
    const input = screen.getByLabelText('setlists.editor.mediaQuickUploadAria')
    fireEvent.drop(input.closest('label')!, {
      dataTransfer: {
        files: [
          new File(['audio'], 'song.mp3', { type: 'audio/mpeg' }),
          new File(['image'], 'slide.png', { type: 'image/png' }),
        ],
      },
    })
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'setlists.editor.mediaQuickUploadUnsupported',
    )
    expect(mocks.createUploadedMedia).not.toHaveBeenCalled()
  })

  it('creates an image as a background by default in the backgrounds view', async () => {
    const file = new File(['png'], 'worship.png', { type: 'image/png' })
    renderDialog(vi.fn(), true)
    const input = screen.getByLabelText('setlists.editor.mediaQuickUploadAria')
    fireEvent.drop(input.closest('label')!, { dataTransfer: { files: [file] } })
    await waitFor(() =>
      expect(mocks.createUploadedMedia).toHaveBeenCalledWith(
        expect.objectContaining({ kind: 'image', isBackground: true, files: [file] }),
      ),
    )
  })

  it('opens the create form in image mode with the background flag enabled', () => {
    renderDialog(vi.fn(), true)
    expect(screen.getByRole('combobox', { name: 'media.fields.kind' })).toHaveTextContent(
      'media.kinds.image',
    )
    expect(screen.getByLabelText('media.fields.isBackground')).toBeChecked()
    expect(screen.getByLabelText('setlists.editor.mediaQuickUploadAria')).toHaveAttribute(
      'accept',
      'image/png,image/jpeg,image/svg+xml,.png,.jpg,.jpeg,.svg',
    )
  })

  it('can create an image without adding it to background choices', async () => {
    const user = userEvent.setup()
    const file = new File(['png'], 'worship.png', { type: 'image/png' })
    renderDialog(vi.fn(), true)
    await user.click(screen.getByLabelText('media.fields.isBackground'))
    const input = screen.getByLabelText('setlists.editor.mediaQuickUploadAria')
    fireEvent.drop(input.closest('label')!, { dataTransfer: { files: [file] } })
    await waitFor(() =>
      expect(mocks.createUploadedMedia).toHaveBeenCalledWith(
        expect.objectContaining({ kind: 'image', isBackground: false, files: [file] }),
      ),
    )
  })
})

describe('CreateMediaDialog content inputs', () => {
  it('defaults to slide deck with title and type before a single upload area', () => {
    renderDialog()
    const title = screen.getByLabelText('media.fields.title')
    const kind = screen.getByRole('combobox', { name: 'media.fields.kind' })
    const upload = screen.getByLabelText('setlists.editor.mediaQuickUploadAria')
    expect(kind).toHaveTextContent('media.kinds.slide_deck')
    expect(title.compareDocumentPosition(kind) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(kind.compareDocumentPosition(upload) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(document.querySelectorAll('input[type="file"]')).toHaveLength(1)
  })

  it('shows the drop area for upload types and the URL field for URL types', () => {
    const common = {
      title: '',
      url: '',
      owner: '',
      teams: [],
      showTeam: false,
      onTitleChange: vi.fn(),
      onKindChange: vi.fn(),
      onUrlChange: vi.fn(),
      onOwnerChange: vi.fn(),
    }
    const { rerender } = render(
      <MediaFields
        {...common}
        kind="slide_deck"
        uploadInput={<div data-testid="media-drop-zone" />}
      />,
    )
    expect(screen.getByTestId('media-drop-zone')).toBeInTheDocument()
    expect(screen.queryByLabelText('media.fields.url.youtube')).not.toBeInTheDocument()

    rerender(<MediaFields {...common} kind="youtube" />)
    expect(screen.getByLabelText('media.fields.url.youtube')).toBeInTheDocument()
    expect(screen.queryByTestId('media-drop-zone')).not.toBeInTheDocument()
  })
})
