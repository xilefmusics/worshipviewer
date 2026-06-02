import { useTranslation } from 'react-i18next'

import { LEGAL_EXTERNAL_LINKS } from '@/lib/legal-external-links'
import { cn } from '@/lib/utils'

type LegalExternalLinksProps = {
  className?: string
  linkClassName?: string
  /** Open worshipviewer.com pages in a new tab (e.g. when already inside the app). */
  openInNewTab?: boolean
}

/** Imprint, privacy, and terms — shared with the login page footer. */
export function LegalExternalLinks({
  className,
  linkClassName,
  openInNewTab = false,
}: LegalExternalLinksProps) {
  const { t } = useTranslation()
  return (
    <ul className={cn('list-none p-0', className)}>
      {LEGAL_EXTERNAL_LINKS.map(({ key, href }) => (
        <li key={href}>
          <a
            href={href}
            className={cn('underline underline-offset-2', linkClassName)}
            {...(openInNewTab
              ? { target: '_blank', rel: 'noopener noreferrer' }
              : {})}
          >
            {t(key)}
          </a>
        </li>
      ))}
    </ul>
  )
}
