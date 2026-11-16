import { afterEach, describe, expect, it, vi } from 'vitest'

import { createUploadedMedia, uploadMediaSource } from '@/api/media-upload'

const uploadedMedia = {
  id: 'media:uploaded',
  owner: 'team:1',
  title: 'Uploaded',
  content: { type: 'slide_deck' as const, pages: [{ blob_id: 'asset:1' }] },
}

class FakeXmlHttpRequest {
  static requests: FakeXmlHttpRequest[] = []

  readonly upload: { onprogress: ((event: ProgressEvent) => void) | null } = {
    onprogress: null,
  }
  status = 200
  responseText = ''
  method = ''
  url = ''
  body: Document | XMLHttpRequestBodyInit | null = null
  headers: Record<string, string> = {}
  withCredentials = false
  responseType: XMLHttpRequestResponseType = ''
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  onabort: (() => void) | null = null

  constructor() {
    FakeXmlHttpRequest.requests.push(this)
  }

  open(method: string, url: string) {
    this.method = method
    this.url = url
  }

  setRequestHeader(name: string, value: string) {
    this.headers[name] = value
  }

  send(body: Document | XMLHttpRequestBodyInit | null) {
    this.body = body
    if (this.method === 'POST' && this.url.endsWith('/upload-sessions')) {
      this.status = 201
      this.responseText = JSON.stringify({ id: 'session-1', chunk_size_bytes: 4 })
    } else if (this.url.endsWith('/complete')) {
      this.status = this.url.includes('session-asset') ? 200 : 201
      this.responseText = JSON.stringify(uploadedMedia)
    } else if (this.method === 'DELETE') {
      this.status = 204
      this.responseText = ''
    } else {
      this.status = 204
      this.responseText = ''
      if (body instanceof Blob) {
        this.upload.onprogress?.({
          lengthComputable: true,
          loaded: body.size,
          total: body.size,
        } as ProgressEvent)
      }
    }
    queueMicrotask(() => this.onload?.())
  }

  abort() {
    this.onabort?.()
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
  FakeXmlHttpRequest.requests = []
})

describe('chunked media uploads', () => {
  it('uploads ordered sources in bounded chunks before creating media', async () => {
    vi.stubGlobal('XMLHttpRequest', FakeXmlHttpRequest)
    const first = new File(['first'], 'first.png', { type: 'image/png' })
    const second = new File(['second'], 'second.pdf', { type: 'application/pdf' })
    const progress: number[] = []

    await expect(
      createUploadedMedia({
        kind: 'slide_deck',
        title: 'Deck',
        owner: 'team:1',
        files: [first, second],
        onProgress: (value) => progress.push(value),
      }),
    ).resolves.toMatchObject({ id: 'media:uploaded', content: { type: 'slide_deck' } })

    const requests = FakeXmlHttpRequest.requests
    expect(requests.map(({ method, url }) => [method, url])).toEqual([
      ['POST', '/api/v1/media/upload-sessions'],
      ['PUT', '/api/v1/media/upload-sessions/session-1/sources/0/chunks/0'],
      ['PUT', '/api/v1/media/upload-sessions/session-1/sources/0/chunks/1'],
      ['PUT', '/api/v1/media/upload-sessions/session-1/sources/1/chunks/0'],
      ['PUT', '/api/v1/media/upload-sessions/session-1/sources/1/chunks/1'],
      ['POST', '/api/v1/media/upload-sessions/session-1/complete'],
    ])
    expect(requests[0]?.withCredentials).toBe(true)
    expect(JSON.parse(requests[0]?.body as string)).toEqual({
      target: {
        type: 'create',
        kind: 'slide_deck',
        metadata: { title: 'Deck', owner: 'team:1' },
      },
      sources: [
        { byte_length: first.size, content_type: 'image/png' },
        { byte_length: second.size, content_type: 'application/pdf' },
      ],
    })
    expect(await (requests[1]?.body as Blob).text()).toBe('firs')
    expect(await (requests[2]?.body as Blob).text()).toBe('t')
    expect(await (requests[3]?.body as Blob).text()).toBe('seco')
    expect(await (requests[4]?.body as Blob).text()).toBe('nd')
    expect(progress.at(-1)).toBe(1)
  })

  it('uses the same session flow for replacing an existing asset', async () => {
    vi.stubGlobal('XMLHttpRequest', FakeXmlHttpRequest)
    const file = new File(['video'], 'clip.mp4', { type: 'video/mp4' })

    await uploadMediaSource({
      mediaId: 'media:1',
      kind: 'video',
      file,
      replacePage: 'page:1',
      role: 'thumbnail',
    })

    const requests = FakeXmlHttpRequest.requests
    expect(JSON.parse(requests[0]?.body as string)).toEqual({
      target: {
        type: 'asset',
        media_id: 'media:1',
        kind: 'video',
        replace_page: 'page:1',
        role: 'thumbnail',
      },
      sources: [{ byte_length: file.size, content_type: 'video/mp4' }],
    })
    expect(requests[1]?.url).toBe('/api/v1/media/upload-sessions/session-1/sources/0/chunks/0')
    expect(requests[2]?.url).toBe('/api/v1/media/upload-sessions/session-1/sources/0/chunks/1')
    expect(await (requests[1]?.body as Blob).text()).toBe('vide')
    expect(await (requests[2]?.body as Blob).text()).toBe('o')
    expect(requests[3]?.url).toBe('/api/v1/media/upload-sessions/session-1/complete')
  })
})
