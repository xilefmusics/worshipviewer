import { QueryClient } from '@tanstack/react-query'
import { createRootRouteWithContext, Outlet, type ErrorComponentProps } from '@tanstack/react-router'

import { useTranslation } from 'react-i18next'
import { Toaster } from 'sonner'

import { isNetworkError } from '@/lib/session-cache'

export interface RouterAppContext {
  queryClient: QueryClient
}

export const Route = createRootRouteWithContext<RouterAppContext>()({
  component: RootLayout,
  errorComponent: RootError,
})

function RootLayout() {
  return (
    <div className="min-h-dvh bg-[var(--color-bg)] text-[var(--color-foreground)] antialiased">
      <Toaster
        position="top-center"
        closeButton
        theme="system"
        toastOptions={{
          classNames: {
            toast:
              'border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-foreground)]',
            title: 'text-[var(--color-foreground)]',
            description: 'text-[var(--color-muted-foreground)]',
            actionButton: 'bg-[var(--color-primary)] text-[var(--color-primary-foreground)]',
            cancelButton: 'bg-[var(--color-muted)] text-[var(--color-foreground)]',
            closeButton:
              'border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-foreground)]',
          },
        }}
      />
      <Outlet />
    </div>
  )
}

function bootstrapErrorMessage(error: Error, t: (key: string) => string): string {
  if (isNetworkError(error)) {
    return t('offline.bootstrapFailed')
  }
  const msg = error.message.toLowerCase()
  if (msg.includes('failed to fetch') || msg.includes('network')) {
    return t('offline.bootstrapFailed')
  }
  return error.message
}

function RootError({ error }: ErrorComponentProps) {
  const { t } = useTranslation()
  const message =
    error instanceof Error ? bootstrapErrorMessage(error, t) : t('offline.bootstrapFailed')
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-[var(--color-bg)] p-6 text-center">
      <p className="text-lg font-medium text-[var(--color-foreground)]">{message}</p>
      <a className="text-[var(--color-primary)] underline" href="/">
        {t('notFound.home')}
      </a>
    </div>
  )
}
