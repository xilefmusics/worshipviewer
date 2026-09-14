import { render, screen } from '@testing-library/react'
import i18next from 'i18next'
import { I18nextProvider, initReactI18next } from 'react-i18next'
import { describe, expect, it } from 'vitest'

import de from '@/i18n/de.json'
import en from '@/i18n/en.json'
import { OfflineCachedIndicator } from '@/components/hub/OfflineCachedIndicator'

async function renderIndicator(language: 'en' | 'de', visible: boolean) {
  const i18n = i18next.createInstance()
  await i18n.use(initReactI18next).init({
    resources: { en: { translation: en }, de: { translation: de } },
    lng: language,
    fallbackLng: 'en',
    interpolation: { escapeValue: false },
  })

  return render(
    <I18nextProvider i18n={i18n}>
      <OfflineCachedIndicator visible={visible} />
    </I18nextProvider>,
  )
}

describe('OfflineCachedIndicator', () => {
  it('stays hidden when the player is not cached', async () => {
    await renderIndicator('en', false)

    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  it.each([
    ['en' as const, 'Saved offline'],
    ['de' as const, 'Offline gespeichert'],
  ])('exposes the localized cached status in %s', async (language, label) => {
    await renderIndicator(language, true)

    const indicator = screen.getByRole('img', { name: label })
    expect(indicator).toHaveAttribute('title', label)
    expect(indicator.querySelector('svg')).toBeInTheDocument()
  })
})
