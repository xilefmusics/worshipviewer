export function layoutChordSpacing(root: HTMLElement): void {
  const gap = 3

  root.querySelectorAll<HTMLElement>('.part-has-chord').forEach((part) => {
    part.style.marginLeft = ''
  })
  root.querySelectorAll('.chord-word-gap').forEach((wordGap) => wordGap.remove())

  root
    .querySelectorAll<HTMLElement>('.columns p, .player-chords-three-column__section p')
    .forEach((line) => {
      let lineTop: number | null = null
      let rightmostChord: number | null = null

      line.querySelectorAll<HTMLElement>('.part-has-chord').forEach((part) => {
        const chord = part.querySelector<HTMLElement>(':scope > .chord')
        const text = part.querySelector<HTMLElement>(':scope > .text, :scope > .comment')
        if (!chord || !text) return

        let textTop = text.getBoundingClientRect().top
        if (lineTop === null || Math.abs(textTop - lineTop) > 1) {
          lineTop = textTop
          rightmostChord = null
        }

        const page = part.closest<HTMLElement>('.page')
        const pageScale =
          page && page.offsetWidth > 0 ? page.getBoundingClientRect().width / page.offsetWidth : 1
        const chordRect = chord.getBoundingClientRect()

        if (rightmostChord !== null) {
          const overlap = (rightmostChord - chordRect.left) / pageScale
          if (overlap > 0) {
            const requiredGap = overlap + gap
            if (part.classList.contains('part-starts-inside-word')) {
              const wordGap = document.createElement('span')
              wordGap.className = 'chord-word-gap'
              wordGap.textContent = '-'
              part.before(wordGap)
              const hyphenWidth = wordGap.getBoundingClientRect().width / pageScale
              wordGap.style.width = `${Math.max(requiredGap, hyphenWidth)}px`
            } else {
              part.style.marginLeft = `${requiredGap}px`
            }

            textTop = text.getBoundingClientRect().top
            if (Math.abs(textTop - lineTop) > 1) {
              lineTop = textTop
              rightmostChord = null
            }
          }
        }

        const currentRight = chord.getBoundingClientRect().right
        rightmostChord = Math.max(rightmostChord ?? currentRight, currentRight)
      })
    })
}
