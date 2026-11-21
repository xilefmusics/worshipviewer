import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { DeckPagesEditor } from '@/components/media/DeckPagesEditor'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, number>) =>
      options?.number != null ? `${key}:${options.number}` : key,
  }),
}))
vi.mock('@/components/player/av/AvSlideView', () => ({ AvSlideView: ({ markdown }: { markdown: string }) => <h1>{markdown.replace(/^# /, '')}</h1> }))
vi.mock('@/components/media/DeckPagePreview', () => ({
  DeckPagePreview: ({ label, className }: { label: string; className?: string }) => (
    <div className={className}>{label}</div>
  ),
}))

describe('DeckPagesEditor', () => {
  it('uploads slides at the end of the deck', async () => {
    const user = userEvent.setup()
    const onAdd = vi.fn()
    const { container } = render(<DeckPagesEditor mediaId="m" pages={[{ id: 'one', blob_id: '', markdown: '# Welcome' }, { id: 'two', blob_id: 'b2' }]} onAddMarkdown={vi.fn()} onMarkdownChange={vi.fn()} onReorder={vi.fn()} onRemove={vi.fn()} onReplace={vi.fn()} onAdd={onAdd} onSectionTitleChange={vi.fn()} onRemoveSection={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: 'media.deck.uploadSlides' }))
    const file = new File(['image'], 'slide.png', { type: 'image/png' })
    await user.upload(container.querySelector<HTMLInputElement>('input[multiple]')!, file)
    expect(onAdd).toHaveBeenCalledWith([file], 2)
  })

  it('edits a Markdown page and can add another', async () => {
    const user = userEvent.setup()
    const onMarkdownChange = vi.fn()
    const onAddMarkdown = vi.fn()
    render(<DeckPagesEditor mediaId="m" pages={[{ id: 'one', blob_id: '', markdown: '# Welcome' }]} onAddMarkdown={onAddMarkdown} onMarkdownChange={onMarkdownChange} onReorder={vi.fn()} onRemove={vi.fn()} onReplace={vi.fn()} onAdd={vi.fn()} onSectionTitleChange={vi.fn()} onRemoveSection={vi.fn()} />)
    expect(screen.getByRole('heading', { name: 'Welcome' })).toBeInTheDocument()
    await user.type(screen.getByLabelText('media.deck.markdownSource:1'), '!')
    expect(onMarkdownChange).toHaveBeenCalledWith('one', '# Welcome!')
    await user.click(screen.getByRole('button', { name: 'media.deck.addMarkdown' }))
    expect(onAddMarkdown).toHaveBeenCalledOnce()
  })

  it('M3: makes each page sortable and exposes page actions in its context menu', async () => {
    const user = userEvent.setup()
    const onReorder = vi.fn()
    const onRemove = vi.fn()
    const onRemoveSection = vi.fn()
    const onSectionTitleChange = vi.fn()
    render(
      <DeckPagesEditor
        mediaId="media:1"
        pages={[
          { id: 'p1', blob_id: 'b1', section_title: 'Section 1' },
          { id: 'p2', blob_id: 'b2' },
        ]}
        onAddMarkdown={vi.fn()}
        onMarkdownChange={vi.fn()}
        onReorder={onReorder}
        onRemove={onRemove}
        onReplace={vi.fn()}
        onAdd={vi.fn()}
        onSectionTitleChange={onSectionTitleChange}
        onRemoveSection={onRemoveSection}
      />,
    )
    expect(screen.getByRole('list', { name: 'media.deck.listAria' })).toBeInTheDocument()
    const firstPage = screen.getByRole('button', { name: 'media.deck.reorderHandle:1' })
    expect(firstPage).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'media.deck.reorderHandle:2' })).toBeInTheDocument()
    expect(firstPage.querySelector('span.rounded-full')).toBeNull()
    expect(screen.getByLabelText('media.deck.sectionTitleAria:1')).toHaveValue('Section 1')
    // Every page owns a control on both of its visual edges.
    expect(within(firstPage).getAllByRole('button', { name: 'media.deck.startSection' })).toHaveLength(2)
    const secondPage = screen.getByRole('button', { name: 'media.deck.reorderHandle:2' })
    expect(within(secondPage).getAllByRole('button', { name: 'media.deck.startSection' })).toHaveLength(2)
    await user.click(within(firstPage).getAllByRole('button', { name: 'media.deck.startSection' })[1]!)
    await user.click(within(firstPage).getAllByRole('button', { name: 'media.deck.startSection' }).at(-1)!)
    expect(onSectionTitleChange).toHaveBeenCalledWith('p2', 'Section 2')
    expect(screen.queryByRole('button', { name: 'media.deck.addPages' })).not.toBeInTheDocument()
    await user.pointer({ keys: '[MouseRight]', target: firstPage })
    await user.click(await screen.findByRole('menuitem', { name: 'media.deck.removePage' }))
    expect(onRemove).toHaveBeenCalledWith('p1')
  })

  it('M5: shows an empty-guard hint when there are no pages', () => {
    render(
      <DeckPagesEditor
        mediaId="media:1"
        pages={[]}
        onAddMarkdown={vi.fn()}
        onMarkdownChange={vi.fn()}
        onReorder={vi.fn()}
        onRemove={vi.fn()}
        onReplace={vi.fn()}
        onAdd={vi.fn()}
        onSectionTitleChange={vi.fn()}
        onRemoveSection={vi.fn()}
      />,
    )
    expect(screen.getByText('media.deck.empty')).toBeInTheDocument()
  })

  it('reports the selected boundary when adding slides', async () => {
    const user = userEvent.setup()
    const onAdd = vi.fn()
    const { container } = render(
      <DeckPagesEditor
        mediaId="media:1"
        pages={[
          { id: 'p1', blob_id: 'b1' },
          { id: 'p2', blob_id: 'b2' },
          { id: 'p3', blob_id: 'b3' },
        ]}
        onAddMarkdown={vi.fn()}
        onMarkdownChange={vi.fn()}
        onReorder={vi.fn()}
        onRemove={vi.fn()}
        onReplace={vi.fn()}
        onAdd={onAdd}
        onSectionTitleChange={vi.fn()}
        onRemoveSection={vi.fn()}
      />,
    )
    const secondPage = screen.getByRole('button', { name: 'media.deck.reorderHandle:2' })
    const fileInput = container.querySelector<HTMLInputElement>('input[multiple]')!

    await user.click(within(secondPage).getAllByRole('button', { name: 'media.deck.startSection' })[0]!)
    await user.click(within(secondPage).getByRole('button', { name: 'media.deck.addSlides' }))
    const beforeFile = new File(['before'], 'before.png', { type: 'image/png' })
    await user.upload(fileInput, beforeFile)
    expect(onAdd).toHaveBeenLastCalledWith([beforeFile], 1)

    await user.click(within(secondPage).getAllByRole('button', { name: 'media.deck.startSection' })[1]!)
    await user.click(within(secondPage).getByRole('button', { name: 'media.deck.addSlides' }))
    const afterFile = new File(['after'], 'after.png', { type: 'image/png' })
    await user.upload(fileInput, afterFile)
    expect(onAdd).toHaveBeenLastCalledWith([afterFile], 2)
  })

  it('offers marker-only and whole-section removal', async () => {
    const user = userEvent.setup()
    const onReorder = vi.fn()
    const onRemoveSection = vi.fn()
    render(
      <DeckPagesEditor
        mediaId="media:1"
        pages={[
          { id: 'p1', blob_id: 'b1', section_title: 'Section 1' },
          { id: 'p2', blob_id: 'b2' },
          { id: 'p3', blob_id: 'b3', section_title: 'Section 2' },
        ]}
        onAddMarkdown={vi.fn()}
        onMarkdownChange={vi.fn()}
        onReorder={onReorder}
        onRemove={vi.fn()}
        onReplace={vi.fn()}
        onAdd={vi.fn()}
        onSectionTitleChange={vi.fn()}
        onRemoveSection={onRemoveSection}
      />,
    )

    await user.click(screen.getAllByRole('button', { name: 'media.deck.removeSection' })[0]!)
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'media.deck.removeSectionMarker' }))
    expect(onRemoveSection).toHaveBeenCalledWith('p1')

    await user.click(screen.getAllByRole('button', { name: 'media.deck.removeSection' })[0]!)
    await user.click(screen.getByRole('button', { name: 'media.deck.removeSectionSlides' }))
    expect(onReorder).toHaveBeenCalledWith([
      { id: 'p3', blob_id: 'b3', section_title: 'Section 2' },
    ])
  })

  it('collapses and expands the slides in a section', async () => {
    const user = userEvent.setup()
    render(
      <DeckPagesEditor
        mediaId="media:1"
        pages={[
          { id: 'p1', blob_id: 'b1', section_title: 'Section 1' },
          { id: 'p2', blob_id: 'b2' },
          { id: 'p3', blob_id: 'b3', section_title: 'Section 2' },
          { id: 'p4', blob_id: 'b4' },
        ]}
        onAddMarkdown={vi.fn()}
        onMarkdownChange={vi.fn()}
        onReorder={vi.fn()}
        onRemove={vi.fn()}
        onReplace={vi.fn()}
        onAdd={vi.fn()}
        onSectionTitleChange={vi.fn()}
        onRemoveSection={vi.fn()}
      />,
    )

    const collapse = screen.getByRole('button', { name: 'media.deck.collapseSection:1' })
    expect(collapse).toHaveAttribute('aria-expanded', 'true')
    await user.click(collapse)

    expect(screen.queryByRole('button', { name: 'media.deck.reorderHandle:1' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'media.deck.reorderHandle:2' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'media.deck.reorderHandle:3' })).toBeInTheDocument()
    const expand = screen.getByRole('button', { name: 'media.deck.expandSection:1' })
    expect(expand).toHaveAttribute('aria-expanded', 'false')

    await user.click(expand)
    expect(screen.getByRole('button', { name: 'media.deck.reorderHandle:1' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'media.deck.reorderHandle:2' })).toBeInTheDocument()
  })

  it('keeps spaces while editing a section title', async () => {
    const user = userEvent.setup()
    const onSectionTitleChange = vi.fn()
    render(
      <DeckPagesEditor
        mediaId="media:1"
        pages={[{ id: 'p1', blob_id: 'b1', section_title: 'New' }]}
        onAddMarkdown={vi.fn()}
        onMarkdownChange={vi.fn()}
        onReorder={vi.fn()}
        onRemove={vi.fn()}
        onReplace={vi.fn()}
        onAdd={vi.fn()}
        onSectionTitleChange={onSectionTitleChange}
        onRemoveSection={vi.fn()}
      />,
    )
    const input = screen.getByLabelText('media.deck.sectionTitleAria:1')
    await user.type(input, ' ')
    expect(onSectionTitleChange).toHaveBeenLastCalledWith('p1', 'New ')
  })

  it('keeps every edge control attached to its neighboring slide', async () => {
    const user = userEvent.setup()
    const onSectionTitleChange = vi.fn()
    render(
      <DeckPagesEditor
        mediaId="media:1"
        pages={[
          { id: 'p1', blob_id: 'b1', section_title: 'Section 1' },
          { id: 'p2', blob_id: 'b2' },
          { id: 'p3', blob_id: 'b3', section_title: 'Section 2' },
        ]}
        onAddMarkdown={vi.fn()}
        onMarkdownChange={vi.fn()}
        onReorder={vi.fn()}
        onRemove={vi.fn()}
        onReplace={vi.fn()}
        onAdd={vi.fn()}
        onSectionTitleChange={onSectionTitleChange}
        onRemoveSection={vi.fn()}
      />,
    )

    const pages = [1, 2, 3].map((number) =>
      screen.getByRole('button', { name: `media.deck.reorderHandle:${number}` }),
    )
    for (const page of pages) {
      const edgeControls = within(page).getAllByRole('button', { name: 'media.deck.startSection' })
      expect(edgeControls).toHaveLength(2)
      for (const control of edgeControls) {
        expect(control.parentElement).toHaveClass(
          'opacity-0',
          'hover:opacity-100',
          'focus-within:opacity-100',
        )
      }
    }

    const thirdPageFrontControl = within(pages[2]!).getAllByRole('button', {
      name: 'media.deck.startSection',
    })[0]!
    await user.hover(thirdPageFrontControl)
    expect(within(pages[2]!).getByText('media.deck.pageLabel:3')).toHaveClass('sm:translate-x-4')
    expect(within(pages[1]!).getByText('media.deck.pageLabel:2')).toHaveClass('sm:-translate-x-4')
    expect(within(pages[0]!).getByText('media.deck.pageLabel:1')).not.toHaveClass(
      'sm:-translate-x-4',
      'sm:translate-x-4',
    )

    await user.click(thirdPageFrontControl)
    await user.click(within(pages[2]!).getAllByRole('button', { name: 'media.deck.startSection' })[1]!)

    expect(onSectionTitleChange).toHaveBeenCalledWith('p3', 'Section 2')

    // The trailing edge still supports adding slides, but cannot start a section without a following slide.
    await user.click(within(pages[2]!).getAllByRole('button', { name: 'media.deck.startSection' })[1]!)
    expect(within(pages[2]!).getByRole('button', { name: 'media.deck.addSlides' })).toBeInTheDocument()
    expect(within(pages[2]!).getAllByRole('button', { name: 'media.deck.startSection' })).toHaveLength(2)
  })
})
