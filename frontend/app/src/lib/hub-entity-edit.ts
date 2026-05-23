import type { HubEntity } from '@/lib/hub-entity'

/** Splat segment for `navigate({ to: '/$', params: { _splat } })` until typed edit routes exist. */
export function hubEntityEditSplat(entity: HubEntity, id: string): string {
  return `${entity}/${encodeURIComponent(id)}/edit`
}
