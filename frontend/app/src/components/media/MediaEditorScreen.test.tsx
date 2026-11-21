import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Media } from '@/api/media'
import { MediaEditorScreen } from '@/components/media/MediaEditorScreen'

const fetchMedia = vi.fn()
const updateMedia = vi.fn()
const commitDeck = vi.fn()
const uploadMediaSource = vi.fn()

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/hooks/use-online', () => ({ useOnline: () => true }))
vi.mock('@/hooks/useTeamDetail', () => ({
  useTeamDetail: () => ({
    data: {
      id: 'team:1',
      name: 'Team',
      members: [{ user: { id: 'user:1' }, role: 'admin' }],
    },
  }),
}))
vi.mock('@/hooks/useWritableTeams', () => ({
  useWritableTeams: () => ({ user: { id: 'user:1' }, teams: [] }),
}))
vi.mock('@/api/media-upload', () => ({
  uploadMediaSource: (...args: unknown[]) => uploadMediaSource(...args),
  mediaAssetDataUrl: () => '/asset',
}))
vi.mock('@/api/media', () => ({
  fetchMedia: (...args: unknown[]) => fetchMedia(...args),
  updateMedia: (...args: unknown[]) => updateMedia(...args),
  commitDeck: (...args: unknown[]) => commitDeck(...args),
  beginDeckRevision: vi.fn(),
  mediaDetailKey: (id: string) => ['media', 'detail', id],
  mediaListRootKey: ['media'],
}))
vi.mock('@/components/media/DeckPagesEditor', () => ({
  DeckPagesEditor: ({
    pages,
    onAdd,
    onMarkdownChange,
    onReplace,
  }: {
    pages: { id: string; markdown?: string }[]
    onMarkdownChange: (id: string, value: string) => void
    onReplace: (id: string, file: File) => void
    onAdd: (files: File[], insertionIndex: number) => void
  }) => (
    <div>
      <div data-testid="deck-pages">{pages.map((page) => page.id).join(',')}</div>
      <div data-testid="markdown-values">{pages.map((page) => page.markdown).join(',')}</div>
      {pages.filter((page) => page.markdown !== undefined).map((page) => <button key={page.id} type="button" onClick={() => onMarkdownChange(page.id, "# Changed")}>edit markdown</button>)}
      {pages.filter((page) => page.markdown !== undefined).map((page) => <button key={`again-${page.id}`} type="button" onClick={() => onMarkdownChange(page.id, "# Again")}>edit markdown again</button>)}
      <button type="button" onClick={() => onReplace(pages[1].id, new File(['replacement'], 'replacement.png', { type: 'image/png' }))}>replace second</button>
      <button type="button" onClick={() => onAdd([new File(['new'], 'new.png', { type: 'image/png' })], 1)}>
        add at boundary 1
      </button>
    </div>
  ),
}))
vi.mock('@/components/media/MediaDeckPageView', () => ({
  MediaDeckPageView: () => <div data-testid="image-preview" />,
}))

function deckMedia(overrides: Partial<Media> = {}): Media {
  return {
    id: 'media:deck',
    owner: 'team:1',
    title: 'Sunday',
    is_background: false,
    content: {
      type: 'slide_deck',
      pages: [
        { blob_id: 'b1', section_title: 'Section 1' },
        { blob_id: 'b2' },
      ],
    },
    pending_revision: {
      revision_id: 'rev1',
      pages: [
        { id: 'p1', blob_id: 'b1', section_title: 'Section 1' },
        { id: 'p2', blob_id: 'b2' },
      ],
    },
    ...overrides,
  }
}

function imageMedia(overrides: Partial<Media> = {}): Media {
  return {
    id: 'media:image',
    owner: 'team:1',
    title: 'Background image',
    is_background: false,
    content: { type: 'image', blob_id: 'asset:image' },
    ...overrides,
  }
}

