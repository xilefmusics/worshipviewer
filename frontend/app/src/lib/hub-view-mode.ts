import { getLocalStorage, safeGetItem, safeSetItem } from '@/lib/browser-storage'
import type { HubEntity } from '@/lib/hub-entity'

export type HubLayoutMode = 'list' | 'card'

/** Stored collections layout preference (includes orientation-adaptive mode). */
export type HubViewMode = HubLayoutMode | 'adaptive'

export const COLLECTIONS_VIEW_MODE_KEY = 'wv.hub.viewMode.collections'
export const HUB_VIEW_MODE_CHANGE_EVENT = 'wv-hub-view-mode-change'

const COLLECTIONS_ENTITY: HubEntity = 'collections'

/** Default hub layout: list rows. Songs and setlists always use list. */
export function getDefaultViewMode(entity: HubEntity): HubViewMode {
  void entity
  return 'list'
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
  storage: Pick<Storage, 'getItem'> | null = getLocalStorage(),
): HubViewMode {
  const raw = safeGetItem(COLLECTIONS_VIEW_MODE_KEY, storage)
  if (isHubViewMode(raw)) return raw
  return 'list'
}

export function readHubViewMode(
  entity: HubEntity,
  storage: Pick<Storage, 'getItem'> | null = getLocalStorage(),
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
  storage: Pick<Storage, 'setItem'> | null = getLocalStorage(),
): void {
  safeSetItem(COLLECTIONS_VIEW_MODE_KEY, mode, storage)
  dispatchCollectionsViewModeChange(mode)
}

export function writeHubViewMode(
  entity: HubEntity,
  mode: HubViewMode,
  storage: Pick<Storage, 'setItem'> | null = getLocalStorage(),
): void {
  if (entity !== 'collections') return
  writeCollectionsViewMode(mode, storage)
}

/** @deprecated Use {@link COLLECTIONS_VIEW_MODE_KEY}. */
export function hubViewModeStorageKey(entity: HubEntity): string {
  return entity === 'collections' ? COLLECTIONS_VIEW_MODE_KEY : `wv.hub.viewMode.${entity}`
}
