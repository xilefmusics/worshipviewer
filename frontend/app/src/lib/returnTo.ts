/**
 * Same-origin app path + query allowlist for post-login redirects (OAuth `redirect_to` and in-app `return_to`).
 * Rejects protocol-relative URLs, external hosts, and obvious open-redirect patterns.
 */
export function sanitizeAppRedirect(raw: string | undefined | null, fallback = '/'): string {
  if (raw == null || typeof raw !== 'string') return fallback
  const s = raw.trim()
  if (!s.startsWith('/') || s.startsWith('//')) return fallback
  const lower = s.toLowerCase()
  if (lower.startsWith('/http') || lower.startsWith('/\\\\')) return fallback

  let pathWithQuery: string
  try {
    const u = new URL(s, 'https://wv.local')
    pathWithQuery = `${u.pathname}${u.search}${u.hash}`
  } catch {
    return fallback
  }

  if (!pathWithQuery.startsWith('/') || pathWithQuery.startsWith('//')) return fallback
  return rewriteExcludedPostLoginEditorPaths(pathWithQuery) || fallback
}

/** Editor detail URLs are not safe post-login edit destinations (E7.1 / E7.2). */
function rewriteExcludedPostLoginEditorPaths(pathWithQuery: string): string {
  try {
    const u = new URL(pathWithQuery, 'https://wv.local')
    if (/^\/setlists\/[^/]+$/.test(u.pathname)) {
      return '/setlists'
    }
    if (/^\/collections\/[^/]+$/.test(u.pathname)) {
      return '/collections'
    }
  } catch {
    /* keep pathWithQuery */
  }
  return pathWithQuery
}

/** Build `/auth/login?redirect_to=` value (API uses `redirect_to` per OpenAPI). */
export function buildAuthLoginRedirectParam(pathWithQuery: string): string {
  return sanitizeAppRedirect(pathWithQuery, '/')
}
