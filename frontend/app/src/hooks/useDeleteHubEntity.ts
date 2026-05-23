import { useMutation, useQueryClient } from '@tanstack/react-query'

import { api } from '@/api/client'
import { ApiUnauthorizedError } from '@/api/list-fetch'
import { parseProblemResponse } from '@/api/problem'
import { redirectToLoginAfterUnauthorized } from '@/lib/api-unauthorized'
import type { HubEntity } from '@/lib/hub-entity'
import { hubListRootKey } from '@/lib/hub-list-keys'

export class HubDeleteConflictError extends Error {
  readonly code: 'collection_not_empty'

  constructor(code: 'collection_not_empty', message: string) {
    super(message)
    this.name = 'HubDeleteConflictError'
    this.code = code
  }
}

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
        const problem = await parseProblemResponse(response.clone())
        if (response.status === 409 && entity === 'collections') {
          throw new HubDeleteConflictError(
            'collection_not_empty',
            problem?.title ??
              'Cannot delete a collection that still contains songs; remove all songs first.',
          )
        }
        throw new Error(problem?.title ?? `Delete failed (${response.status})`)
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: hubListRootKey })
    },
  })
}
