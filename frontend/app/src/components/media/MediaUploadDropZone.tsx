import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { cn } from '@/lib/utils'

export function MediaUploadDropZone({
  disabled = false,
  pending = false,
  progress = null,
  accept = 'image/png,image/jpeg,image/svg+xml,application/pdf,video/*,audio/*,.png,.jpg,.jpeg,.svg,.pdf',
  onFiles,
}: {
  disabled?: boolean
  pending?: boolean
  progress?: number | null
  accept?: string
  onFiles: (files: File[]) => void
}) {
  const { t } = useTranslation()
  const [isDropActive, setIsDropActive] = useState(false)
  return (
    <label
      className={cn(
        'flex min-h-16 min-w-0 flex-1 cursor-pointer items-center rounded-lg border border-dashed focus-within:ring-2 focus-within:ring-[var(--color-ring)] border-[var(--color-border)] px-4 py-3 transition-colors hover:bg-[var(--color-muted)]',
        isDropActive && 'border-[var(--color-primary)] bg-[var(--color-primary)]/5',
        disabled && 'cursor-not-allowed opacity-55',
      )}
      onDragEnter={(event) => {
        event.preventDefault()
        if (!disabled) setIsDropActive(true)
      }}
      onDragOver={(event) => {
        event.preventDefault()
        event.dataTransfer.dropEffect = 'copy'
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setIsDropActive(false)
        }
      }}
      onDrop={(event) => {
        event.preventDefault()
        setIsDropActive(false)
        if (disabled) return
        onFiles([...event.dataTransfer.files])
      }}
    >
      <input
        type="file"
        className="sr-only"
        multiple
        accept={accept}
        disabled={disabled}
        aria-label={t('setlists.editor.mediaQuickUploadAria')}
        onChange={(event) => {
          const files = [...(event.target.files ?? [])]
          if (files.length > 0) onFiles(files)
          event.target.value = ''
        }}
      />
      <span className="min-w-0">
        <span className="block text-sm font-medium">
          {pending
            ? t('media.upload.progress', {
                percent: Math.round((progress ?? 0) * 100),
              })
            : t('setlists.editor.mediaQuickUploadTitle')}
        </span>
        <span className="mt-0.5 block truncate text-xs text-[var(--color-muted-foreground)]">
          {t('setlists.editor.mediaQuickUploadHint')}
        </span>
      </span>
    </label>
  )
}
