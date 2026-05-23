import { describe, expect, it } from 'vitest'

import { getLoadedCount, getNextPageIndex, parseTotalCount } from '@/lib/list-pagination'

function mockResponse(headers: Record<string, string>): Response {
  return new Response(null, { headers })
}

describe('parseTotalCount', () => {
  it('reads x-total-count case-insensitively', () => {
    expect(parseTotalCount(mockResponse({ 'x-total-count': '42' }))).toBe(42)
    expect(parseTotalCount(mockResponse({ 'X-Total-Count': '7' }))).toBe(7)
  })

  it('returns undefined when missing or invalid', () => {
    expect(parseTotalCount(mockResponse({}))).toBeUndefined()
    expect(parseTotalCount(mockResponse({ 'x-total-count': 'nope' }))).toBeUndefined()
  })
})

describe('getNextPageIndex', () => {
  it('returns undefined without total header', () => {
    expect(getNextPageIndex([{ items: [1, 2], total: undefined }])).toBeUndefined()
  })

  it('returns undefined when all items loaded', () => {
    expect(getNextPageIndex([{ items: [1, 2], total: 2 }])).toBeUndefined()
  })

  it('returns next page index when more items exist', () => {
    expect(getNextPageIndex([{ items: [1], total: 5 }])).toBe(1)
    expect(
      getNextPageIndex([
        { items: [1], total: 5 },
        { items: [2], total: 5 },
      ]),
    ).toBe(2)
  })
})

describe('getLoadedCount', () => {
  it('sums item lengths', () => {
    expect(getLoadedCount([{ items: [1, 2] }, { items: [3] }])).toBe(3)
  })
})
