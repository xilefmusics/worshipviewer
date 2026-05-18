import './index.css'

import { QueryClient } from '@tanstack/react-query'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { createRouter, RouterProvider } from '@tanstack/react-router'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { routeTree } from './routeTree.gen'
import { initI18n } from '@/i18n'
import { initAppearance } from '@/lib/appearance'
import { initLogoutQueue } from '@/lib/logout-queue'
import {
  HUB_LISTS_PERSIST_BUSTER,
  createHubListsQueryPersister,
  hubListsDehydrateOptions,
} from '@/lib/query-persistence'
import { PwaInstallProvider } from '@/pwa/PwaInstallProvider'
import { PwaRegistration } from '@/pwa/PwaRegistration'

initAppearance()
initI18n()

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (c) => c < 1,
    },
  },
})

initLogoutQueue()

const hubListsPersister = createHubListsQueryPersister()

const router = createRouter({
  routeTree,
  context: {
    queryClient,
  },
  defaultPreload: 'intent',
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister: hubListsPersister,
        buster: HUB_LISTS_PERSIST_BUSTER,
        maxAge: Number.POSITIVE_INFINITY,
        dehydrateOptions: hubListsDehydrateOptions,
      }}
    >
      <PwaInstallProvider>
        <RouterProvider router={router} />
        <PwaRegistration />
      </PwaInstallProvider>
    </PersistQueryClientProvider>
  </StrictMode>,
)