function renderEditor(mediaId = 'media:deck') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MediaEditorScreen mediaId={mediaId} />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  fetchMedia.mockResolvedValue(deckMedia())
  updateMedia.mockImplementation(async (_qc: unknown, _id: string, body: { title: string }) =>
    deckMedia({ title: body.title }),
  )
  commitDeck.mockResolvedValue(deckMedia({
    pending_revision: undefined,
    content: {
      type: 'slide_deck',
      pages: [
        { blob_id: 'b1', section_title: 'Section 1' },
        { blob_id: 'b2' },
      ],
    },
  }))
})

describe('MediaEditorScreen slide decks', () => {
  it('replaces an uploaded page in a mixed deck while preserving Markdown', async () => {
    const user = userEvent.setup()
    fetchMedia.mockResolvedValue(deckMedia({ pending_revision: { revision_id: 'rev1', pages: [{ id: 'text', markdown: '# Intro' }, { id: 'old-id', blob_id: 'b1', section_title: 'Images' }] } }))
    uploadMediaSource.mockResolvedValue(deckMedia({ pending_revision: { revision_id: 'rev1', pages: [{ id: 'text', markdown: '# Intro' }, { id: 'new-id', blob_id: 'new-blob' }] } }))
    renderEditor()
    await user.click(await screen.findByRole('button', { name: 'replace second' }))
    await waitFor(() => expect(commitDeck).toHaveBeenCalledWith(expect.anything(), 'media:deck', { revision_id: 'rev1', pages: [{ markdown: '# Intro', section_title: null }, { page_id: 'new-id', section_title: 'Images' }] }))
    expect(uploadMediaSource).toHaveBeenCalledWith(expect.objectContaining({ replacePage: 'old-id' }))
  })

  it('keeps edits made during an in-flight save and saves them afterward', async () => {
    const user = userEvent.setup()
    const initial = deckMedia({ pending_revision: { revision_id: 'rev1', pages: [{ id: 'text', markdown: '# Start' }, { id: 'image', blob_id: 'b1' }] } })
    fetchMedia.mockResolvedValue(initial)
    let resolveSave!: (value: Media) => void
    commitDeck.mockImplementationOnce(() => new Promise<Media>((resolve) => { resolveSave = resolve }))
    renderEditor()
    await user.click(await screen.findByRole('button', { name: 'edit markdown' }))
    await waitFor(() => expect(commitDeck).toHaveBeenCalledTimes(1), { timeout: 2000 })
    await user.click(screen.getByRole('button', { name: 'edit markdown again' }))
    resolveSave(deckMedia({ pending_revision: undefined, content: { type: 'slide_deck', pages: [{ markdown: '# Changed' }, { blob_id: 'b1' }] } }))
    await waitFor(() => expect(screen.getByTestId('markdown-values')).toHaveTextContent('# Again'))
    await waitFor(() => expect(commitDeck).toHaveBeenCalledTimes(2), { timeout: 2000 })
    expect(commitDeck.mock.calls[1][2].pages[0].markdown).toBe('# Again')
  })

  it('autosaves Markdown alongside an uploaded page', async () => {
    const user = userEvent.setup()
    fetchMedia.mockResolvedValue(deckMedia({ pending_revision: { revision_id: 'rev1', pages: [{ id: 'text', markdown: '# Start' }, { id: 'image', blob_id: 'b1' }] } }))
    renderEditor()
    await user.click(await screen.findByRole('button', { name: 'edit markdown' }))
    await waitFor(() => expect(commitDeck).toHaveBeenCalledWith(expect.anything(), 'media:deck', { revision_id: 'rev1', pages: [{ markdown: '# Changed', section_title: null }, { page_id: 'image', section_title: null }] }), { timeout: 2000 })
  })

  it('M2: previews draft pages once expansion is idle', async () => {
    renderEditor()
    expect(await screen.findByTestId('deck-pages')).toHaveTextContent('p1,p2')
    expect(screen.getByLabelText('media.fields.title')).toHaveValue('Sunday')
    expect(screen.queryByRole('link', { name: 'media.actions.play' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'media.actions.save' })).not.toBeInTheDocument()
    expect(screen.queryByText('media.kinds.slide_deck')).not.toBeInTheDocument()
  })

  it('M4: autosaves title edits and commits the draft page order', async () => {
    const user = userEvent.setup()
    renderEditor()
    await screen.findByTestId('deck-pages')
    const titleInput = screen.getByLabelText('media.fields.title')
    await user.clear(titleInput)
    await user.type(titleInput, 'Updated Sunday')
    await waitFor(() => {
      expect(updateMedia).toHaveBeenCalledWith(expect.anything(), 'media:deck', {
        title: 'Updated Sunday',
        owner: 'team:1',
      })
    }, { timeout: 2_000 })
    await waitFor(() => {
      expect(commitDeck).toHaveBeenCalledWith(expect.anything(), 'media:deck', {
        revision_id: 'rev1',
        page_ids: ['p1', 'p2'],
        section_titles: ['Section 1', null],
      })
    }, { timeout: 2_000 })
  })

  it('M5: does not autosave an empty deck', async () => {
    fetchMedia.mockResolvedValue(deckMedia({
      pending_revision: { revision_id: 'rev1', pages: [] },
    }))
    renderEditor()
    await screen.findByTestId('deck-pages')
    await new Promise((resolve) => setTimeout(resolve, 800))
    expect(commitDeck).not.toHaveBeenCalled()
  })

  it('commits uploaded pages at the selected insertion boundary', async () => {
    const user = userEvent.setup()
    uploadMediaSource.mockResolvedValue(
      deckMedia({
        pending_revision: {
          revision_id: 'rev1',
          pages: [
            { id: 'p1', blob_id: 'b1', section_title: 'Section 1' },
            { id: 'p2', blob_id: 'b2' },
            { id: 'p-new', blob_id: 'b-new' },
          ],
        },
      }),
    )
    renderEditor()
    await screen.findByTestId('deck-pages')

    await user.click(screen.getByRole('button', { name: 'add at boundary 1' }))

    await waitFor(() => {
      expect(commitDeck).toHaveBeenCalledWith(expect.anything(), 'media:deck', {
        revision_id: 'rev1',
        page_ids: ['p1', 'p-new', 'p2'],
        section_titles: ['Section 1', null, null],
      })
    })
  })

})

