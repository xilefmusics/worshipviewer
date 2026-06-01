import { useNavigate } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import { type ChangeEvent, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { deleteUploadedProfilePicture, putProfilePicture } from '@/api/profile-picture'
import { fetchSessionUser, SESSION_QUERY_KEY, SESSION_STALE_TIME_MS, type User } from '@/api/session'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useHubViewMode } from '@/hooks/useHubViewMode'
import { useSession } from '@/hooks/useSession'
import { useUserAvatarDisplay } from '@/hooks/useUserAvatarDisplay'
import {
  applyAppearancePreference,
  readAppearancePreference,
  type AppearancePreference,
  writeAppearancePreference,
} from '@/lib/appearance'
import {
  readChordFormatPreference,
  type ChordFormatPreference,
  writeChordFormatPreference,
} from '@/lib/chord-format'
import {
  readLyricCollapseWhitespacePreference,
  writeLyricCollapseWhitespacePreference,
} from '@/lib/lyric-whitespace-preference'
import {
  readPlayerScrollPreferences,
  writePlayerScrollLandscape,
  writePlayerScrollPortrait,
} from '@/lib/player-scroll-preference'
import {
  DEFAULT_AV_PREFERENCES,
  readAvPreferences,
  writeAvPreferences,
  type AvBackgroundPreset,
  type AvContentLayer,
  type AvPreferences,
  type AvTextAlign,
  type AvTextShadow,
  type AvTextTransform,
  type AvTransitionStyle,
  type AvVerticalAlign,
} from '@/lib/player/av-preferences'
import { readPlayerDefaultMode, writePlayerDefaultMode } from '@/lib/player/player-mode-preference'
import type { PlayerMode } from '@/lib/player/player-mode'
import {
  readSheetBackgroundPreference,
  type SheetBackgroundPreference,
  writeSheetBackgroundPreference,
} from '@/lib/sheet-background'
import {
  readSheetImageInvertPreference,
  writeSheetImageInvertPreference,
} from '@/lib/sheet-image-invert-preference'
import type { PlayerScrollType } from '@/lib/player/effective-scroll-type'
import type { HubViewMode } from '@/lib/hub-view-mode'
import { clearAllLocalData } from '@/lib/clear-local'
import { formatApproxBytes } from '@/lib/format-bytes'
import {
  BROWSER_LOCALE_FLAG_KEY,
  LOCALE_STORAGE_KEY,
  mapLanguagesToLocale,
  resolveLocalePreference,
  type AppLocale,
  type LocalePreference,
} from '@/lib/locale'
import { performLogout } from '@/lib/logout-queue'
import {
  estimateKvTableBytes,
  estimateOfflinePlayerCacheBytes,
  listPlayerMirrors,
  removePlayerMirror,
} from '@/lib/offline/player-mirror-cache'
import type { PlayerMirrorRow } from '@/lib/dexie-db'
import type { PlayerEditorReturnContext } from '@/lib/player/player-editor-return'
import { buildSettingsSearch, type SettingsTab } from '@/lib/settings-route'
import { cn } from '@/lib/utils'

type SettingsOption<T extends string | number> = {
  value: T
  label: string
  description: string
}

const settingsTabs: SettingsTab[] = ['general', 'player', 'playerRoles']

function getLocalePreference(): LocalePreference {
  return resolveLocalePreference(
    globalThis.localStorage.getItem(LOCALE_STORAGE_KEY),
    globalThis.localStorage.getItem(BROWSER_LOCALE_FLAG_KEY),
  )
}

function OptionButton<T extends string | number>({
  option,
  selected,
  onSelect,
}: {
  option: SettingsOption<T>
  selected: boolean
  onSelect: (value: T) => void
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      className={cn(
        'flex w-full items-start justify-between gap-3 border-b border-[var(--color-border)] px-3 py-3 text-left transition-colors last:border-b-0 hover:bg-[var(--color-muted)]/55',
        selected && 'bg-[var(--color-primary)]/8',
      )}
      onClick={() => onSelect(option.value)}
    >
      <span className="min-w-0">
        <span className="block text-sm font-medium text-[var(--color-foreground)]">
          {option.label}
        </span>
        <span className="mt-0.5 block text-xs text-[var(--color-muted-foreground)]">
          {option.description}
        </span>
      </span>
      <span
        className={cn(
          'mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border border-[var(--color-border)]',
          selected && 'border-[var(--color-primary)] bg-[var(--color-primary)]',
        )}
        aria-hidden
      >
        {selected ? (
          <span className="size-1.5 rounded-full bg-[var(--color-primary-foreground)]" />
        ) : null}
      </span>
    </button>
  )
}

