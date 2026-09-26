import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ComponentProps, ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { PatchSongData } from '@/lib/song-editor-state'
import type { ChordEngine, ChordSongData } from '@/ports/chord-engine'

let autosaveDraft: PatchSongData | null = null

const songInC: ChordSongData = {
  titles: ['Test song'],
  artists: [''],
  languages: [''],
  key: { level: 3 },
  sections: [
    {
      lines: [
        {
          parts: [
            {
              chord: { main: { level: 7 }, base: { level: 10 } },
              languages: ['Line'],
            },
          ],
        },
      ],
    },
  ],
}

const engine = {
  parseChordPro: (source: string) => JSON.parse(source) as ChordSongData,
  parseMarkdown: (source: string) => JSON.parse(source) as ChordSongData,
  parsePdf: () => ({}),
  parseSongBeamer: () => ({}),
  parseProPresenter: () => ({}),
  parseUltimateGuitarHtml: () => ({}),
  formatChordPro: vi.fn((song: ChordSongData) => JSON.stringify(song)),
  formatMarkdown: vi.fn((song: ChordSongData) => JSON.stringify(song)),
  formatSongBeamer: () => new Uint8Array(),
  formatProPresenter: () => new Uint8Array(),
  renderA4Html: () => ({ html: '', css: '' }),
  renderA4SectionHtmls: () => ({ sections: [], css: '' }),
  transpose: (song: ChordSongData) => song,
  fillSectionReferences: (song: ChordSongData) => song,
  flowItems: () => [],
  customFlow: () => [],
  applyFlow: (song: ChordSongData) => song,
} as ChordEngine

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}))

vi.mock('@/hooks/useSongDetailQuery', () => ({
  useSongDetailQuery: () => ({
    data: {
      id: 'song-1',
      owner: 'user:test',
      not_a_song: false,
      data: songInC,
    },
    isPending: false,
    error: null,
    refetch: vi.fn(),
  }),
}))

vi.mock('@/hooks/useCanEditSong', () => ({ useCanEditSong: () => ({ canEdit: true }) }))
vi.mock('@/hooks/useChordFormatPreference', () => ({ useChordFormatPreference: () => 'letters' }))
vi.mock('@/hooks/use-online', () => ({ useOnline: () => true }))
vi.mock('@/lib/chord-engine', () => ({ getChordEngine: async () => engine }))
vi.mock('@/context/SongEditorNavigationBridgeContext', () => ({
  useRegisterSongEditorNavigationBridge: vi.fn(),
}))

const autosaveResult = {
  markDraftDirty: vi.fn(),
  flushNow: vi.fn(async () => true),
  patchInFlight: false,
  saveIcon: 'idle' as const,
  saveFailure: null,
  saveRevision: 0,
  retrySave: vi.fn(),
  discardFailedSave: vi.fn(),
}

vi.mock('@/hooks/useSongAutosave', () => ({
  useSongAutosave: ({ draft }: { draft: PatchSongData | null }) => {
    autosaveDraft = draft
    return autosaveResult
  },
}))

vi.mock('@/lib/song-editor-compose', () => ({
  composeSectionsFromSongData: () => [],
  mergeSongDataWithComposeSections: (song: ChordSongData) => song,
}))

vi.mock('@/components/songs/SongEditorCompose', () => ({
  SongEditorCompose: () => <div />,
}))

vi.mock('@/components/songs/SongEditorSource', () => ({
  SongEditorSource: ({ value, onChange }: { value: string; onChange: (value: string) => void }) => (
    <textarea value={value} onChange={(event) => onChange(event.target.value)} />
  ),
}))

vi.mock('@/components/ui/select', () => ({
  Select: ({
    children,
    value,
    onValueChange,
    disabled,
  }: {
    children: ReactNode
    value: string
    onValueChange: (value: string) => void
    disabled?: boolean
  }) => (
    <select
      value={value}
      disabled={disabled}
      onChange={(event) => onValueChange(event.target.value)}
    >
      {children}
    </select>
  ),
  SelectContent: ({ children }: { children: ReactNode }) => children,
  SelectItem: ({ children, value }: { children: ReactNode; value: string }) => (
    <option value={value}>{children}</option>
  ),
  SelectTrigger: ({ children }: { children: ReactNode }) => children,
  SelectValue: () => null,
}))

vi.mock('@/components/ui/alert-dialog', () => ({
  AlertDialog: ({ children, open }: { children: ReactNode; open: boolean }) =>
    open ? <div>{children}</div> : null,
  AlertDialogCancel: (props: ComponentProps<'button'>) => <button {...props} />,
  AlertDialogContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  AlertDialogDescription: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  AlertDialogFooter: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  AlertDialogHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  AlertDialogTitle: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))

import { SongEditorScreen } from '@/components/songs/SongEditorScreen'

function savedChordLevel(): number | undefined {
  const sections = autosaveDraft?.sections as
    | Array<{ lines?: Array<{ parts?: Array<{ chord?: { main?: { level?: number } } }> }> }>
    | undefined
  return sections?.[0]?.lines?.[0]?.parts?.[0]?.chord?.main?.level
}

function savedBassLevel(): number | undefined {
  const sections = autosaveDraft?.sections as
    | Array<{
        lines?: Array<{
          parts?: Array<{ chord?: { base?: { level?: number } } }>
        }>
      }>
    | undefined
  return sections?.[0]?.lines?.[0]?.parts?.[0]?.chord?.base?.level
}

describe('SongEditorScreen key changes', () => {
  beforeEach(() => {
    autosaveDraft = null
    vi.clearAllMocks()
  })

  it.each([
    ['songs.editor.keyChangeTranspose', 7, 10],
    ['songs.editor.keyChangeKeep', 5, 8],
  ])(
    'keeps the %s result in the autosave draft',
    async (buttonName, expectedLevel, expectedBassLevel) => {
      const user = userEvent.setup()
      render(<SongEditorScreen songId="song-1" />)

      const keySelect = await screen.findByLabelText('songs.editor.keyLabel')
      await user.selectOptions(keySelect, 'D')
      await user.click(screen.getByRole('button', { name: buttonName }))

      await waitFor(() => {
        expect(autosaveDraft?.key).toEqual({ level: 5 })
        expect(savedChordLevel()).toBe(expectedLevel)
        expect(savedBassLevel()).toBe(expectedBassLevel)
      })
    },
  )
})

describe('SongEditorScreen Markdown mode', () => {
  beforeEach(() => {
    autosaveDraft = null
    vi.clearAllMocks()
  })

  it('switches to Markdown, autosaves Markdown edits, and switches back to ChordPro', async () => {
    const user = userEvent.setup()
    render(<SongEditorScreen songId="song-1" />)

    await user.click(await screen.findByRole('tab', { name: 'songs.editor.tabs.markdown' }))
    expect(engine.formatMarkdown).toHaveBeenCalled()

    const source = screen.getByRole('textbox')
    fireEvent.change(source, {
      target: { value: JSON.stringify({ ...songInC, titles: ['Markdown title'] }) },
    })

    await waitFor(() => expect(autosaveDraft?.titles).toEqual(['Markdown title']))

    await user.click(screen.getByRole('tab', { name: 'songs.editor.tabs.advanced' }))
    expect(engine.formatChordPro).toHaveBeenCalled()
  })
})
