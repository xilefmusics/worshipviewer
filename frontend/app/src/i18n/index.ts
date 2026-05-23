import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

import de from '@/i18n/de.json'
import en from '@/i18n/en.json'
import {
  BROWSER_LOCALE_FLAG_KEY,
  LOCALE_STORAGE_KEY,
  type AppLocale,
  resolveInitialLocale,
} from '@/lib/locale'

export function initI18n(): void {
  if (typeof globalThis.window === 'undefined') return

  const params = new URLSearchParams(globalThis.window.location.search)
  const stored = globalThis.localStorage.getItem(LOCALE_STORAGE_KEY)
  const browserFlag = globalThis.localStorage.getItem(BROWSER_LOCALE_FLAG_KEY)
  const lng: AppLocale = resolveInitialLocale(
    params,
    stored,
    globalThis.navigator.languages,
    browserFlag,
  )

  void i18n.use(initReactI18next).init({
    resources: {
      en: { translation: en },
      de: { translation: de },
    },
    lng,
    fallbackLng: 'en',
    interpolation: { escapeValue: false },
  })

  i18n.on('languageChanged', (l) => {
    if (globalThis.localStorage.getItem(BROWSER_LOCALE_FLAG_KEY) === '1') {
      return
    }
    if (l === 'en' || l === 'de') {
      globalThis.localStorage.setItem(LOCALE_STORAGE_KEY, l)
    }
  })
}

export { i18n }
