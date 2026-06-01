import './index.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { App } from '@/App'
import { initI18n } from '@/i18n'
import { initAppearance } from '@/lib/appearance'
import { initSheetBackground } from '@/lib/sheet-background'
import { initLogoutQueue } from '@/lib/logout-queue'

initAppearance()
initSheetBackground()
initI18n()
initLogoutQueue()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
