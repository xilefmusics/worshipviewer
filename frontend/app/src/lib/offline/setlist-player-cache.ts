/** @deprecated Import from player-mirror-cache */
export {
  enforceOfflineRetention,
  estimateKvTableBytes,
  estimateOfflinePlayerCacheBytes,
  evictOnePlayerMirror as evictOneSetlistMirror,
  fetchSetlistPlayerFromNetwork,
  getCachedBlob,
  loadOfflinePlayer as loadOfflineSetlistPlayer,
  persistPlayerMirror as persistSetlistPlayerMirror,
  touchPlayerOpened as touchSetlistPlayerOpened,
} from '@/lib/offline/player-mirror-cache'
