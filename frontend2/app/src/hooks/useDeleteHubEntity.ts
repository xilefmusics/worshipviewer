import { useMutation, useQueryClient } from '@tanstack/react-query'

import { api } from '@/api/client'
import { ApiUnauthorizedError } from '@/api/list-fetch'
import { redirectToLoginAfterUnauthorized } from '@/lib/api-unauthorized'
import type { HubEntity } from '@/lib/hub-entity'
import { hubListRootKey } from '@/lib/hub-list-keys'

export function useDeleteHubEntity(entity: HubEntity) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const response: Response = await (async () => {
        switch (entity) {
          case 'collections': {
            const r = await api.DELETE('/api/v1/collections/{id}', {
              params: { path: { id } },
            })
            return r.response
          }
          case 'songs': {
            const r = await api.DELETE('/api/v1/songs/{id}', {
              params: { path: { id } },
            })
            return r.response
          }
          case 'setlists': {
            const r = await api.DELETE('/api/v1/setlists/{id}', {
              params: { path: { id } },
            })
            return r.response
          }
        }
      })()
      if (response.status === 401) {
        await redirectToLoginAfterUnauthorized(queryClient)
        throw new ApiUnauthorizedError()
      }
      if (!response.ok && response.status !== 204) {
        throw new Error(`Delete failed (${response.status})`)
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: hubListRootKey })
    },
  })
}
