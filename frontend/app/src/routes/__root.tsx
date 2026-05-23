import { QueryClient } from '@tanstack/react-query'
import { createRootRouteWithContext, Outlet, type ErrorComponentProps } from '@tanstack/react-router'

import { useTranslation } from 'react-i18next'
import { Toaster } from 'sonner'

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

function RootError({ error }: ErrorComponentProps) {
  const { t } = useTranslation()
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-[var(--color-bg)] p-6 text-center">
      <p className="text-lg font-medium text-[var(--color-foreground)]">{error.message}</p>
      <a className="text-[var(--color-primary)] underline" href="/">
        {t('notFound.home')}
      </a>
    </div>
  )
}