describe('MediaEditorScreen background images', () => {
  it('previews an image and autosaves its background flag', async () => {
    fetchMedia.mockResolvedValue(imageMedia())
    updateMedia.mockImplementation(async (_qc: unknown, _id: string, body: { is_background?: boolean }) =>
      imageMedia({ is_background: body.is_background ?? false }),
    )
    const user = userEvent.setup()
    renderEditor('media:image')

    expect(await screen.findByTestId('image-preview')).toBeInTheDocument()
    const checkbox = screen.getByLabelText('media.fields.isBackground')
    await user.click(checkbox)

    await waitFor(() => expect(updateMedia).toHaveBeenCalledWith(
      expect.anything(),
      'media:image',
      expect.objectContaining({ is_background: true }),
    ), { timeout: 2_000 })
  })

  it('replaces the uploaded image through the Media asset endpoint', async () => {
    fetchMedia.mockResolvedValue(imageMedia({ is_background: true }))
    uploadMediaSource.mockResolvedValue(imageMedia({
      is_background: true,
      content: { type: 'image', blob_id: 'asset:replacement' },
    }))
    renderEditor('media:image')
    await screen.findByTestId('image-preview')
    const fileInput = document.querySelector('input[type="file"]')
    expect(fileInput).toBeInstanceOf(HTMLInputElement)
    fireEvent.change(fileInput!, {
      target: { files: [new File(['png'], 'new.png', { type: 'image/png' })] },
    })
    await waitFor(() => expect(uploadMediaSource).toHaveBeenCalledWith(expect.objectContaining({
      mediaId: 'media:image',
      kind: 'image',
    })))
    expect(screen.queryByText('media.kinds.image')).not.toBeInTheDocument()
  })
})
