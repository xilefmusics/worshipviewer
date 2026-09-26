import { afterEach, describe, expect, it, vi } from 'vitest'

import { createUploadedMedia } from '@/api/media-upload'

class FakeXmlHttpRequest {
  static latest: FakeXmlHttpRequest | undefined

  readonly upload: { onprogress: ((event: ProgressEvent) => void) | null } = {
    onprogress: null,
  }
  status = 201
  responseText = JSON.stringify({
    id: 'media:deck',
    owner: 'team:1',
    title: 'Deck',
    content: { type: 'slide_deck', pages: [{ blob_id: 'asset:1' }] },
  })
  method = ''
  url = ''
  body: Document | XMLHttpRequestBodyInit | null = null
  withCredentials = false
  responseType: XMLHttpRequestResponseType = ''
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  onabort: (() => void) | null = null

  constructor() {
    FakeXmlHttpRequest.latest = this
  }

  open(method: string, url: string) {
    this.method = method
    this.url = url
  }

  send(body: Document | XMLHttpRequestBodyInit | null) {
    this.body = body
    queueMicrotask(() => this.onload?.())
  }

  abort() {
    this.onabort?.()
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
  FakeXmlHttpRequest.latest = undefined
})

describe('createUploadedMedia', () => {
  it('posts ordered files and JSON metadata as one multipart request', async () => {
    vi.stubGlobal('XMLHttpRequest', FakeXmlHttpRequest)
    const first = new File(['first'], 'first.png', { type: 'image/png' })
    const second = new File(['second'], 'second.pdf', { type: 'application/pdf' })

    await expect(
      createUploadedMedia({
        kind: 'slide_deck',
        title: 'Deck',
        owner: 'team:1',
        files: [first, second],
      }),
    ).resolves.toMatchObject({ id: 'media:deck', content: { type: 'slide_deck' } })

    const request = FakeXmlHttpRequest.latest
    expect(request?.method).toBe('POST')
    expect(request?.url).toBe('/api/v1/media/uploads?kind=slide_deck')
    expect(request?.withCredentials).toBe(true)
    expect(request?.body).toBeInstanceOf(FormData)
    const form = request?.body as FormData
    expect(await (form.get('metadata') as Blob).text()).toBe(
      JSON.stringify({ title: 'Deck', owner: 'team:1' }),
    )
    expect(form.getAll('file')).toEqual([first, second])
  })

  it('includes the background flag when requested', async () => {
    vi.stubGlobal('XMLHttpRequest', FakeXmlHttpRequest)

    await createUploadedMedia({
      kind: 'image',
      title: 'Background',
      owner: 'team:1',
      isBackground: true,
      files: [new File(['image'], 'background.png', { type: 'image/png' })],
    })

    const form = FakeXmlHttpRequest.latest?.body as FormData
    expect(await (form.get('metadata') as Blob).text()).toBe(
      JSON.stringify({ title: 'Background', owner: 'team:1', is_background: true }),
    )
  })
})
