import type { QueryClient } from '@tanstack/react-query'

import { api } from '@/api/client'
import { fetchCollectionDetail } from '@/api/collections-detail'
import { problemMessageFromBody } from '@/api/problem'
import type { components } from '@/api/schema'
import { fetchSetlistDetail } from '@/api/setlists-detail'
import { redirectToLoginAfterUnauthorized } from '@/lib/api-unauthorized'

export type CreateSetlistBody = components['schemas']['CreateSetlist']
export type CreateCollectionBody = components['schemas']['CreateCollection']

export function duplicateTitle(original: string, suffix: string): string {
  const trimmed = original.trim()
  const base = trimmed || '—'
  const normalizedSuffix = suffix.trim()
  return normalizedSuffix ? `${base} ${normalizedSuffix}` : base
}

export function buildDuplicateSetlistBody(
  source: components['schemas']['Setlist'],
  titleSuffix: string,
): CreateSetlistBody {
  return {
    title: duplicateTitle(source.title, titleSuffix),
    songs: source.songs,
    owner: source.owner,
  }
}

export function buildDuplicateCollectionBody(
  source: components['schemas']['Collection'],
  titleSuffix: string,
): CreateCollectionBody {
  return {
    title: duplicateTitle(source.title, titleSuffix),
    cover: source.cover,
    songs: source.songs,
    owner: source.owner,
  }
}

async function postSetlist(
  queryClient: QueryClient,
  body: CreateSetlistBody,
): Promise<{ id: string; title: string }> {
  const { data, error, response } = await api.POST('/api/v1/setlists', { body })
  if (response.status === 401) {
    await redirectToLoginAfterUnauthorized(queryClient)
    throw new Error('Unauthorized')
  }
  if (!response.ok) {
    throw new Error(problemMessageFromBody(error, `Duplicate failed (${response.status})`))
  }
  if (!data?.id) throw new Error('Empty response')
  return { id: data.id, title: data.title }
}

async function postCollection(
  queryClient: QueryClient,
  body: CreateCollectionBody,
): Promise<{ id: string; title: string }> {
  const { data, error, response } = await api.POST('/api/v1/collections', { body })
  if (response.status === 401) {
    await redirectToLoginAfterUnauthorized(queryClient)
    throw new Error('Unauthorized')
  }
  if (!response.ok) {
    throw new Error(problemMessageFromBody(error, `Duplicate failed (${response.status})`))
  }
  if (!data?.id) throw new Error('Empty response')
  return { id: data.id, title: data.title }
}

export async function duplicateSetlist(
  queryClient: QueryClient,
  id: string,
  titleSuffix: string,
): Promise<{ id: string; title: string }> {
  const source = await fetchSetlistDetail(queryClient, { id })
  return postSetlist(queryClient, buildDuplicateSetlistBody(source, titleSuffix))
}

export async function duplicateCollection(
  queryClient: QueryClient,
  id: string,
  titleSuffix: string,
): Promise<{ id: string; title: string }> {
  const source = await fetchCollectionDetail(queryClient, { id })
  return postCollection(queryClient, buildDuplicateCollectionBody(source, titleSuffix))
}
