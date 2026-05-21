import { useCallback, useEffect, useRef, useState } from 'react'

import { useQueryClient } from '@tanstack/react-query'

import { api } from '@/api/client'
import { parseProblemResponse } from '@/api/problem'
import type { components } from '@/api/schema'

import { hubListRootKey } from '@/lib/hub-list-keys'
import { parseRetryAfterSeconds } from '@/lib/http-retry-after'
import { buildSongPatchBody } from '@/lib/song-patch-body'
import { songDetailQueryKey } from '@/lib/setlist-detail-key'
import { patchSongDataFromSongData, type PatchSongData } from '@/lib/song-editor-state'
import type { ChordSongData } from '@/ports/chord-engine'

type Song = components['schemas']['Song']

const DEBOUNCE_MS = 750

export type SaveIconState = 'idle' | 'pending' | 'saving' | 'error'

function keepalivePatchSong(id: string, body: Record<string, unknown>) {
  const base = import.meta.env.VITE_API_BASE_URL ?? ''
  const url = `${base}/api/v1/songs/${encodeURIComponent(id)}`
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

export function useSongAutosave({
  songId,
  baseline,
  draft,
  canAutosavePatch,
}: {
  songId: string
  baseline: PatchSongData | null
  draft: PatchSongData | null
  /** false when read-only, offline, parse invalid, or missing baseline */
  canAutosavePatch: boolean
}) {
  const queryClient = useQueryClient()
  const [patchInFlight, setPatchInFlight] = useState(false)
  const [saveIcon, setSaveIcon] = useState<SaveIconState>('idle')

  const [saveFailure, setSaveFailure] = useState<{
    message: string
    failedBody: NonNullable<ReturnType<typeof buildSongPatchBody>>
    retryAfterUntil: number | null
  } | null>(null)

  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const needFollowUpPatch = useRef(false)
  const baselineRef = useRef(baseline)
  const draftRef = useRef(draft)
  const patchInFlightRef = useRef(false)

  useEffect(() => {
    baselineRef.current = baseline
  }, [baseline])

  useEffect(() => {
    draftRef.current = draft
  }, [draft])

  const clearDebounceTimer = useCallback(() => {
    if (debounceTimer.current != null) {
      clearTimeout(debounceTimer.current)
      debounceTimer.current = null
    }
  }, [])

  const invalidateHubPassive = useCallback(() => {
    void queryClient.invalidateQueries({
      queryKey: [...hubListRootKey, 'songs'],
      refetchType: 'none',
    })
  }, [queryClient])

  const applyServerSongToCache = useCallback(
    (data: Song) => {
      queryClient.setQueryData(songDetailQueryKey(songId), data)
      invalidateHubPassive()
    },
    [invalidateHubPassive, queryClient, songId],
  )

  const sendPatchInner = useCallback(
    async (body: NonNullable<ReturnType<typeof buildSongPatchBody>>) => {
      const base = baselineRef.current
      if (!base) return false
      patchInFlightRef.current = true
      setPatchInFlight(true)
      setSaveIcon('saving')
      try {
        const { response, error, data } = await api.PATCH('/api/v1/songs/{id}', {
          params: { path: { id: songId } },
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
        const next = data as Song | undefined
        if (next) {
          applyServerSongToCache(next)
          baselineRef.current = patchSongDataFromSongData(next.data as ChordSongData)
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
    [applyServerSongToCache, songId],
  )

  const flush = useCallback(async (): Promise<boolean> => {
    clearDebounceTimer()
    const base = baselineRef.current
    const currentDraft = draftRef.current
    if (!canAutosavePatch || !base || !currentDraft || saveFailure) return false

    const body = buildSongPatchBody(base, currentDraft)
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
      const d = draftRef.current
      if (b && d) {
        const nextBody = buildSongPatchBody(b, d)
        if (nextBody) {
          await sendPatchInner(nextBody)
        }
      }
    }
    return ok
  }, [canAutosavePatch, clearDebounceTimer, saveFailure, sendPatchInner])

  const notifyDraftEdited = useCallback(() => {
    clearDebounceTimer()
    const base = baselineRef.current
    const currentDraft = draftRef.current
    if (!canAutosavePatch || !base || !currentDraft || saveFailure) {
      setSaveIcon('idle')
      return
    }

    const body = buildSongPatchBody(base, currentDraft)
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
    const currentDraft = draftRef.current
    if (!base || !currentDraft || saveFailure || !canAutosavePatch) return
    const body = buildSongPatchBody(base, currentDraft)
    if (body) keepalivePatchSong(songId, body)
  }, [canAutosavePatch, clearDebounceTimer, saveFailure, songId])

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
  }, [flushSyncForUnload, songId])

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
    return baselineRef.current
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
