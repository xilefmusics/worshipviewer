import { EditorView } from '@codemirror/view'

export const chordProEditorTheme = EditorView.theme(
  {
    '&': {
      backgroundColor: 'var(--color-surface)',
      color: 'var(--color-foreground)',
      borderRadius: '0.375rem',
      fontSize: '0.875rem',
    },
    '&.cm-focused': {
      outline: '2px solid var(--color-primary)',
      outlineOffset: '2px',
    },
    '.cm-scroller': {
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
      lineHeight: '1.5',
      overflow: 'auto',
      backgroundColor: 'var(--color-surface)',
    },
    '.cm-content': {
      padding: '0.5rem 0.75rem',
      caretColor: 'var(--color-primary)',
      minHeight: '55vh',
      backgroundColor: 'var(--color-surface)',
      color: 'var(--color-foreground)',
    },
    '.cm-line': {
      color: 'var(--color-foreground)',
    },
  '.cm-gutters': {
    display: 'none',
  },
  '.cm-activeLine': {
    backgroundColor: 'color-mix(in oklch, var(--color-muted) 35%, transparent)',
  },
  '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': {
    backgroundColor: 'color-mix(in oklch, var(--color-primary) 25%, transparent) !important',
  },
  '.cm-cursor': {
    borderLeftColor: 'var(--color-primary)',
  },
  '&.cm-editor.cm-readonly': {
    opacity: '0.5',
    cursor: 'not-allowed',
  },
  '.cm-tooltip-autocomplete': {
    backgroundColor: 'var(--color-surface)',
    border: '1px solid var(--color-border)',
    borderRadius: '0.375rem',
    boxShadow: 'var(--shadow-elevated, 0 4px 12px rgb(0 0 0 / 0.15))',
    color: 'var(--color-foreground)',
  },
  '.cm-tooltip-autocomplete ul li[aria-selected]': {
    backgroundColor: 'var(--color-primary)',
    color: 'var(--color-primary-foreground)',
  },
  '.cm-completionLabel': {
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
  },
})
