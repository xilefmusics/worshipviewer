export type AllowedImageMime = 'image/jpeg' | 'image/png'

/** Detect JPEG or PNG from magic bytes (matches backend profile picture validation). */
export function imageContentTypeFromBytes(data: ArrayBuffer | Uint8Array): AllowedImageMime | null {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data)
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg'
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return 'image/png'
  }
  return null
}
