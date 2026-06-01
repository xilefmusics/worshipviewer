import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, type RenderOptions } from '@testing-library/react'
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import { Toaster } from 'sonner'
import type { ReactElement, ReactNode } from 'react'

import en from '@/i18n/en.json'

let i18nReady = false

function ensureI18n() {
  if (i18nReady) return
  void i18n.use(initReactI18next).init({
    resources: { en: { translation: en } },
    lng: 'en',
    fallbackLng: 'en',
    interpolation: { escapeValue: false },
  })
  i18nReady = true
}

type Options = Omit<RenderOptions, 'wrapper'> & {
  queryClient?: QueryClient
}

export function renderWithProviders(ui: ReactElement, options: Options = {}) {
  ensureI18n()
  const queryClient =
    options.queryClient ??
    new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <Toaster position="top-center" />
        {children}
      </QueryClientProvider>
    )
  }

  return {
    queryClient,
    ...render(ui, { wrapper: Wrapper, ...options }),
  }
}
