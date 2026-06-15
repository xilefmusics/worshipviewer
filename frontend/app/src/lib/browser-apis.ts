export function listenToMediaQuery(
  mediaQuery: MediaQueryList,
  listener: () => void,
): () => void {
  if (typeof mediaQuery.addEventListener === 'function') {
    mediaQuery.addEventListener('change', listener)
    return () => mediaQuery.removeEventListener('change', listener)
  }

  mediaQuery.addListener(listener)
  return () => mediaQuery.removeListener(listener)
}

export function observeElementResize(
  element: Element,
  listener: ResizeObserverCallback,
): () => void {
  if (typeof globalThis.ResizeObserver !== 'function') {
    listener([], {} as ResizeObserver)
    return () => {}
  }

  const observer = new ResizeObserver(listener)
  observer.observe(element)
  return () => observer.disconnect()
}

export function observeElementIntersection(
  element: Element,
  listener: IntersectionObserverCallback,
  options?: IntersectionObserverInit,
): () => void {
  if (typeof globalThis.IntersectionObserver !== 'function') {
    listener(
      [
        {
          isIntersecting: true,
          target: element,
        } as IntersectionObserverEntry,
      ],
      {} as IntersectionObserver,
    )
    return () => {}
  }

  const observer = new IntersectionObserver(listener, options)
  observer.observe(element)
  return () => observer.disconnect()
}
