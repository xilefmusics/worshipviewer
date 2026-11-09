import { useCallback, useEffect, useRef, useState } from 'react'

import { mediaAssetDataUrl } from '@/api/media-upload'
import {
  AV_PLAYBACK_ERROR_AUTOPLAY,
  mediaActionsForCommand,
  mediaErrorCode,
  playbackAckFromElement,
  playbackError,
  releaseMediaElement,
  shouldEmitPlaybackAck,
} from '@/lib/player/av-projection-playback'
import {
  isUploadedProjectionContent,
  type AvProjectionAckError,
  type AvProjectionCommand,
  type AvProjectionPlaybackAck,
} from '@/lib/player/av-projection-protocol'
import { cn } from '@/lib/utils'

import './player-av.css'

type AvProjectedMediaProps = {
  command: AvProjectionCommand
  onAck: (
    applied: boolean,
    playback?: AvProjectionPlaybackAck,
    error?: AvProjectionAckError,
  ) => void
}

function elementSnapshot(
  el: HTMLMediaElement,
  status: AvProjectionPlaybackAck['status'],
  loop: boolean,
): AvProjectionPlaybackAck {
  const durationMs =
    Number.isFinite(el.duration) && el.duration > 0 ? Math.round(el.duration * 1000) : null
  const seekable = el.seekable
  const seekableStartMs = seekable.length > 0 ? Math.round(seekable.start(0) * 1000) : 0
  const seekableEndMs =
    seekable.length > 0 ? Math.round(seekable.end(seekable.length - 1) * 1000) : durationMs
  return playbackAckFromElement({
    status,
    currentTimeMs: Math.round((el.currentTime || 0) * 1000),
    durationMs,
    seekableStartMs,
    seekableEndMs,
    volume: el.volume,
    muted: el.muted,
    loop,
  })
}

