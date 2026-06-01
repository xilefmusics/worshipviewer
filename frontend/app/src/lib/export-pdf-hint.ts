import { needsSafariPdfPrintHint } from '@/lib/platform'

/** Tooltip for PDF export menu items (base hint + Safari headers note when relevant). */
export function exportPdfHintTitle(baseHint: string, safariHeadersHint: string): string {
  if (!needsSafariPdfPrintHint()) {
    return baseHint
  }
  return `${baseHint} ${safariHeadersHint}`
}
