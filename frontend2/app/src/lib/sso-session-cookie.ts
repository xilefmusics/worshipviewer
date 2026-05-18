const SSO_SESSION_COOKIE = 'sso_session'

/**
 * Value of the `sso_session` cookie if present in `document.cookie`.
 * **HttpOnly** session cookies are not visible here, so this returns `null` in the common case
 * and the UI cannot mark the current row without a server hint.
 */
export function readSsoSessionIdFromDocumentCookie(): string | null {
  if (typeof document === 'undefined') return null
  for (const part of document.cookie.split(';')) {
    const t = part.trim()
    if (!t.startsWith(`${SSO_SESSION_COOKIE}=`)) continue
    const raw = t.slice(SSO_SESSION_COOKIE.length + 1)
    try {
      const v = decodeURIComponent(raw).trim()
      return v || null
    } catch {
      return raw.trim() || null
    }
  }
  return null
}
