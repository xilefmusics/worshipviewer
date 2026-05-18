/** BPM / time-signature helpers shared by setlist rows and song picker. */

export function normalizedTempoBpm(tempo: unknown): number | null {
  if (tempo == null || typeof tempo !== 'number' || !Number.isFinite(tempo)) return null
  const rounded = Math.round(tempo)
  if (rounded <= 0 || rounded > 999) return null
  return rounded
}

export function formattedTimeSignature(time: unknown): string | null {
  if (!Array.isArray(time) || time.length < 2) return null
  const n = Number(time[0])
  const d = Number(time[1])
  if (!Number.isFinite(n) || !Number.isFinite(d)) return null
  const num = Math.round(n)
  const den = Math.round(d)
  if (num <= 0 || num > 64 || den <= 0 || den > 64) return null
  return `${num}/${den}`
}
