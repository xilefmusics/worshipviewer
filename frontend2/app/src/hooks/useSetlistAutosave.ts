import { useCallback, useEffect, useRef, useState } from 'react'

import { useQueryClient } from '@tanstack/react-query'

import { api } from '@/api/client'
import { parseProblemResponse } from '@/api/problem'
import type { components } from '@/api/schema'

import { hubListRootKey } from '@/lib/hub-list-keys'
import { parseRetryAfterSeconds } from '@/lib/http-retry-after'
import { buildSetlistPatchBody } from '@/lib/setlist-field-diff'
import { setlistDetailKey } from '@/lib/setlist-detail-key'

import { normalizeSongLinksForEditor, type EditorSongLink } from '@/lib/setlist-song-links'

type Setlist = components['schemas']['Setlist']

const DEBOUNCE_MS = 750

export type SaveIconState = 'idle' | 'pending' | 'saving' | 'error'

/** Best-effort flush when unloading (small PATCH body). */
function keepalivePatchSetlist(id: string, body: Record<string, unknown>) {
  const base = import.meta.env.VITE_API_BASE_URL ?? ''
  const url = `${base}/api/v1/setlists/${encodeURIComponent(id)}`
  try {
    void fetch(url, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      keepalive: true,
    })
  } catch {
    /* ignore */
  }
}

