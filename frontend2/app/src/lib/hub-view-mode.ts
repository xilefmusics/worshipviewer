import type { HubEntity } from '@/lib/hub-entity'

export type HubLayoutMode = 'list' | 'card'

/** Stored collections layout preference (includes orientation-adaptive mode). */
export type HubViewMode = HubLayoutMode | 'adaptive'

export const COLLECTIONS_VIEW_MODE_KEY = 'wv.hub.viewMode.collections'
export const HUB_VIEW_MODE_CHANGE_EVENT = 'wv-hub-view-mode-change'

const COLLECTIONS_ENTITY: HubEntity = 'collections'

/** Default collections layout: cards (A4-style). Songs and setlists are always list. */
export function getDefaultViewMode(entity: HubEntity): HubViewMode {
  return entity === 'collections' ? 'card' : 'list'
}

function isHubViewMode(value: string | null): value is HubViewMode {
  return value === 'list' || value === 'card' || value === 'adaptive'
}

/** Resolve stored preference to the layout used for rendering. */
export function resolveCollectionsLayoutMode(
  preference: HubViewMode,
  isLandscape: boolean,
): HubLayoutMode {
  if (preference === 'adaptive') return isLandscape ? 'card' : 'list'
  return preference
}

export function readCollectionsViewMode(
  storage: Pick<Storage, 'getItem'> = globalThis.localStorage,
): HubViewMode {
  try {
    const raw = storage.getItem(COLLECTIONS_VIEW_MODE_KEY)
    if (isHubViewMode(raw)) return raw
  } catch {
    /* ignore */
  }
  return 'card'
}

export function readHubViewMode(
  entity: HubEntity,
  storage: Pick<Storage, 'getItem'> = globalThis.localStorage,
): HubViewMode {
  if (entity !== 'collections') return 'list'
  return readCollectionsViewMode(storage)
}

function dispatchCollectionsViewModeChange(mode: HubViewMode): void {
  if (typeof globalThis.window !== 'undefined') {
    globalThis.window.dispatchEvent(
      new CustomEvent(HUB_VIEW_MODE_CHANGE_EVENT, {
        detail: { entity: COLLECTIONS_ENTITY, mode },
      }),
    )
  }
}

export function writeCollectionsViewMode(
  mode: HubViewMode,
  storage: Pick<Storage, 'setItem'> = globalThis.localStorage,
): void {
  try {
    storage.setItem(COLLECTIONS_VIEW_MODE_KEY, mode)
  } catch {
    /* ignore */
  }
  dispatchCollectionsViewModeChange(mode)
}

export function writeHubViewMode(
  entity: HubEntity,
  mode: HubViewMode,
  storage: Pick<Storage, 'setItem'> = globalThis.localStorage,
): void {
  if (entity !== 'collections') return
  writeCollectionsViewMode(mode, storage)
}

/** @deprecated Use {@link COLLECTIONS_VIEW_MODE_KEY}. */
export function hubViewModeStorageKey(entity: HubEntity): string {
  return entity === 'collections' ? COLLECTIONS_VIEW_MODE_KEY : `wv.hub.viewMode.${entity}`
}