export function AvProjectedMedia({ command, onAck }: AvProjectedMediaProps) {
  const content = isUploadedProjectionContent(command.content) ? command.content : null
  const mediaRef = useRef<HTMLVideoElement | HTMLAudioElement | null>(null)
  const lastAckRef = useRef<{ at: number; ack: AvProjectionPlaybackAck } | null>(null)
  const commandIdRef = useRef(command.commandId)
  const loopRef = useRef(command.playback?.loop === true)
  const playGenRef = useRef(0)
  const endedRef = useRef(false)
  const onAckRef = useRef(onAck)
  const [endedAtCommandId, setEndedAtCommandId] = useState<number | null>(null)
  const hideVisual =
    content?.type === 'audio' ||
    command.screenState !== 'live' ||
    endedAtCommandId === command.commandId

  useEffect(() => {
    onAckRef.current = onAck
  }, [onAck])

  useEffect(() => {
    commandIdRef.current = command.commandId
    loopRef.current = command.playback?.loop === true
  }, [command.commandId, command.playback?.loop])

  const emitAck = (
    applied: boolean,
    playback: AvProjectionPlaybackAck | undefined,
    error: AvProjectionAckError | undefined,
    force: boolean,
  ) => {
    if (playback) {
      const now = Date.now()
      if (!shouldEmitPlaybackAck(lastAckRef.current, playback, now, force)) return
      lastAckRef.current = { at: now, ack: playback }
    }
    onAckRef.current(applied, playback, error)
  }

  useEffect(() => {
    const el = mediaRef.current
    if (!el) return

    const onTime = () => {
      if (endedRef.current) return
      emitAck(
        true,
        elementSnapshot(el, el.paused ? 'paused' : 'playing', loopRef.current),
        undefined,
        false,
      )
    }
    const onPlaying = () => {
      endedRef.current = false
      setEndedAtCommandId(null)
      emitAck(true, elementSnapshot(el, 'playing', loopRef.current), undefined, true)
    }
    const onPause = () => {
      if (endedRef.current) return
      emitAck(true, elementSnapshot(el, 'paused', loopRef.current), undefined, true)
    }
    const onWaiting = () => {
      emitAck(true, elementSnapshot(el, 'loading', loopRef.current), undefined, true)
    }
    const onEnded = () => {
      if (loopRef.current) {
        el.currentTime = 0
        void el.play()
        return
      }
      endedRef.current = true
      setEndedAtCommandId(commandIdRef.current)
      const snapshot = elementSnapshot(el, 'ended', loopRef.current)
      playGenRef.current += 1
      releaseMediaElement(el)
      emitAck(true, snapshot, undefined, true)
    }
    const onError = () => {
      emitAck(
        false,
        elementSnapshot(el, 'error', loopRef.current),
        playbackError(mediaErrorCode(el), 'The media could not be played.'),
        true,
      )
    }

    el.addEventListener('timeupdate', onTime)
    el.addEventListener('durationchange', onTime)
    el.addEventListener('playing', onPlaying)
    el.addEventListener('pause', onPause)
    el.addEventListener('waiting', onWaiting)
    el.addEventListener('ended', onEnded)
    el.addEventListener('error', onError)
    return () => {
      el.removeEventListener('timeupdate', onTime)
      el.removeEventListener('durationchange', onTime)
      el.removeEventListener('playing', onPlaying)
      el.removeEventListener('pause', onPause)
      el.removeEventListener('waiting', onWaiting)
      el.removeEventListener('ended', onEnded)
      el.removeEventListener('error', onError)
    }
  }, [content?.type])

  useEffect(() => {
    const el = mediaRef.current
    if (!content) {
      releaseMediaElement(el)
      endedRef.current = false
      return
    }
    const actions = mediaActionsForCommand(command)
    if (!actions || !el) return

    if (actions.release) {
      playGenRef.current += 1
      releaseMediaElement(el)
      endedRef.current = false
      return
    }

    const nextSrc = mediaAssetDataUrl(content.mediaId, content.assetId)
    if (el.getAttribute('src') !== nextSrc) {
      endedRef.current = false
      lastAckRef.current = null
      el.src = nextSrc
    }
    el.volume = actions.volume
    el.muted = actions.muted
    if (actions.seekMs != null) {
      const seekTo = actions.seekMs / 1000
      if (Number.isFinite(el.duration) && el.duration > 0) {
        el.currentTime = seekTo
      } else {
        const onMeta = () => {
          el.currentTime = seekTo
          el.removeEventListener('loadedmetadata', onMeta)
        }
        el.addEventListener('loadedmetadata', onMeta)
      }
    }
    if (actions.pause) {
      playGenRef.current += 1
      el.pause()
    }
    if (actions.play && !endedRef.current) {
      const gen = ++playGenRef.current
      const commandId = command.commandId
      void el.play().then(
        () => undefined,
        () => {
          if (gen !== playGenRef.current) return
          if (commandIdRef.current !== commandId) return
          emitAck(
            false,
            elementSnapshot(el, 'error', loopRef.current),
            playbackError(AV_PLAYBACK_ERROR_AUTOPLAY, 'The browser blocked autoplay.'),
            true,
          )
        },
      )
    }

    return () => {
      playGenRef.current += 1
    }
  }, [command, content])

  useEffect(() => {
    const el = mediaRef.current
    return () => {
      playGenRef.current += 1
      releaseMediaElement(el)
    }
  }, [])

  const setMediaRef = useCallback((el: HTMLVideoElement | HTMLAudioElement | null) => {
    mediaRef.current = el
  }, [])

  if (!content) return null

  return (
    <div
      className={cn('av-projected-media', hideVisual && 'av-projected-media--hidden')}
      data-testid="av-projected-media"
      data-kind={content.type}
      aria-hidden={hideVisual || undefined}
    >
      {content.type === 'video' ? (
        <video
          ref={setMediaRef}
          className="av-projected-media__element"
          poster={content.thumbnailAssetId
            ? mediaAssetDataUrl(content.mediaId, content.thumbnailAssetId)
            : undefined}
          playsInline
          preload="auto"
          data-testid="av-projected-video"
        />
      ) : (
        <audio
          ref={setMediaRef}
          className="av-projected-media__element av-projected-media__element--audio"
          preload="auto"
          data-testid="av-projected-audio"
        />
      )}
    </div>
  )
}
