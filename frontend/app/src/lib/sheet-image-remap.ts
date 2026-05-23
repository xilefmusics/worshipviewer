export type Rgb = readonly [red: number, green: number, blue: number]

/** Lossy JPEGs are usually photos, not B&W scans — skip luminance remapping. */
export function shouldRemapSheetImageMime(mime: string | null | undefined): boolean {
  if (!mime) return false
  const normalized = mime.toLowerCase()
  if (normalized.includes('pdf')) return false
  if (normalized.includes('jpeg') || normalized.includes('jpg')) return false
  return normalized.startsWith('image/')
}

let colorProbeCanvas: HTMLCanvasElement | null = null

/** Resolve any supported CSS color string to sRGB bytes (uses a 1×1 canvas probe). */
export function resolveCssColorToRgb(color: string): Rgb {
  if (typeof globalThis.document === 'undefined') {
    return [255, 255, 255]
  }

  if (!colorProbeCanvas) {
    colorProbeCanvas = globalThis.document.createElement('canvas')
    colorProbeCanvas.width = 1
    colorProbeCanvas.height = 1
  }

  const ctx = colorProbeCanvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return [255, 255, 255]

  ctx.clearRect(0, 0, 1, 1)
  ctx.fillStyle = color
  ctx.fillRect(0, 0, 1, 1)
  const [red, green, blue] = ctx.getImageData(0, 0, 1, 1).data
  return [red, green, blue]
}

export function readPlayerSheetRgb(
  root: HTMLElement = globalThis.document.documentElement,
): { bg: Rgb; fg: Rgb } {
  const probe = globalThis.document.createElement('div')
  probe.style.backgroundColor = 'var(--player-sheet-bg)'
  probe.style.color = 'var(--player-sheet-fg)'
  probe.style.display = 'none'
  root.appendChild(probe)

  const styles = globalThis.getComputedStyle(probe)
  const colors = {
    bg: resolveCssColorToRgb(styles.backgroundColor),
    fg: resolveCssColorToRgb(styles.color),
  }

  probe.remove()
  return colors
}

/** Map scan luminance: white paper → bg, black ink → fg. */
export function remapSheetScanImageData(imageData: ImageData, bg: Rgb, fg: Rgb): void {
  const { data } = imageData
  for (let i = 0; i < data.length; i += 4) {
    const alpha = data[i + 3]
    if (alpha === 0) continue

    const lum =
      (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]) / 255
    data[i] = Math.round(bg[0] * lum + fg[0] * (1 - lum))
    data[i + 1] = Math.round(bg[1] * lum + fg[1] * (1 - lum))
    data[i + 2] = Math.round(bg[2] * lum + fg[2] * (1 - lum))
    data[i + 3] = 255
  }
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Failed to load sheet image'))
    img.src = url
  })
}

/** Produce a blob URL whose pixels use the current player sheet colors. */
export async function remapSheetImageFromUrl(sourceUrl: string): Promise<string> {
  const img = await loadImage(sourceUrl)
  const canvas = globalThis.document.createElement('canvas')
  canvas.width = img.naturalWidth
  canvas.height = img.naturalHeight

  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas is unavailable')

  ctx.drawImage(img, 0, 0)
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const { bg, fg } = readPlayerSheetRgb()
  remapSheetScanImageData(imageData, bg, fg)
  ctx.putImageData(imageData, 0, 0)

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((result) => {
      if (result) resolve(result)
      else reject(new Error('Failed to encode remapped sheet image'))
    }, 'image/png')
  })

  return URL.createObjectURL(blob)
}
