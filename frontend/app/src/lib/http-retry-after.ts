/** Parse `Retry-After` from a response (RFC 9110 delay-seconds or HTTP-date). */
export function parseRetryAfterSeconds(res: Response): number | undefined {
  const ra = res.headers.get('retry-after')
  if (!ra) return undefined
  const trimmed = ra.trim()

  if (/^\d+$/.test(trimmed)) {
    const numeric = Number(trimmed)
    return Number.isNaN(numeric) ? undefined : numeric
  }

  if (/^-\d+$/.test(trimmed)) return undefined

  const when = Date.parse(trimmed)
  if (!Number.isNaN(when)) {
    const s = Math.ceil((when - Date.now()) / 1000)
    return Math.max(0, s)
  }
  return undefined
}