export function useSetlistAutosave({
  setlistId,
  baseline,
  draftTitle,
  draftSongs,
  draftOwner,
  canAutosavePatch,
}: {
  setlistId: string
  baseline: Pick<Setlist, 'title' | 'songs' | 'owner'> | null
  draftTitle: string
  draftSongs: EditorSongLink[]
  draftOwner: string
  /** false for read-only hub, offline frozen, broken slots gate, missing baseline */
  canAutosavePatch: boolean
}) {
  const queryClient = useQueryClient()
  const [patchInFlight, setPatchInFlight] = useState(false)
  const [saveIcon, setSaveIcon] = useState<SaveIconState>('idle')

  /** Full §2.5 save failure banner (blocked input until retry/discard). */
  const [saveFailure, setSaveFailure] = useState<{
    message: string
    failedBody: NonNullable<ReturnType<typeof buildSetlistPatchBody>>
    retryAfterUntil: number | null
  } | null>(null)

  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const needFollowUpPatch = useRef(false)
  const baselineRef = useRef(baseline)
  const draftTitleRef = useRef(draftTitle)
  const draftSongsRef = useRef(draftSongs)
  const patchInFlightRef = useRef(false)

  const draftOwnerRef = useRef(draftOwner)

  useEffect(() => {
    baselineRef.current = baseline
  }, [baseline])

  useEffect(() => {
    draftTitleRef.current = draftTitle
  }, [draftTitle])

  useEffect(() => {
    draftSongsRef.current = draftSongs
  }, [draftSongs])

  useEffect(() => {
    draftOwnerRef.current = draftOwner
  }, [draftOwner])

  const clearDebounceTimer = useCallback(() => {
    if (debounceTimer.current != null) {
      clearTimeout(debounceTimer.current)
      debounceTimer.current = null
    }
  }, [])

  const invalidateHubPassive = useCallback(() => {
    void queryClient.invalidateQueries({
      queryKey: [...hubListRootKey, 'setlists'],
      refetchType: 'none',
    })
  }, [queryClient])

  const applyServerSetlistToCache = useCallback(
    (data: Setlist) => {
      queryClient.setQueryData(setlistDetailKey(setlistId), data)
      invalidateHubPassive()
    },
    [invalidateHubPassive, queryClient, setlistId],
  )

  const sendPatchInner = useCallback(
    async (body: NonNullable<ReturnType<typeof buildSetlistPatchBody>>) => {
      const base = baselineRef.current
      if (!base) return false
      patchInFlightRef.current = true
      setPatchInFlight(true)
      setSaveIcon((s) => (s === 'idle' ? 'saving' : 'saving'))
      try {
        const { response, error, data } = await api.PATCH('/api/v1/setlists/{id}', {
          params: { path: { id: setlistId } },
          body,
        })
        if (!response.ok) {
          let msg =
            typeof error === 'object' && error && 'title' in error
              ? String((error as { title?: string }).title)
              : ''
          if (!msg) {
            const problem = await parseProblemResponse(response.clone())
            msg = problem?.title ?? ''
          }
          msg = msg || `Save failed (${response.status})`

          let retryUntil: number | null = null
          if (response.status === 429) {
            const sec = parseRetryAfterSeconds(response)
            if (sec != null) retryUntil = Date.now() + sec * 1000
          }
          setSaveFailure({ message: msg, failedBody: body, retryAfterUntil: retryUntil })
          setSaveIcon('error')
          patchInFlightRef.current = false
          setPatchInFlight(false)
          return false
        }
        const next = data as Setlist | undefined
        if (next) {
          applyServerSetlistToCache(next)
          baselineRef.current = {
            title: next.title,
            songs: normalizeSongLinksForEditor(next.songs),
            owner: next.owner,
          }
        }
        setSaveFailure(null)
        setSaveIcon('idle')
        patchInFlightRef.current = false
        setPatchInFlight(false)
        return true
      } catch {
        setSaveFailure({
          message: 'Network error — check your connection.',
          failedBody: body,
          retryAfterUntil: null,
        })
        setSaveIcon('error')
        patchInFlightRef.current = false
        setPatchInFlight(false)
        return false
      }
    },
    [applyServerSetlistToCache, setlistId],
  )

  const flush = useCallback(
    async (): Promise<boolean> => {
      clearDebounceTimer()
      const base = baselineRef.current
      if (!canAutosavePatch || !base || saveFailure) return false

      const body = buildSetlistPatchBody(base, {
        title: draftTitleRef.current,
        songs: draftSongsRef.current,
        owner: draftOwnerRef.current,
      })
      if (!body) {
        setSaveIcon('idle')
        return true
      }

      if (patchInFlightRef.current) {
        needFollowUpPatch.current = true
        return true
      }

      const ok = await sendPatchInner(body)

      if (needFollowUpPatch.current) {
        needFollowUpPatch.current = false
        const b = baselineRef.current
        if (b) {
          const nextBody = buildSetlistPatchBody(b, {
            title: draftTitleRef.current,
            songs: draftSongsRef.current,
            owner: draftOwnerRef.current,
          })
          if (nextBody) {
            await sendPatchInner(nextBody)
          }
        }
      }
      return ok
    },
    [canAutosavePatch, clearDebounceTimer, saveFailure, sendPatchInner],
  )

  const notifyDraftEdited = useCallback(() => {
    clearDebounceTimer()
    if (!canAutosavePatch || !baselineRef.current || saveFailure) {
      setSaveIcon('idle')
      return
    }

    const body = buildSetlistPatchBody(baselineRef.current, {
      title: draftTitleRef.current,
      songs: draftSongsRef.current,
      owner: draftOwnerRef.current,
    })
    if (!body) {
      setSaveIcon('idle')
      return
    }

    setSaveIcon('pending')
    debounceTimer.current = setTimeout(() => {
      debounceTimer.current = null
      void flush()
    }, DEBOUNCE_MS)
  }, [canAutosavePatch, clearDebounceTimer, flush, saveFailure])

  const flushSyncForUnload = useCallback(() => {
    clearDebounceTimer()
    const base = baselineRef.current
    if (!base || saveFailure || !canAutosavePatch) return
    const body = buildSetlistPatchBody(base, {
      title: draftTitleRef.current,
      songs: draftSongsRef.current,
      owner: draftOwnerRef.current,
    })
    if (body) keepalivePatchSetlist(setlistId, body)
  }, [canAutosavePatch, clearDebounceTimer, saveFailure, setlistId])

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'hidden') {
        void flush()
      }
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [flush])

  useEffect(() => {
    const onPageHide = () => flushSyncForUnload()
    globalThis.addEventListener('pagehide', onPageHide)
    return () => globalThis.removeEventListener('pagehide', onPageHide)
  }, [flushSyncForUnload])

  useEffect(() => {
    const onBeforeUnload = () => {
      flushSyncForUnload()
    }
    globalThis.addEventListener('beforeunload', onBeforeUnload)
    return () => globalThis.removeEventListener('beforeunload', onBeforeUnload)
  }, [flushSyncForUnload])

  useEffect(() => {
    return () => {
      flushSyncForUnload()
    }
  }, [flushSyncForUnload, setlistId])

  useEffect(() => {
    if (!canAutosavePatch) {
      clearDebounceTimer()
    }
  }, [canAutosavePatch, clearDebounceTimer])

  const retrySave = useCallback(async () => {
    if (!saveFailure) return
    const body = saveFailure.failedBody
    setSaveFailure(null)
    setSaveIcon('saving')
    await sendPatchInner(body)
  }, [saveFailure, sendPatchInner])

  const discardFailedSave = useCallback(() => {
    if (!saveFailure || !baselineRef.current) return undefined
    setSaveFailure(null)
    setSaveIcon('idle')
    const base = baselineRef.current
    return {
      title: base.title,
      songs: normalizeSongLinksForEditor(base.songs),
      owner: base.owner,
    }
  }, [saveFailure])

  return {
    notifyDraftEdited,
    flushNow: flush,
    patchInFlight,
    saveIcon,
    saveFailure,
    retrySave,
    discardFailedSave,
  }
}
