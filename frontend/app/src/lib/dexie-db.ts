import Dexie, { type Table } from 'dexie'

/** Versioned DB — placeholder stores until offline/E4; same wipe path from day one. */
export const DB_NAME = 'worshipviewer'
export const DB_VERSION = 6

type PlaceholderRow = { id: string }

/** String key/value rows for app-level persistence (e.g. React Query cache blobs). */
export type KvRow = { key: string; value: string }

export type PlayerMirrorEntityType = 'setlist' | 'collection' | 'song'

/** Mirrored `GET .../player` JSON for offline playback. */
export type PlayerMirrorRow = {
  /** `${entityType}:${entityId}` */
  id: string
  entityType: PlayerMirrorEntityType
  entityId: string
  playerJson: string
  lastOpenedAt: number
  /** Optional label for settings / management UI */
  title?: string
}

/** @deprecated Use PlayerMirrorRow */
export type SetlistPlayerMirrorRow = PlayerMirrorRow & { setlistId: string }

export function playerMirrorId(
  entityType: PlayerMirrorEntityType,
  entityId: string,
): string {
  return `${entityType}:${entityId}`
}

export class WorshipViewerDexie extends Dexie {
  placeholder!: Table<PlaceholderRow, string>
  kv!: Table<KvRow, string>
  /** Legacy table — migrated to playerMirror in v5 */
  setlistPlayerMirror!: Table<SetlistPlayerMirrorRow, string>
  playerMirror!: Table<PlayerMirrorRow, string>

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
    this.version(4).stores({
      placeholder: 'id',
      kv: 'key',
      setlistPlayerMirror: 'setlistId, lastOpenedAt',
      offlineBlobs: 'blobId',
    })
    this.version(5)
      .stores({
        placeholder: 'id',
        kv: 'key',
        setlistPlayerMirror: 'setlistId, lastOpenedAt',
        playerMirror: 'id, entityType, entityId, lastOpenedAt',
        offlineBlobs: 'blobId',
      })
      .upgrade(async (tx) => {
        const legacy = await tx.table('setlistPlayerMirror').toArray()
        const target = tx.table('playerMirror')
        for (const row of legacy) {
          const entityId = row.setlistId as string
          await target.put({
            id: playerMirrorId('setlist', entityId),
            entityType: 'setlist',
            entityId,
            playerJson: row.playerJson,
            lastOpenedAt: row.lastOpenedAt,
          })
        }
      })
    this.version(6)
      .stores({
        placeholder: 'id',
        kv: 'key',
        setlistPlayerMirror: 'setlistId, lastOpenedAt',
        playerMirror: 'id, entityType, entityId, lastOpenedAt',
      })
      .upgrade(async (tx) => {
        await tx.table('offlineBlobs').clear()
      })
  }
}

export const appDb = new WorshipViewerDexie()
