import { useCallback, useEffect, useRef, useState } from 'react'

import { useQueryClient } from '@tanstack/react-query'

import { api } from '@/api/client'
import { problemMessageFromBody } from '@/api/problem'
import type { components } from '@/api/schema'

import { hubListRootKey } from '@/lib/hub-list-keys'
import { parseRetryAfterSeconds } from '@/lib/http-retry-after'
import { buildSongPatchBody } from '@/lib/song-patch-body'
import { playerQueriesRootKey, songDetailQueryKey } from '@/lib/setlist-detail-key'
import { patchSongDataFromSongData, type PatchSongData } from '@/lib/song-editor-state'
import type { ChordSongData } from '@/ports/chord-engine'

type Song = components['schemas']['Song']

export type SaveIconState = 'idle' | 'pending' | 'saving' | 'error'

/** Best-effort flush when unloading (small PATCH body). */
function keepalivePatchSong(id: string, body: Record<string, unknown>) {
  const configuredBase = import.meta.env.VITE_API_BASE_URL ?? ''
  const origin =
    typeof globalThis.location?.origin === 'string' && globalThis.location.origin.length > 0
      ? globalThis.location.origin
      : 'http://localhost'
  const url = `${configuredBase || origin}/api/v1/songs/${encodeURIComponent(id)}`
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
  getDraft,
  canAutosavePatch,
}: {
  songId: string
  baseline: PatchSongData | null
  draft: PatchSongData | null
  /** Latest draft resolver; used on flush so in-flight compose edits are not missed. */
  getDraft?: () => PatchSongData | null
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
  const [saveRevision, setSaveRevision] = useState(0)

  const needFollowUpPatch = useRef(false)
  const baselineRef = useRef(baseline)
  const draftRef = useRef(draft)
  const getDraftRef = useRef(getDraft)
  const patchInFlightRef = useRef(false)

  useEffect(() => {
    baselineRef.current = baseline
  }, [baseline])

  useEffect(() => {
    draftRef.current = draft
  }, [draft])

  useEffect(() => {
    getDraftRef.current = getDraft
  }, [getDraft])

  const resolveDraft = useCallback((): PatchSongData | null => {
    return getDraftRef.current?.() ?? draftRef.current
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
      void queryClient.invalidateQueries({ queryKey: playerQueriesRootKey() })
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
          const msg = problemMessageFromBody(error, `Save failed (${response.status})`)

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
          setSaveRevision((revision) => revision + 1)
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
    const base = baselineRef.current
    const currentDraft = resolveDraft()
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
      const d = resolveDraft()
      if (b && d) {
        const nextBody = buildSongPatchBody(b, d)
        if (nextBody) {
          await sendPatchInner(nextBody)
        }
      }
    }
    return ok
  }, [canAutosavePatch, resolveDraft, saveFailure, sendPatchInner])

  const markDraftDirty = useCallback(() => {
    if (saveFailure) return
    const currentDraft = resolveDraft()
    if (!canAutosavePatch || !baselineRef.current || !currentDraft) {
      setSaveIcon('idle')
      return
    }

    const body = buildSongPatchBody(baselineRef.current, currentDraft)
    if (!body) {
      setSaveIcon('idle')
      return
    }

    setSaveIcon('pending')
  }, [canAutosavePatch, resolveDraft, saveFailure])

  const flushSyncForUnload = useCallback(() => {
    const base = baselineRef.current
    const currentDraft = resolveDraft()
    if (!base || !currentDraft || saveFailure || !canAutosavePatch) return
    const body = buildSongPatchBody(base, currentDraft)
    if (body) keepalivePatchSong(songId, body)
  }, [canAutosavePatch, resolveDraft, saveFailure, songId])

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
    markDraftDirty,
    flushNow: flush,
    patchInFlight,
    saveIcon,
    saveFailure,
    saveRevision,
    retrySave,
    discardFailedSave,
  }
}
