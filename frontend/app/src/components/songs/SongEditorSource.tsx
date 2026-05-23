import CodeMirror from '@uiw/react-codemirror'
import { EditorView } from '@codemirror/view'
import { useMemo } from 'react'

import { chordProAutocomplete } from '@/lib/chordpro-editor/autocomplete'
import { chordProLanguageSupport } from '@/lib/chordpro-editor/language'
import { chordProEditorTheme } from '@/lib/chordpro-editor/theme'
import { cn } from '@/lib/utils'

type SongEditorSourceProps = {
  id: string
  value: string
  readOnly: boolean
  onChange: (value: string) => void
  className?: string
}

export function SongEditorSource({ id, value, readOnly, onChange, className }: SongEditorSourceProps) {
  const extensions = useMemo(
    () => [
      chordProLanguageSupport(),
      chordProAutocomplete,
      EditorView.lineWrapping,
      EditorView.contentAttributes.of({ spellcheck: 'false' }),
    ],
    [],
  )

  return (
    <div
      className={cn(
        'min-h-[55vh] w-full resize-y overflow-hidden rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] shadow-sm',
        className,
      )}
    >
      <CodeMirror
        id={id}
        value={value}
        height="100%"
        minHeight="55vh"
        theme={chordProEditorTheme}
        extensions={extensions}
        readOnly={readOnly}
        basicSetup={{
          lineNumbers: false,
          foldGutter: false,
          highlightActiveLine: true,
          autocompletion: false,
        }}
        onChange={(next) => {
          if (!readOnly) onChange(next)
        }}
      />
    </div>
  )
}
