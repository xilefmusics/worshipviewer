import { beforeEach, describe, expect, it, vi } from 'vitest'

import { beginDeckRevision, commitDeck, createMedia, deleteMedia, duplicateMedia, fetchMediaPage, moveMedia, updateMedia } from '@/api/media'
import { api } from '@/api/client'

vi.mock('@/api/client', () => ({
  api: { GET: vi.fn(), POST: vi.fn(), PUT: vi.fn(), DELETE: vi.fn() },
}))
vi.mock('@/lib/api-unauthorized', () => ({ redirectToLoginAfterUnauthorized: vi.fn() }))

const queryClient = {} as never
const response = (status = 200, headers?: Record<string, string>) => new Response(null, { status, headers })
const media = { id: 'media:1', owner: 'team:1', title: 'Stream', content: { type: 'livestream' as const, stream_type: 'hls' as const, url: 'https://example.com/live.m3u8' } }

beforeEach(() => vi.clearAllMocks())

describe('Media API mapping', () => {
  it('maps debounced search, team filter, and pagination', async () => {
    vi.mocked(api.GET).mockResolvedValue({ data: [media], response: response(200, { 'X-Total-Count': '51' }) } as never)
    await expect(fetchMediaPage(queryClient, { page: 1, q: ' stream ', teamId: 'team:1' })).resolves.toEqual({ items: [media], total: 51 })
    expect(api.GET).toHaveBeenCalledWith('/api/v1/media', expect.objectContaining({ params: { query: { page: 1, page_size: 50, q: 'stream', team: 'team:1', is_background: undefined } } }))
  })

  it('maps the backgrounds-only filter to the API query', async () => {
    vi.mocked(api.GET).mockResolvedValue({ data: [media], response: response(200) } as never)
    await fetchMediaPage(queryClient, { page: 0, q: '', isBackground: true })
    expect(api.GET).toHaveBeenCalledWith('/api/v1/media', expect.objectContaining({
      params: { query: { page: 0, page_size: 50, q: undefined, team: undefined, is_background: true } },
    }))
  })

  it('maps create, edit, duplicate, move, and delete requests', async () => {
    vi.mocked(api.POST).mockResolvedValue({ data: media, response: response(201) } as never)
    vi.mocked(api.PUT).mockResolvedValue({ data: media, response: response() } as never)
    vi.mocked(api.DELETE).mockResolvedValue({ response: response(204) } as never)
    const content = { type: 'youtube' as const, url: 'https://youtu.be/dQw4w9WgXcQ' }
    await createMedia(queryClient, { title: 'Stream', owner: 'team:1', content })
    await updateMedia(queryClient, media.id, { title: 'Stream', owner: 'team:1', content })
    await duplicateMedia(queryClient, media.id, 'Stream (copy)')
    await moveMedia(queryClient, media.id, 'team:2')
    await deleteMedia(queryClient, media.id)
    expect(api.POST).toHaveBeenCalledWith('/api/v1/media', expect.objectContaining({ body: { title: 'Stream', owner: 'team:1', content } }))
    expect(api.PUT).toHaveBeenCalledWith('/api/v1/media/{id}', expect.objectContaining({ params: { path: { id: media.id } } }))
    expect(api.POST).toHaveBeenCalledWith('/api/v1/media/{id}/duplicate', expect.objectContaining({ body: { title: 'Stream (copy)' } }))
    expect(api.POST).toHaveBeenCalledWith('/api/v1/media/{id}/move', expect.objectContaining({ body: { owner: 'team:2' } }))
    expect(api.DELETE).toHaveBeenCalledWith('/api/v1/media/{id}', { params: { path: { id: media.id } } })
  })

  it('maps deck revision and commit requests', async () => {
    vi.mocked(api.POST).mockResolvedValue({ data: media, response: response() } as never)
    await beginDeckRevision(queryClient, media.id)
    await commitDeck(queryClient, media.id, { revision_id: 'rev1', page_ids: ['p1'] })
    expect(api.POST).toHaveBeenCalledWith('/api/v1/media/{id}/deck/revisions', expect.objectContaining({ params: { path: { id: media.id } } }))
    expect(api.POST).toHaveBeenCalledWith('/api/v1/media/{id}/deck/commit', expect.objectContaining({ body: { revision_id: 'rev1', page_ids: ['p1'] } }))
  })

  it('surfaces validation problem detail', async () => {
    vi.mocked(api.POST).mockResolvedValue({ error: { title: 'Bad URL', detail: 'Only HTTPS URLs are supported.' }, response: response(400) } as never)
    await expect(createMedia(queryClient, { title: 'Bad', owner: 'team:1', content: { type: 'youtube', url: 'http://youtu.be/dQw4w9WgXcQ' } })).rejects.toThrow('Only HTTPS URLs are supported.')
  })
})
