/**
 * Remove chord symbols from chordlib A4 HTML while keeping lyrics and section titles.
 */
export function stripChordsFromChordlibHtml(html: string): string {
  if (typeof document === 'undefined') return html

  const root = document.createElement('div')
  root.innerHTML = html

  root.querySelectorAll('.bars').forEach((el) => el.remove())
  root.querySelectorAll('.chord').forEach((el) => el.remove())
  root.querySelectorAll('.part-has-chord').forEach((el) => el.classList.remove('part-has-chord'))
  root.querySelectorAll('.text').forEach((el) => {
    if (!el.textContent?.trim()) el.remove()
  })

  return root.innerHTML
}
