import './index.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { App } from '@/App'
import { initI18n } from '@/i18n'
import { initAppearance } from '@/lib/appearance'
import { initSheetBackground } from '@/lib/sheet-background'
import { initLogoutQueue } from '@/lib/logout-queue'

function runBootstrapStep(step: () => void): void {
  try {
    step()
  } catch {
    /* Keep React mount non-fatal when an older browser rejects a startup API. */
  }
}

runBootstrapStep(initAppearance)
runBootstrapStep(initSheetBackground)
runBootstrapStep(initI18n)
runBootstrapStep(initLogoutQueue)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