function SettingsSection<T extends string | number>({
  title,
  description,
  options,
  value,
  onChange,
}: {
  title: string
  description: string
  options: SettingsOption<T>[]
  value: T
  onChange: (value: T) => void
}) {
  return (
    <Card>
      <CardHeader className="p-4 pb-3">
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <div role="radiogroup" aria-label={title}>
          {options.map((option) => (
            <OptionButton
              key={option.value}
              option={option}
              selected={value === option.value}
              onSelect={onChange}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

function SettingsProfilePictureSection({ user }: { user: User }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState<'idle' | 'upload' | 'remove'>('idle')
  const [errorKey, setErrorKey] = useState<
    | 'unsupported_type'
    | 'invalid_image'
    | 'too_large'
    | 'failed'
    | 'remove_failed'
    | 'invalid_response'
    | null
  >(null)
  const { imageSrc, onImageError, initials } = useUserAvatarDisplay(user)

  async function onFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setErrorKey(null)
    setBusy('upload')
    try {
      const updated = await putProfilePicture(file)
      queryClient.setQueryData(SESSION_QUERY_KEY, updated)
    } catch (err) {
      const msg = err instanceof Error ? err.message : ''
      if (msg === 'unsupported_type') setErrorKey('unsupported_type')
      else if (msg === 'invalid_image') setErrorKey('invalid_image')
      else if (msg === 'payload_too_large') setErrorKey('too_large')
      else if (msg === 'invalid_response') setErrorKey('invalid_response')
      else setErrorKey('failed')
    } finally {
      setBusy('idle')
    }
  }

  async function onRemoveUploaded() {
    setErrorKey(null)
    setBusy('remove')
    try {
      const updated = await deleteUploadedProfilePicture()
      queryClient.setQueryData(SESSION_QUERY_KEY, updated)
    } catch {
      setErrorKey('remove_failed')
    } finally {
      setBusy('idle')
    }
  }

  const uploading = busy === 'upload'
  const removing = busy === 'remove'
  const hasUploaded = Boolean(user.avatar_blob_id?.trim())

  return (
    <Card>
      <CardHeader className="p-4 pb-3">
        <CardTitle className="text-base">{t('settings.profilePicture.title')}</CardTitle>
        <CardDescription>{t('settings.profilePicture.description')}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 p-4 pt-0">
        <div className="flex flex-wrap items-center gap-4">
          <div
            className="flex size-[4rem] shrink-0 items-center justify-center overflow-hidden rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] text-[0.875rem] font-semibold text-[var(--color-foreground)] shadow-[var(--shadow-elevated)]"
            aria-label={t('settings.profilePicture.previewAria')}
          >
            {imageSrc ? (
              <img src={imageSrc} alt="" className="size-full object-cover" onError={onImageError} />
            ) : (
              <span className="leading-none">{initials}</span>
            )}
          </div>
          <div className="flex min-w-0 flex-col gap-2">
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,.jpg,.jpeg,.png"
              className="sr-only"
              onChange={(ev) => void onFileChange(ev)}
            />
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={uploading || removing}
                onClick={() => fileRef.current?.click()}
              >
                {uploading ? t('common.load') : t('settings.profilePicture.upload')}
              </Button>
              {hasUploaded ? (
                <Button
                  type="button"
                  variant="ghost"
                  className="text-[var(--color-muted-foreground)]"
                  disabled={uploading || removing}
                  onClick={() => void onRemoveUploaded()}
                >
                  {removing ? t('common.load') : t('settings.profilePicture.removeUploaded')}
                </Button>
              ) : null}
            </div>
          </div>
        </div>
        {errorKey ? (
          <p role="alert" className="text-xs text-[var(--color-danger)]">
            {errorKey === 'unsupported_type'
              ? t('settings.profilePicture.unsupportedType')
              : errorKey === 'invalid_image'
                ? t('settings.profilePicture.invalid')
                : errorKey === 'too_large'
                  ? t('settings.profilePicture.tooLarge')
                  : errorKey === 'invalid_response'
                    ? t('settings.profilePicture.invalid')
                    : errorKey === 'remove_failed'
                      ? t('settings.profilePicture.removeFailed')
                      : t('settings.profilePicture.failed')}
          </p>
        ) : null}
      </CardContent>
    </Card>
  )
}

export function SettingsView({
  activeTab,
  playerReturn = null,
}: {
  activeTab: SettingsTab
  playerReturn?: PlayerEditorReturnContext | null
}) {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { data: sessionUser } = useSession()
  const [localePreference, setLocalePreferenceState] = useState(getLocalePreference)
  const [appearancePreference, setAppearancePreference] = useState(readAppearancePreference)
  const [chordFormatPreference, setChordFormatPreference] = useState(readChordFormatPreference)
  const [sheetBackgroundPreference, setSheetBackgroundPreference] = useState(readSheetBackgroundPreference)
  const [invertSheetImages, setInvertSheetImagesState] = useState(readSheetImageInvertPreference)
  const [scrollPreferences, setScrollPreferences] = useState(readPlayerScrollPreferences)
  const [defaultPlayerMode, setDefaultPlayerModeState] = useState<PlayerMode>(readPlayerDefaultMode)
  const [collapseLyricWhitespace, setCollapseLyricWhitespaceState] = useState(
    readLyricCollapseWhitespacePreference,
  )
  const [avPreferences, setAvPreferencesState] = useState<AvPreferences>(readAvPreferences)
  const { viewMode: collectionsViewMode, setViewMode: setCollectionsViewMode } =
    useHubViewMode('collections')
  const [cacheState, setCacheState] = useState<'idle' | 'clearing' | 'cleared' | 'failed'>('idle')
  const [approxBytes, setApproxBytes] = useState<number | null>(null)
  const [playerCacheBytes, setPlayerCacheBytes] = useState<number | null>(null)
  const [kvCacheBytes, setKvCacheBytes] = useState<number | null>(null)
  const [playerMirrors, setPlayerMirrors] = useState<PlayerMirrorRow[]>([])
  const [logoutPending, setLogoutPending] = useState(false)

  const languageOptions = useMemo<SettingsOption<LocalePreference>[]>(
    () => [
      {
        value: 'browser',
        label: t('settings.language.browser'),
        description: t('settings.language.browserDescription'),
      },
      {
        value: 'en',
        label: t('settings.language.en'),
        description: t('settings.language.enDescription'),
      },
      {
        value: 'de',
        label: t('settings.language.de'),
        description: t('settings.language.deDescription'),
      },
    ],
    [t],
  )

  const chordFormatOptions = useMemo<SettingsOption<ChordFormatPreference>[]>(
    () => [
      {
        value: 'letters',
        label: t('settings.chordFormat.letters'),
        description: t('settings.chordFormat.lettersDescription'),
      },
      {
        value: 'nashville',
        label: t('settings.chordFormat.nashville'),
        description: t('settings.chordFormat.nashvilleDescription'),
      },
    ],
    [t],
  )

  const collectionsViewModeOptions = useMemo<SettingsOption<HubViewMode>[]>(
    () => [
      {
        value: 'card',
        label: t('settings.collectionsViewMode.card'),
        description: t('settings.collectionsViewMode.cardDescription'),
      },
      {
        value: 'list',
        label: t('settings.collectionsViewMode.list'),
        description: t('settings.collectionsViewMode.listDescription'),
      },
      {
        value: 'adaptive',
        label: t('settings.collectionsViewMode.adaptive'),
        description: t('settings.collectionsViewMode.adaptiveDescription'),
      },
    ],
    [t],
  )

  const sheetBackgroundOptions = useMemo<SettingsOption<SheetBackgroundPreference>[]>(
    () => [
      {
        value: 'white',
        label: t('settings.sheetBackground.white'),
        description: t('settings.sheetBackground.whiteDescription'),
      },
      {
        value: 'app',
        label: t('settings.sheetBackground.app'),
        description: t('settings.sheetBackground.appDescription'),
      },
    ],
    [t],
  )

  const scrollModeOptions = useMemo<SettingsOption<PlayerScrollType>[]>(
    () => [
      {
        value: 'one_page',
        label: t('settings.playerScroll.singleSheets'),
        description: t('settings.playerScroll.pageDescription'),
      },
      {
        value: 'book',
        label: t('settings.playerScroll.bookView'),
        description: t('settings.playerScroll.bookDescription'),
      },
      {
        value: 'two_column',
        label: t('settings.playerScroll.twoColumnView'),
        description: t('settings.playerScroll.twoColumnDescription'),
      },
      {
        value: 'two_column_next',
        label: t('settings.playerScroll.twoColumnNextView'),
        description: t('settings.playerScroll.twoColumnNextDescription'),
      },
      {
        value: 'three_column',
        label: t('settings.playerScroll.threeColumnView'),
        description: t('settings.playerScroll.threeColumnDescription'),
      },
      {
        value: 'three_column_next',
        label: t('settings.playerScroll.threeColumnNextView'),
        description: t('settings.playerScroll.threeColumnNextDescription'),
      },
    ],
    [t],
  )

  const defaultPlayerModeOptions = useMemo<SettingsOption<PlayerMode>[]>(
    () => [
      {
        value: 'normal',
        label: t('settings.defaultPlayerMode.normal'),
        description: t('settings.defaultPlayerMode.normalDescription'),
      },
      {
        value: 'av',
        label: t('settings.defaultPlayerMode.av'),
        description: t('settings.defaultPlayerMode.avDescription'),
      },
    ],
    [t],
  )

  const avBackgroundPresetOptions = useMemo<SettingsOption<AvBackgroundPreset>[]>(
    () => [
      { value: 0, label: t('settings.playerRoles.background.black'), description: t('settings.playerRoles.background.blackDescription') },
      { value: 1, label: t('settings.playerRoles.background.red'), description: t('settings.playerRoles.background.redDescription') },
      { value: 2, label: t('settings.playerRoles.background.ray'), description: t('settings.playerRoles.background.rayDescription') },
    ],
    [t],
  )

  const avTextAlignOptions = useMemo<SettingsOption<AvTextAlign>[]>(
    () => [
      { value: 'left', label: t('settings.playerRoles.content.alignLeft'), description: t('settings.playerRoles.content.alignLeftDescription') },
      { value: 'center', label: t('settings.playerRoles.content.alignCenter'), description: t('settings.playerRoles.content.alignCenterDescription') },
      { value: 'right', label: t('settings.playerRoles.content.alignRight'), description: t('settings.playerRoles.content.alignRightDescription') },
    ],
    [t],
  )

  const avVerticalAlignOptions = useMemo<SettingsOption<AvVerticalAlign>[]>(
    () => [
      { value: 'top', label: t('settings.playerRoles.content.verticalTop'), description: t('settings.playerRoles.content.verticalTopDescription') },
      { value: 'center', label: t('settings.playerRoles.content.verticalCenter'), description: t('settings.playerRoles.content.verticalCenterDescription') },
      { value: 'bottom', label: t('settings.playerRoles.content.verticalBottom'), description: t('settings.playerRoles.content.verticalBottomDescription') },
    ],
    [t],
  )

  const avTextShadowOptions = useMemo<SettingsOption<AvTextShadow>[]>(
    () => [
      { value: 'none', label: t('settings.playerRoles.content.shadowNone'), description: t('settings.playerRoles.content.shadowNoneDescription') },
      { value: 'subtle', label: t('settings.playerRoles.content.shadowSubtle'), description: t('settings.playerRoles.content.shadowSubtleDescription') },
      { value: 'medium', label: t('settings.playerRoles.content.shadowMedium'), description: t('settings.playerRoles.content.shadowMediumDescription') },
      { value: 'strong', label: t('settings.playerRoles.content.shadowStrong'), description: t('settings.playerRoles.content.shadowStrongDescription') },
    ],
    [t],
  )

  const avTextTransformOptions = useMemo<SettingsOption<AvTextTransform>[]>(
    () => [
      { value: 'none', label: t('settings.playerRoles.content.transformNone'), description: t('settings.playerRoles.content.transformNoneDescription') },
      { value: 'uppercase', label: t('settings.playerRoles.content.transformUppercase'), description: t('settings.playerRoles.content.transformUppercaseDescription') },
      { value: 'lowercase', label: t('settings.playerRoles.content.transformLowercase'), description: t('settings.playerRoles.content.transformLowercaseDescription') },
      { value: 'capitalize', label: t('settings.playerRoles.content.transformCapitalize'), description: t('settings.playerRoles.content.transformCapitalizeDescription') },
    ],
    [t],
  )

  const avTransitionStyleOptions = useMemo<SettingsOption<AvTransitionStyle>[]>(
    () => [
      { value: 'none', label: t('settings.playerRoles.transition.none'), description: t('settings.playerRoles.transition.noneDescription') },
      { value: 'fade', label: t('settings.playerRoles.transition.fade'), description: t('settings.playerRoles.transition.fadeDescription') },
      { value: 'slide', label: t('settings.playerRoles.transition.slide'), description: t('settings.playerRoles.transition.slideDescription') },
    ],
    [t],
  )

  const avProjectionFullscreenOptions = useMemo<SettingsOption<'on' | 'off'>[]>(
    () => [
      { value: 'on', label: t('settings.playerRoles.projection.fullscreenOn'), description: t('settings.playerRoles.projection.fullscreenOnDescription') },
      { value: 'off', label: t('settings.playerRoles.projection.fullscreenOff'), description: t('settings.playerRoles.projection.fullscreenOffDescription') },
    ],
    [t],
  )

  const appearanceOptions = useMemo<SettingsOption<AppearancePreference>[]>(
    () => [
      {
        value: 'system',
        label: t('settings.appearance.system'),
        description: t('settings.appearance.systemDescription'),
      },
      {
        value: 'light',
        label: t('settings.appearance.light'),
        description: t('settings.appearance.lightDescription'),
      },
      {
        value: 'dark',
        label: t('settings.appearance.dark'),
        description: t('settings.appearance.darkDescription'),
      },
    ],
    [t],
  )

  async function setLocalePreference(next: LocalePreference) {
    setLocalePreferenceState(next)
    if (next === 'browser') {
      globalThis.localStorage.setItem(BROWSER_LOCALE_FLAG_KEY, '1')
      globalThis.localStorage.removeItem(LOCALE_STORAGE_KEY)
      await i18n.changeLanguage(mapLanguagesToLocale(globalThis.navigator.languages))
      return
    }

    const locale: AppLocale = next
    globalThis.localStorage.removeItem(BROWSER_LOCALE_FLAG_KEY)
    globalThis.localStorage.setItem(LOCALE_STORAGE_KEY, locale)
    await i18n.changeLanguage(locale)
  }

  function setAppearance(next: AppearancePreference) {
    setAppearancePreference(next)
    writeAppearancePreference(next)
    applyAppearancePreference(next)
  }

  function setChordFormat(next: ChordFormatPreference) {
    setChordFormatPreference(next)
    writeChordFormatPreference(next)
  }

  function setSheetBackground(next: SheetBackgroundPreference) {
    setSheetBackgroundPreference(next)
    writeSheetBackgroundPreference(next)
  }

  function setInvertSheetImages(enabled: boolean) {
    setInvertSheetImagesState(enabled)
    writeSheetImageInvertPreference(enabled)
  }

  function setPortraitScroll(next: PlayerScrollType) {
    writePlayerScrollPortrait(next)
    setScrollPreferences(readPlayerScrollPreferences())
  }

  function setLandscapeScroll(next: PlayerScrollType) {
    writePlayerScrollLandscape(next)
    setScrollPreferences(readPlayerScrollPreferences())
  }

  function setDefaultPlayerMode(next: PlayerMode) {
    writePlayerDefaultMode(next)
    setDefaultPlayerModeState(next)
  }

  function setCollapseLyricWhitespace(next: boolean) {
    writeLyricCollapseWhitespacePreference(next)
    setCollapseLyricWhitespaceState(next)
  }

  function updateAvPreferences(next: AvPreferences) {
    writeAvPreferences(next)
    setAvPreferencesState(next)
  }

  function setAvContentLayer(partial: Partial<AvContentLayer>) {
    updateAvPreferences({
      ...avPreferences,
      contentLayer: { ...avPreferences.contentLayer, ...partial },
    })
  }

  function setAvBackgroundPreset(preset: AvBackgroundPreset) {
    updateAvPreferences({
      ...avPreferences,
      backgroundLayer: { preset },
    })
  }

  function setAvTransition(partial: Partial<AvPreferences['transition']>) {
    updateAvPreferences({
      ...avPreferences,
      transition: { ...avPreferences.transition, ...partial },
    })
  }

  function setAvProjection(partial: Partial<AvPreferences['projection']>) {
    updateAvPreferences({
      ...avPreferences,
      projection: { ...avPreferences.projection, ...partial },
    })
  }

  async function clearCache() {
    setCacheState('clearing')
    try {
      await clearAllLocalData(queryClient)
      await queryClient.ensureQueryData({
        queryKey: SESSION_QUERY_KEY,
        queryFn: fetchSessionUser,
        staleTime: SESSION_STALE_TIME_MS,
      })
      setCacheState('cleared')
    } catch {
      setCacheState('failed')
    }
  }

  useEffect(() => {
    void (async () => {
      const playerB = await estimateOfflinePlayerCacheBytes()
      const kvB = await estimateKvTableBytes()
      const mirrors = await listPlayerMirrors()
      setPlayerCacheBytes(playerB)
      setKvCacheBytes(kvB)
      setApproxBytes(playerB + kvB)
      setPlayerMirrors(mirrors)
    })()
  }, [cacheState])

  async function removeMirror(row: PlayerMirrorRow) {
    await removePlayerMirror(row.entityType, row.entityId)
    setCacheState('idle')
    const mirrors = await listPlayerMirrors()
    setPlayerMirrors(mirrors)
    const playerB = await estimateOfflinePlayerCacheBytes()
    const kvB = await estimateKvTableBytes()
    setPlayerCacheBytes(playerB)
    setKvCacheBytes(kvB)
    setApproxBytes(playerB + kvB)
  }

  async function logout() {
    setLogoutPending(true)
    await performLogout(queryClient)
    void navigate({ to: '/login', search: { return_to: undefined } })
  }

  return (
    <div className="flex w-full min-w-0 flex-col gap-4">
      <p className="text-sm text-[var(--color-muted-foreground)]">
        {t('settings.description')}
      </p>

      <nav
        role="tablist"
        aria-label={t('settings.tabs.aria')}
        className="flex items-stretch gap-1 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] p-[0.18rem] shadow-[var(--shadow-elevated)]"
      >
        {settingsTabs.map((tab) => {
          const selected = activeTab === tab
          return (
            <button
              key={tab}
              type="button"
              role="tab"
              id={`settings-tab-${tab}`}
              aria-selected={selected}
              aria-controls={`settings-panel-${tab}`}
              tabIndex={selected ? 0 : -1}
              onClick={() =>
                void navigate({ to: '/settings', search: buildSettingsSearch(tab, playerReturn) })
              }
              className={cn(
                'min-w-0 flex-1 rounded-full px-2 py-2.5 text-sm font-medium transition-colors',
                selected
                  ? 'bg-[var(--color-primary)] text-[var(--color-primary-foreground)]'
                  : 'text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)]',
              )}
            >
              {t(`settings.tabs.${tab}`)}
            </button>
          )
        })}
      </nav>

      {activeTab === 'general' ? (
        <div
          id="settings-panel-general"
          role="tabpanel"
          aria-labelledby="settings-tab-general"
          className="flex flex-col gap-4"
        >
          <SettingsSection
            title={t('settings.language.title')}
            description={t('settings.language.description')}
            options={languageOptions}
            value={localePreference}
            onChange={(next) => {
              void setLocalePreference(next)
            }}
          />

          <SettingsSection
            title={t('settings.appearance.title')}
            description={t('settings.appearance.description')}
            options={appearanceOptions}
            value={appearancePreference}
            onChange={setAppearance}
          />

          <SettingsSection
            title={t('settings.collectionsViewMode.title')}
            description={t('settings.collectionsViewMode.description')}
            options={collectionsViewModeOptions}
            value={collectionsViewMode}
            onChange={setCollectionsViewMode}
          />

          <SettingsSection
            title={t('settings.defaultPlayerMode.title')}
            description={t('settings.defaultPlayerMode.description')}
            options={defaultPlayerModeOptions}
            value={defaultPlayerMode}
            onChange={setDefaultPlayerMode}
          />

          {sessionUser ? <SettingsProfilePictureSection user={sessionUser} /> : null}

          <Card>
            <CardHeader className="p-4 pb-3">
              <CardTitle className="text-base">{t('settings.cache.title')}</CardTitle>
              <CardDescription>{t('settings.cache.description')}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col items-start gap-2 p-4 pt-0">
              {approxBytes !== null ? (
                <>
                  <p className="text-xs text-[var(--color-muted-foreground)]">
                    {t('settings.cache.approxSize', { size: formatApproxBytes(approxBytes) })}
                  </p>
                  {playerCacheBytes !== null && kvCacheBytes !== null ? (
                    <p className="text-xs text-[var(--color-muted-foreground)]">
                      {t('settings.cache.breakdown', {
                        player: formatApproxBytes(playerCacheBytes),
                        lists: formatApproxBytes(kvCacheBytes),
                      })}
                    </p>
                  ) : null}
                </>
              ) : (
                <p className="text-xs text-[var(--color-muted-foreground)]">{t('common.load')}</p>
              )}
              {playerMirrors.length > 0 ? (
                <ul className="mt-1 w-full space-y-1 border-t border-[var(--color-border)] pt-2">
                  {playerMirrors.map((row) => (
                    <li
                      key={row.id}
                      className="flex items-center justify-between gap-2 text-xs text-[var(--color-muted-foreground)]"
                    >
                      <span className="min-w-0 truncate">
                        {t(`settings.cache.mirrorType.${row.entityType}`)}
                        {row.title ? `: ${row.title}` : ''}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 shrink-0 px-2 text-xs"
                        onClick={() => void removeMirror(row)}
                      >
                        {t('settings.cache.removeMirror')}
                      </Button>
                    </li>
                  ))}
                </ul>
              ) : null}
              <Button
                type="button"
                variant="outline"
                onClick={() => void clearCache()}
                disabled={cacheState === 'clearing'}
              >
                {cacheState === 'clearing' ? t('common.load') : t('settings.cache.clear')}
              </Button>
              {cacheState === 'cleared' ? (
                <p className="text-xs text-[var(--color-muted-foreground)]">
                  {t('settings.cache.cleared')}
                </p>
              ) : null}
              {cacheState === 'failed' ? (
                <p role="alert" className="text-xs text-[var(--color-danger)]">
                  {t('settings.cache.failed')}
                </p>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="p-4 pb-3">
              <CardTitle className="text-base">{t('settings.account.title')}</CardTitle>
              <CardDescription>{t('settings.account.description')}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2 p-4 pt-0">
              <Button type="button" variant="outline" onClick={() => void navigate({ to: '/teams' })}>
                {t('settings.account.teams')}
              </Button>
              <Button type="button" variant="outline" onClick={() => void navigate({ to: '/sessions' })}>
                {t('settings.account.sessions')}
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={() => void logout()}
                disabled={logoutPending}
              >
                {logoutPending ? t('common.load') : t('settings.account.logout')}
              </Button>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {activeTab === 'player' ? (
        <div
          id="settings-panel-player"
          role="tabpanel"
          aria-labelledby="settings-tab-player"
          className="flex flex-col gap-4"
        >
          <SettingsSection
            title={t('settings.chordFormat.title')}
            description={t('settings.chordFormat.description')}
            options={chordFormatOptions}
            value={chordFormatPreference}
            onChange={setChordFormat}
          />

          <Card>
            <CardHeader className="p-4 pb-3">
              <CardTitle className="text-base">{t('settings.sheetBackground.title')}</CardTitle>
              <CardDescription>{t('settings.sheetBackground.description')}</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <div role="radiogroup" aria-label={t('settings.sheetBackground.title')}>
                {sheetBackgroundOptions.map((option) => (
                  <OptionButton
                    key={option.value}
                    option={option}
                    selected={sheetBackgroundPreference === option.value}
                    onSelect={setSheetBackground}
                  />
                ))}
              </div>
            </CardContent>
            <CardContent className="border-t border-[var(--color-border)] p-4">
              <label className="flex items-start gap-3 text-sm">
                <input
                  type="checkbox"
                  className="mt-0.5 size-4 shrink-0 accent-[var(--color-primary)]"
                  checked={invertSheetImages}
                  onChange={(e) => setInvertSheetImages(e.target.checked)}
                />
                <span className="flex flex-col gap-0.5">
                  <span>{t('settings.sheetBackground.invertImages')}</span>
                  <span className="text-xs text-[var(--color-muted-foreground)]">
                    {t('settings.sheetBackground.invertImagesDescription')}
                  </span>
                </span>
              </label>
            </CardContent>
          </Card>

          <SettingsSection
            title={t('settings.playerScroll.portraitTitle')}
            description={t('settings.playerScroll.portraitDescription')}
            options={scrollModeOptions}
            value={scrollPreferences.portrait}
            onChange={setPortraitScroll}
          />

          <SettingsSection
            title={t('settings.playerScroll.landscapeTitle')}
            description={t('settings.playerScroll.landscapeDescription')}
            options={scrollModeOptions}
            value={scrollPreferences.landscape}
            onChange={setLandscapeScroll}
          />
        </div>
      ) : null}

      {activeTab === 'playerRoles' ? (
        <div
          id="settings-panel-playerRoles"
          role="tabpanel"
          aria-labelledby="settings-tab-playerRoles"
          className="flex flex-col gap-4"
        >
          <Card>
            <CardHeader className="p-4 pb-3">
              <CardTitle className="text-base">{t('settings.playerRoles.content.title')}</CardTitle>
              <CardDescription>{t('settings.playerRoles.content.description')}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 p-4 pt-0">
              <label className="flex flex-col gap-1 text-sm">
                <span>{t('settings.playerRoles.content.maxLines')}</span>
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={avPreferences.contentLayer.maxLinesPerSlide}
                  onChange={(e) =>
                    setAvContentLayer({
                      maxLinesPerSlide: Number.parseInt(e.target.value, 10) || DEFAULT_AV_PREFERENCES.contentLayer.maxLinesPerSlide,
                    })
                  }
                  className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2"
                />
              </label>
              <label className="flex items-start gap-3 text-sm">
                <input
                  type="checkbox"
                  className="mt-0.5 size-4 shrink-0 accent-[var(--color-primary)]"
                  checked={avPreferences.contentLayer.balanceSlideLines}
                  onChange={(e) =>
                    setAvContentLayer({ balanceSlideLines: e.target.checked })
                  }
                />
                <span className="flex flex-col gap-0.5">
                  <span>{t('settings.playerRoles.content.balanceSlideLines')}</span>
                  <span className="text-xs text-[var(--color-muted-foreground)]">
                    {t('settings.playerRoles.content.balanceSlideLinesDescription')}
                  </span>
                </span>
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span>{t('settings.playerRoles.content.fontSize')}</span>
                <input
                  type="number"
                  min={20}
                  max={120}
                  value={avPreferences.contentLayer.fontSize}
                  onChange={(e) =>
                    setAvContentLayer({
                      fontSize: Number.parseInt(e.target.value, 10) || DEFAULT_AV_PREFERENCES.contentLayer.fontSize,
                    })
                  }
                  className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2"
                />
              </label>
            </CardContent>
          </Card>

          <SettingsSection
            title={t('settings.playerRoles.content.textAlignTitle')}
            description={t('settings.playerRoles.content.textAlignDescription')}
            options={avTextAlignOptions}
            value={avPreferences.contentLayer.textAlign}
            onChange={(value) => setAvContentLayer({ textAlign: value })}
          />

          <SettingsSection
            title={t('settings.playerRoles.content.verticalAlignTitle')}
            description={t('settings.playerRoles.content.verticalAlignDescription')}
            options={avVerticalAlignOptions}
            value={avPreferences.contentLayer.verticalAlign}
            onChange={(value) => setAvContentLayer({ verticalAlign: value })}
          />

          <SettingsSection
            title={t('settings.playerRoles.content.textShadowTitle')}
            description={t('settings.playerRoles.content.textShadowDescription')}
            options={avTextShadowOptions}
            value={avPreferences.contentLayer.textShadow}
            onChange={(value) => setAvContentLayer({ textShadow: value })}
          />

          <SettingsSection
            title={t('settings.playerRoles.content.textTransformTitle')}
            description={t('settings.playerRoles.content.textTransformDescription')}
            options={avTextTransformOptions}
            value={avPreferences.contentLayer.textTransform}
            onChange={(value) => setAvContentLayer({ textTransform: value })}
          />

          <Card>
            <CardHeader className="p-4 pb-3">
              <CardTitle className="text-base">{t('settings.lyricWhitespace.title')}</CardTitle>
              <CardDescription>{t('settings.lyricWhitespace.description')}</CardDescription>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <label className="flex items-start gap-3 text-sm">
                <input
                  type="checkbox"
                  className="mt-0.5 size-4 shrink-0 accent-[var(--color-primary)]"
                  checked={collapseLyricWhitespace}
                  onChange={(e) => setCollapseLyricWhitespace(e.target.checked)}
                />
                <span className="flex flex-col gap-0.5">
                  <span>{t('settings.lyricWhitespace.collapse')}</span>
                  <span className="text-xs text-[var(--color-muted-foreground)]">
                    {t('settings.lyricWhitespace.collapseDescription')}
                  </span>
                </span>
              </label>
            </CardContent>
          </Card>

          <SettingsSection
            title={t('settings.playerRoles.background.title')}
            description={t('settings.playerRoles.background.description')}
            options={avBackgroundPresetOptions}
            value={avPreferences.backgroundLayer.preset}
            onChange={setAvBackgroundPreset}
          />

          <SettingsSection
            title={t('settings.playerRoles.transition.title')}
            description={t('settings.playerRoles.transition.description')}
            options={avTransitionStyleOptions}
            value={avPreferences.transition.style}
            onChange={(value) => setAvTransition({ style: value })}
          />

          <Card>
            <CardHeader className="p-4 pb-3">
              <CardTitle className="text-base">{t('settings.playerRoles.transition.durationTitle')}</CardTitle>
              <CardDescription>{t('settings.playerRoles.transition.durationDescription')}</CardDescription>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <input
                type="range"
                min={0}
                max={2000}
                step={50}
                value={avPreferences.transition.durationMs}
                onChange={(e) =>
                  setAvTransition({ durationMs: Number.parseInt(e.target.value, 10) })
                }
                className="w-full"
              />
            </CardContent>
          </Card>

          <SettingsSection
            title={t('settings.playerRoles.projection.fullscreenTitle')}
            description={t('settings.playerRoles.projection.fullscreenDescription')}
            options={avProjectionFullscreenOptions}
            value={avPreferences.projection.outputFullscreenOnDblClick ? 'on' : 'off'}
            onChange={(value) =>
              setAvProjection({ outputFullscreenOnDblClick: value === 'on' })
            }
          />
        </div>
      ) : null}
    </div>
  )
}
