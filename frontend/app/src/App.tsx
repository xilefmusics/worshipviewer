import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { RouterProvider } from '@tanstack/react-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { router } from '@/app-router'
import { SessionLoadingFallback } from '@/components/SessionLoadingFallback'
import {
  HUB_LISTS_PERSIST_BUSTER,
  createHubListsQueryPersister,
  hubListsDehydrateOptions,
} from '@/lib/query-persistence'
import { queryClient } from '@/lib/query-client'
import { PwaInstallProvider } from '@/pwa/PwaInstallProvider'
import { PwaUpdateProvider } from '@/pwa/PwaUpdateProvider'

const hubListsPersister = createHubListsQueryPersister()

export function App() {
  const { t } = useTranslation()
  const [persistReady, setPersistReady] = useState(false)

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister: hubListsPersister,
        buster: HUB_LISTS_PERSIST_BUSTER,
        maxAge: Number.POSITIVE_INFINITY,
        dehydrateOptions: hubListsDehydrateOptions,
      }}
      onSuccess={() => setPersistReady(true)}
      onError={() => setPersistReady(true)}
    >
      {!persistReady ? (
        <SessionLoadingFallback label={t('common.load')} />
      ) : (
        <PwaInstallProvider>
          <PwaUpdateProvider>
            <RouterProvider router={router} />
          </PwaUpdateProvider>
        </PwaInstallProvider>
      )}
    </PersistQueryClientProvider>
  )
}
