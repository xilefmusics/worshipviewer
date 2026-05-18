import Dexie, { type Table } from 'dexie'

/** Versioned DB — placeholder stores until offline/E4; same wipe path from day one. */
export const DB_NAME = 'worshipviewer'
export const DB_VERSION = 3

type PlaceholderRow = { id: string }

/** String key/value rows for app-level persistence (e.g. React Query cache blobs). */
export type KvRow = { key: string; value: string }

/** Mirrored setlist `GET .../player` JSON for offline emergency playback. */
export type SetlistPlayerMirrorRow = {
  setlistId: string
  playerJson: string
  blobIds: string[]
  lastOpenedAt: number
}

/** Cached blob bytes for offline player items (shared across setlists). */
export type OfflineBlobRow = {
  blobId: string
  bytes: ArrayBuffer
  /** From `Content-Type` when mirroring; used for `Blob` / object URLs. */
  mime: string | null
  lastTouchedAt: number
}

export class WorshipViewerDexie extends Dexie {
  placeholder!: Table<PlaceholderRow, string>
  kv!: Table<KvRow, string>
  setlistPlayerMirror!: Table<SetlistPlayerMirrorRow, string>
  offlineBlobs!: Table<OfflineBlobRow, string>

  constructor() {
    super(DB_NAME)
    this.version(1).stores({
      placeholder: 'id',
    })
    this.version(2).stores({
      placeholder: 'id',
      kv: 'key',
    })
    this.version(3).stores({
      placeholder: 'id',
      kv: 'key',
      setlistPlayerMirror: 'setlistId',
      offlineBlobs: 'blobId',
    })
  }
}

export const appDb = new WorshipViewerDexie()
