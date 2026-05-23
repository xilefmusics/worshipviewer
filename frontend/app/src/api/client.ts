import createClient from 'openapi-fetch'

import type { paths } from './schema'

/**
 * Same-origin production: `VITE_API_BASE_URL` empty. Cookie auth requires `credentials: 'include'`.
 */
export const api = createClient<paths>({
  baseUrl: import.meta.env.VITE_API_BASE_URL ?? '',
  credentials: 'include',
})
