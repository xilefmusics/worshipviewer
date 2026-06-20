import { render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AvOutputPage } from '@/components/player/av/AvOutputPage'
import { DEFAULT_AV_PREFERENCES } from '@/lib/player/av-preferences'

let slideViewProps: Record<string, unknown> | null = null

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

vi.mock('@/components/player/av/AvSlideView', () => ({
  AvSlideView: (props: Record<string, unknown>) => {
    slideViewProps = props
    return <div data-testid="slide-view" />
  },
}))

const subscribeAvProjectionSync = vi.fn()

vi.mock('@/lib/player/av-projection-sync', () => ({
  subscribeAvProjectionSync: (...args: unknown[]) => subscribeAvProjectionSync(...args),
}))

beforeEach(() => {
  slideViewProps = null
  subscribeAvProjectionSync.mockReset()
  subscribeAvProjectionSync.mockImplementation((_sessionId: string, onPayload: (payload: unknown) => void) => {
    onPayload({
      contentText: 'Hello',
      contentLayer: DEFAULT_AV_PREFERENCES.contentLayer,
      backgroundLayer: DEFAULT_AV_PREFERENCES.backgroundLayer,
      transition: DEFAULT_AV_PREFERENCES.transition,
      screenState: 'live',
      itemTitle: 'Song',
      nextPreview: null,
    })
    return { close: vi.fn() }
  })
})

describe('AvOutputPage', () => {
  it('renders structured content lines when the payload includes them', () => {
    subscribeAvProjectionSync.mockImplementation((_sessionId: string, onPayload: (payload: unknown) => void) => {
      onPayload({
        contentText: 'Hello',
        contentLines: [{ primary: 'Hello', secondary: 'Hallo' }],
        contentLayer: DEFAULT_AV_PREFERENCES.contentLayer,
        backgroundLayer: DEFAULT_AV_PREFERENCES.backgroundLayer,
        transition: DEFAULT_AV_PREFERENCES.transition,
        screenState: 'live',
        itemTitle: 'Song',
        nextPreview: null,
      })
      return { close: vi.fn() }
    })

    render(<AvOutputPage sessionId="shared" />)

    expect(slideViewProps?.contentLines).toEqual([{ primary: 'Hello', secondary: 'Hallo' }])
    expect(slideViewProps?.contentText).toBeUndefined()
    expect(slideViewProps?.screenState).toBe('live')
  })

  it('falls back to contentText when structured lines are absent', () => {
    render(<AvOutputPage sessionId="shared" />)

    expect(slideViewProps?.contentText).toBe('Hello')
    expect(slideViewProps?.contentLines).toBeUndefined()
  })

  it('passes blank screen state without structured lines leaking through the view props', () => {
    subscribeAvProjectionSync.mockImplementation((_sessionId: string, onPayload: (payload: unknown) => void) => {
      onPayload({
        contentText: '',
        contentLayer: DEFAULT_AV_PREFERENCES.contentLayer,
        backgroundLayer: DEFAULT_AV_PREFERENCES.backgroundLayer,
        transition: DEFAULT_AV_PREFERENCES.transition,
        screenState: 'blank',
        itemTitle: 'Song',
        nextPreview: null,
      })
      return { close: vi.fn() }
    })

    render(<AvOutputPage sessionId="shared" />)

    expect(slideViewProps?.screenState).toBe('blank')
    expect(slideViewProps?.contentText).toBe('')
    expect(slideViewProps?.contentLines).toBeUndefined()
  })
})
