import { AvDisplaySettings } from '@/components/settings/AvDisplaySettings'
import { SettingsInfoTooltip } from '@/components/settings/SettingsInfoTooltip'
import { isTauri } from '@tauri-apps/api/core'
import { useNavigate } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import {
  type ChangeEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useTranslation } from 'react-i18next'

import { deleteUploadedProfilePicture, putProfilePicture } from '@/api/profile-picture'
import { fetchSessionUser, SESSION_QUERY_KEY, SESSION_STALE_TIME_MS, type User } from '@/api/session'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { GuitarIcon, KeyboardIcon } from '@/components/icons/instrument-icons'
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
  readPlayerLayoutPreferences,
  writePlayerLayoutLandscape,
  writePlayerLayoutLinkedOrientations,
  writePlayerLayoutPortrait,
  writePlayerLayoutUnified,
} from '@/lib/player-scroll-preference'
import {
  readAvPreferences,
  writeAvPreferences,
  type AvPreferences,
  type AvTransitionStyle,
} from '@/lib/player/av-preferences'
import { readAvExternalOutput, writeAvExternalOutput, readAvOutputAutoOpen, writeAvOutputAutoOpen } from '@/lib/player/av-output-preference'
import { readPlayerDefaultMode, writePlayerDefaultMode } from '@/lib/player/player-mode-preference'
import {
  readDeveloperOptionsPreference,
  writeDeveloperOptionsPreference,
} from '@/lib/developer-options-preference'
import {
  readComfortableKeysPreference,
  writeComfortableKeysPreference,
  type ComfortableKey,
} from '@/lib/player/comfortable-keys-preference'
import {
  readPlayerInstrumentPreference,
  writePlayerInstrumentPreference,
  type PlayerInstrument,
} from '@/lib/player/player-instrument-preference'
import {
  CHORD_SONG_FONT_SCALE_MAX,
  CHORD_SONG_FONT_SCALE_MIN,
  readChordSongFontScale,
  writeChordSongFontScale,
} from '@/lib/player/chord-song-font-scale-preference'
import type { PlayerMode } from '@/lib/player/player-mode'
import {
  readSheetBackgroundPreference,
  type SheetBackgroundPreference,
  writeSheetBackgroundPreference,
} from '@/lib/sheet-background'
import {
  readHideChordsPreference,
  writeHideChordsPreference,
} from '@/lib/hide-chords-preference'
import {
  readSheetImageInvertPreference,
  writeSheetImageInvertPreference,
} from '@/lib/sheet-image-invert-preference'
import {
  readTocMultilingualPreference,
  writeTocMultilingualPreference,
} from '@/lib/toc-multilingual-preference'
import { PlayerLayoutSettingsCard } from '@/components/settings/PlayerLayoutSettingsCard'
import { McpConnectionsSettings } from '@/components/settings/McpConnectionsSettings'
import type { HubViewMode } from '@/lib/hub-view-mode'
import { clearAllLocalData } from '@/lib/clear-local'
import { formatApproxBytes } from '@/lib/format-bytes'
import {
  mapLanguagesToLocale,
  readLocalePreference,
  writeBrowserLocalePreference,
  writeExplicitLocalePreference,
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
import {
  type SettingsTab,
} from '@/lib/settings-route'
import { cn } from '@/lib/utils'
import { MUSICAL_KEYS } from '@/lib/setlist-editor-constants'


type SettingsOption<T extends string | number> = {
  value: T
  label: string
  description: string
}


function getLocalePreference(): LocalePreference {
  return readLocalePreference()
}

function OptionButton<T extends string | number>({
  option,
  selected,
  onSelect,
  disabled = false,
}: {
  option: SettingsOption<T>
  selected: boolean
  onSelect: (value: T) => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      disabled={disabled}
      className={cn(
        'flex w-full items-start justify-between gap-3 border-b border-[var(--color-border)] px-3 py-3 text-left transition-colors last:border-b-0 hover:bg-[var(--color-muted)]/55',
        selected && 'bg-[var(--color-primary)]/8',
        disabled && 'cursor-not-allowed opacity-55 hover:bg-transparent',
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
  disabledExplanation,
}: {
  title: string
  description: string
  options: SettingsOption<T>[]
  value: T
  onChange: (value: T) => void
  disabledExplanation?: string
}) {
  return (
    <Card>
      <CardHeader className="p-4 pb-3">
        <div className="flex items-center gap-2">
          <CardTitle className="text-base">{title}</CardTitle>
          {disabledExplanation ? <SettingsInfoTooltip text={disabledExplanation} /> : null}
        </div>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <div role="radiogroup" aria-label={title}>
          {options.map((option) => (
            <OptionButton
              key={option.value}
              option={option}
              selected={value === option.value}
              disabled={Boolean(disabledExplanation)}
              onSelect={onChange}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

function InstrumentSection({
  instrument,
  onInstrumentChange,
}: {
  instrument: PlayerInstrument
  onInstrumentChange: (instrument: PlayerInstrument) => void
}) {
  const { t } = useTranslation()

  return (
    <Card>
      <CardHeader className="p-4 pb-3">
        <CardTitle className="text-base">{t('settings.instrument.title')}</CardTitle>
        <CardDescription>{t('settings.instrument.description')}</CardDescription>
      </CardHeader>
      <CardContent className="p-4 pt-0">
        <div
          role="radiogroup"
          aria-label={t('settings.instrument.title')}
          className="grid grid-cols-2 gap-2"
        >
          {(['guitar', 'keyboard'] as const).map((option) => {
            const selected = instrument === option
            const Icon = option === 'guitar' ? GuitarIcon : KeyboardIcon
            return (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={selected}
                className={cn(
                  'flex items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm font-semibold transition-colors',
                  selected
                    ? 'border-[var(--color-primary)] bg-[var(--color-primary)] text-[var(--color-primary-foreground)]'
                    : 'border-[var(--color-border)] text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)]/55',
                )}
                onClick={() => onInstrumentChange(option)}
              >
                <Icon size={24} />
                <span>{t(`settings.instrument.${option}`)}</span>
              </button>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}

function ComfortableKeysSection({
  keys,
  onChange,
}: {
  keys: ComfortableKey[]
  onChange: (keys: ComfortableKey[]) => void
}) {
  const { t } = useTranslation()

  function toggleKey(key: ComfortableKey) {
    const next = keys.includes(key) ? keys.filter((value) => value !== key) : [...keys, key]
    onChange(next.length > 0 ? next : keys)
  }

  return (
    <Card>
      <CardHeader className="p-4 pb-3">
        <CardTitle className="text-base">{t('settings.comfortableKeys.title')}</CardTitle>
        <CardDescription>{t('settings.comfortableKeys.description')}</CardDescription>
      </CardHeader>
      <CardContent className="p-4 pt-0">
        <div
          role="group"
          aria-label={t('settings.comfortableKeys.title')}
          className="grid grid-cols-3 gap-2 sm:grid-cols-4"
        >
          {MUSICAL_KEYS.map((key) => {
            const selected = keys.includes(key)
            return (
              <button
                key={key}
                type="button"
                role="checkbox"
                aria-checked={selected}
                className={cn(
                  'rounded-md border px-3 py-2 text-sm font-semibold transition-colors',
                  selected
                    ? 'border-[var(--color-primary)] bg-[var(--color-primary)] text-[var(--color-primary-foreground)]'
                    : 'border-[var(--color-border)] text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)]/55',
                )}
                onClick={() => toggleKey(key)}
              >
                {key}
              </button>
            )
          })}
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
}: {
  activeTab: SettingsTab
}) {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { data: sessionUser } = useSession()
  const [localePreference, setLocalePreferenceState] = useState(getLocalePreference)
  const [appearancePreference, setAppearancePreference] = useState(readAppearancePreference)
  const [chordFormatPreference, setChordFormatPreference] = useState(readChordFormatPreference)
  const [hideChords, setHideChordsState] = useState(readHideChordsPreference)
  const [chordSongFontScale, setChordSongFontScaleState] = useState(readChordSongFontScale)
  const [tocMultilingual, setTocMultilingualState] = useState(readTocMultilingualPreference)
  const [sheetBackgroundPreference, setSheetBackgroundPreference] = useState(readSheetBackgroundPreference)
  const [invertSheetImages, setInvertSheetImagesState] = useState(readSheetImageInvertPreference)
  const [layoutPreferences, setLayoutPreferences] = useState(readPlayerLayoutPreferences)
  const [defaultPlayerMode, setDefaultPlayerModeState] = useState<PlayerMode>(readPlayerDefaultMode)
  const [developerOptions, setDeveloperOptions] = useState(readDeveloperOptionsPreference)
  const [comfortableKeys, setComfortableKeys] = useState(readComfortableKeysPreference)
  const [playerInstrument, setPlayerInstrument] = useState(readPlayerInstrumentPreference)
  const [collapseLyricWhitespace, setCollapseLyricWhitespaceState] = useState(
    readLyricCollapseWhitespacePreference,
  )
  const [avOutputAutoOpen, setAvOutputAutoOpen] = useState(readAvOutputAutoOpen)
  const [avExternalOutput, setAvExternalOutput] = useState(readAvExternalOutput)
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
        value: 'list',
        label: t('settings.collectionsViewMode.list'),
        description: t('settings.collectionsViewMode.listDescription'),
      },
      {
        value: 'card',
        label: t('settings.collectionsViewMode.card'),
        description: t('settings.collectionsViewMode.cardDescription'),
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

  function setUnifiedLayout(next: Parameters<typeof writePlayerLayoutUnified>[0]) {
    writePlayerLayoutUnified(next)
    setLayoutPreferences(readPlayerLayoutPreferences())
  }

  function setPortraitLayout(next: Parameters<typeof writePlayerLayoutPortrait>[0]) {
    writePlayerLayoutPortrait(next)
    setLayoutPreferences(readPlayerLayoutPreferences())
  }

  function setLandscapeLayout(next: Parameters<typeof writePlayerLayoutPortrait>[0]) {
    writePlayerLayoutLandscape(next)
    setLayoutPreferences(readPlayerLayoutPreferences())
  }

  function setLinkedOrientations(linkedOrientations: boolean) {
    writePlayerLayoutLinkedOrientations(linkedOrientations)
    setLayoutPreferences(readPlayerLayoutPreferences())
  }

  const defaultPlayerModeOptions = useMemo<SettingsOption<PlayerMode>[]>(
    () => [
      {
        value: 'sheet',
        label: t('settings.defaultPlayerMode.sheet'),
        description: t('settings.defaultPlayerMode.sheetDescription'),
      },
      {
        value: 'av',
        label: t('settings.defaultPlayerMode.av'),
        description: t('settings.defaultPlayerMode.avDescription'),
      },
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
      writeBrowserLocalePreference()
      await i18n.changeLanguage(mapLanguagesToLocale(globalThis.navigator.languages))
      return
    }

    const locale: AppLocale = next
    writeExplicitLocalePreference(locale)
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

  function setHideChords(enabled: boolean) {
    setHideChordsState(enabled)
    writeHideChordsPreference(enabled)
  }

  function setChordSongFontScale(value: number) {
    setChordSongFontScaleState(writeChordSongFontScale(value))
  }

  function setTocMultilingual(enabled: boolean) {
    setTocMultilingualState(enabled)
    writeTocMultilingualPreference(enabled)
  }

  function setSheetBackground(next: SheetBackgroundPreference) {
    setSheetBackgroundPreference(next)
    writeSheetBackgroundPreference(next)
  }

  function setInvertSheetImages(enabled: boolean) {
    setInvertSheetImagesState(enabled)
    writeSheetImageInvertPreference(enabled)
  }

  function setDefaultPlayerMode(next: PlayerMode) {
    writePlayerDefaultMode(next)
    setDefaultPlayerModeState(next)
  }

  function setComfortableKeysPreference(next: ComfortableKey[]) {
    setComfortableKeys(writeComfortableKeysPreference(next))
  }

  function setPlayerInstrumentPreference(next: PlayerInstrument) {
    writePlayerInstrumentPreference(next)
    setPlayerInstrument(next)
  }

  function setCollapseLyricWhitespace(next: boolean) {
    writeLyricCollapseWhitespacePreference(next)
    setCollapseLyricWhitespaceState(next)
  }

  function updateAvPreferences(next: AvPreferences) {
    writeAvPreferences(next)
    setAvPreferencesState(next)
  }

  function setAvTransition(partial: Partial<AvPreferences['transition']>) {
    updateAvPreferences({
      ...avPreferences,
      transition: { ...avPreferences.transition, ...partial },
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

          <Card>
            <CardContent className="p-4">
              <label className="flex items-start gap-3 text-sm">
                <input
                  type="checkbox"
                  className="mt-0.5 size-4 shrink-0 accent-[var(--color-primary)]"
                  aria-label={t('settings.developerOptions.label')}
                  checked={developerOptions}
                  onChange={(event) => {
                    const enabled = event.target.checked
                    setDeveloperOptions(enabled)
                    writeDeveloperOptionsPreference(enabled)
                  }}
                />
                <span className="flex flex-col gap-0.5">
                  <span>{t('settings.developerOptions.label')}</span>
                  <span className="text-xs text-[var(--color-muted-foreground)]">
                    {t('settings.developerOptions.description')}
                  </span>
                </span>
              </label>
            </CardContent>
          </Card>

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

          <InstrumentSection
            instrument={playerInstrument}
            onInstrumentChange={setPlayerInstrumentPreference}
          />

          <div id="comfortable-keys" className="scroll-mt-4">
            <ComfortableKeysSection
              keys={comfortableKeys}
              onChange={setComfortableKeysPreference}
            />
          </div>

          <Card>
            <CardHeader className="p-4 pb-3">
              <CardTitle className="text-base">
                {t('settings.chordSongFontScale.title')}
              </CardTitle>
              <CardDescription>{t('settings.chordSongFontScale.description')}</CardDescription>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <label className="flex flex-col gap-2 text-sm">
                <span className="flex items-center justify-between gap-3">
                  <span>{t('settings.chordSongFontScale.label')}</span>
                  <output className="tabular-nums text-[var(--color-muted-foreground)]">
                    {chordSongFontScale}×
                  </output>
                </span>
                <input
                  type="range"
                  min={CHORD_SONG_FONT_SCALE_MIN}
                  max={CHORD_SONG_FONT_SCALE_MAX}
                  step={0.05}
                  value={chordSongFontScale}
                  aria-label={t('settings.chordSongFontScale.label')}
                  onChange={(event) => setChordSongFontScale(Number(event.target.value))}
                  className="w-full accent-[var(--color-primary)]"
                />
                <span
                  className="flex justify-between text-xs text-[var(--color-muted-foreground)]"
                  aria-hidden
                >
                  <span>{CHORD_SONG_FONT_SCALE_MIN}×</span>
                  <span>{CHORD_SONG_FONT_SCALE_MAX}×</span>
                </span>
              </label>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <label className="flex items-start gap-3 text-sm">
                <input
                  type="checkbox"
                  className="mt-0.5 size-4 shrink-0 accent-[var(--color-primary)]"
                  aria-label={t('settings.tocMultilingual.label')}
                  checked={tocMultilingual}
                  onChange={(e) => setTocMultilingual(e.target.checked)}
                />
                <span className="flex flex-col gap-0.5">
                  <span>{t('settings.tocMultilingual.label')}</span>
                  <span className="text-xs text-[var(--color-muted-foreground)]">
                    {t('settings.tocMultilingual.description')}
                  </span>
                </span>
              </label>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <label className="flex items-start gap-3 text-sm">
                <input
                  type="checkbox"
                  className="mt-0.5 size-4 shrink-0 accent-[var(--color-primary)]"
                  aria-label={t('settings.hideChords.label')}
                  checked={hideChords}
                  onChange={(e) => setHideChords(e.target.checked)}
                />
                <span className="flex flex-col gap-0.5">
                  <span>{t('settings.hideChords.label')}</span>
                  <span className="text-xs text-[var(--color-muted-foreground)]">
                    {t('settings.hideChords.description')}
                  </span>
                </span>
              </label>
            </CardContent>
          </Card>

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

          <Card>
            <CardContent className="p-4">
              <label className="flex items-start gap-3 text-sm">
                <input
                  type="checkbox"
                  className="mt-0.5 size-4 shrink-0 accent-[var(--color-primary)]"
                  checked={!layoutPreferences.linkedOrientations}
                  onChange={(e) => setLinkedOrientations(!e.target.checked)}
                />
                <span className="flex flex-col gap-0.5">
                  <span>{t('settings.playerScroll.separateOrientations')}</span>
                  <span className="text-xs text-[var(--color-muted-foreground)]">
                    {t('settings.playerScroll.separateOrientationsDescription')}
                  </span>
                </span>
              </label>
            </CardContent>
          </Card>

          {layoutPreferences.linkedOrientations ? (
            <PlayerLayoutSettingsCard
              title={t('settings.playerScroll.layoutTitle')}
              description={t('settings.playerScroll.layoutDescription')}
              value={layoutPreferences.portrait}
              onChange={setUnifiedLayout}
            />
          ) : (
            <>
              <PlayerLayoutSettingsCard
                title={t('settings.playerScroll.portraitTitle')}
                description={t('settings.playerScroll.portraitDescription')}
                value={layoutPreferences.portrait}
                onChange={setPortraitLayout}
              />

              <PlayerLayoutSettingsCard
                title={t('settings.playerScroll.landscapeTitle')}
                description={t('settings.playerScroll.landscapeDescription')}
                value={layoutPreferences.landscape}
                onChange={setLandscapeLayout}
              />
            </>
          )}
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
              <CardTitle className="text-base">{t('settings.playerRoles.output.autoOpenTitle')}</CardTitle>
              <CardDescription>{t('settings.playerRoles.output.autoOpenDescription')}</CardDescription>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <label className="flex items-start gap-3 text-sm">
                <input
                  type="checkbox"
                  className="mt-0.5 size-4 shrink-0 accent-[var(--color-primary)]"
                  checked={avOutputAutoOpen}
                  onChange={(event) => {
                    writeAvOutputAutoOpen(event.target.checked)
                    setAvOutputAutoOpen(event.target.checked)
                  }}
                />
                <span>{t('settings.playerRoles.output.autoOpenLabel')}</span>
              </label>
            </CardContent>
          </Card>
          <AvDisplaySettings />
          <SettingsSection
            title={t('settings.playerRoles.output.externalTitle')}
            disabledExplanation={!isTauri() ? t('settings.playerRoles.output.browserOnly') : undefined}
            description={t('settings.playerRoles.output.externalDescription')}
            options={[
              { value: 'display', label: t('settings.playerRoles.output.display'), description: t('settings.playerRoles.output.displayDescription') },
              { value: 'window', label: t('settings.playerRoles.output.window'), description: t('settings.playerRoles.output.windowDescription') },
            ]}
            value={avExternalOutput}
            onChange={(value) => { writeAvExternalOutput(value); setAvExternalOutput(value) }}
          />
          <SettingsSection
            title={t('settings.playerRoles.output.noExternalTitle')}
            disabledExplanation={!isTauri() ? t('settings.playerRoles.output.browserOnly') : undefined}
            description={t('settings.playerRoles.output.noExternalDescription')}
            options={[{ value: 'window', label: t('settings.playerRoles.output.window'), description: t('settings.playerRoles.output.windowDescription') }]}
            value="window"
            onChange={() => {}}
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

        </div>
      ) : null}

      {activeTab === 'audio' || activeTab === 'midi' ? (
        <div
          id={`settings-panel-${activeTab}`}
          role="tabpanel"
          aria-labelledby={`settings-tab-${activeTab}`}
        >
          <Card>
            <CardHeader className="p-4">
              <CardTitle className="text-base">{t(`settings.tabs.${activeTab}`)}</CardTitle>
              <CardDescription>{t('settings.emptySection')}</CardDescription>
            </CardHeader>
          </Card>
        </div>
      ) : null}

      {activeTab === 'connections' ? (
        <div
          id="settings-panel-connections"
          role="tabpanel"
          aria-labelledby="settings-tab-connections"
          className="flex flex-col gap-4"
        >
          <McpConnectionsSettings />
        </div>
      ) : null}
    </div>
  )
}
