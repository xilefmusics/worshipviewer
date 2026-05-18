export function setlistDetailKey(id: string) {
  return ['setlistDetail', id] as const
}

export function collectionDetailKey(id: string) {
  return ['collectionDetail', id] as const
}

/** Canonical React Query key for `GET /api/v1/songs/{id}` (setlist rows, detail views, etc.). */
export function songDetailQueryKey(id: string) {
  return ['song', 'detail', id] as const
}

