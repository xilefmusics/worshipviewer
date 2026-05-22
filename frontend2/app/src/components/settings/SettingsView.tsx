import { useNavigate } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import { type ChangeEvent, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { deleteUploadedProfilePicture, putProfilePicture } from '@/api/profile-picture'
import { fetchSessionUser, SESSION_QUERY_KEY, SESSION_STALE_TIME_MS, type User } from '@/api/session'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
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
  readPlayerScrollPreferences,
  writePlayerScrollLandscape,
  writePlayerScrollPortrait,
} from '@/lib/player-scroll-preference'
import type { PlayerScrollType } from '@/lib/player/effective-scroll-type'
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
} from '@/lib/offline/setlist-player-cache'
import { cn } from '@/lib/utils'

type SettingsOption<T extends string> = {
  value: T
  label: string
  description: string
}

function getLocalePreference(): LocalePreference {
  return resolveLocalePreference(
    globalThis.localStorage.getItem(LOCALE_STORAGE_KEY),
    globalThis.localStorage.getItem(BROWSER_LOCALE_FLAG_KEY),
  )
}

function OptionButton<T extends string>({
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

function SettingsSection<T extends string>({
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

export function SettingsView() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { data: sessionUser } = useSession()
  const [localePreference, setLocalePreferenceState] = useState(getLocalePreference)
  const [appearancePreference, setAppearancePreference] = useState(readAppearancePreference)
  const [chordFormatPreference, setChordFormatPreference] = useState(readChordFormatPreference)
  const [scrollPreferences, setScrollPreferences] = useState(readPlayerScrollPreferences)
  const [cacheState, setCacheState] = useState<'idle' | 'clearing' | 'cleared' | 'failed'>('idle')
  const [approxBytes, setApproxBytes] = useState<number | null>(null)
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

  function setPortraitScroll(next: PlayerScrollType) {
    writePlayerScrollPortrait(next)
    setScrollPreferences(readPlayerScrollPreferences())
  }

  function setLandscapeScroll(next: PlayerScrollType) {
    writePlayerScrollLandscape(next)
    setScrollPreferences(readPlayerScrollPreferences())
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
      setApproxBytes(playerB + kvB)
    })()
  }, [cacheState])

  async function logout() {
    setLogoutPending(true)
    await performLogout(queryClient)
    void navigate({ to: '/login', search: { return_to: undefined } })
  }

  return (
    <div className="flex w-full min-w-0 flex-col gap-4">
      <div>
        <h1 className="mb-1 text-lg font-semibold text-[var(--color-foreground)]">
          {t('settings.title')}
        </h1>
        <p className="text-sm text-[var(--color-muted-foreground)]">
          {t('settings.description')}
        </p>
      </div>

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
        title={t('settings.chordFormat.title')}
        description={t('settings.chordFormat.description')}
        options={chordFormatOptions}
        value={chordFormatPreference}
        onChange={setChordFormat}
      />

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

      {sessionUser ? <SettingsProfilePictureSection user={sessionUser} /> : null}

      <Card>
        <CardHeader className="p-4 pb-3">
          <CardTitle className="text-base">{t('settings.cache.title')}</CardTitle>
          <CardDescription>{t('settings.cache.description')}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-start gap-2 p-4 pt-0">
          {approxBytes !== null ? (
            <p className="text-xs text-[var(--color-muted-foreground)]">
              {t('settings.cache.approxSize', { size: formatApproxBytes(approxBytes) })}
            </p>
          ) : (
            <p className="text-xs text-[var(--color-muted-foreground)]">{t('common.load')}</p>
          )}
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
          <Button type="button" variant="destructive" onClick={() => void logout()} disabled={logoutPending}>
            {logoutPending ? t('common.load') : t('settings.account.logout')}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
