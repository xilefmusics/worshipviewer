import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

type LegalStubViewProps = {
  page: 'terms' | 'privacy' | 'ugc'
}

export function LegalStubView({ page }: LegalStubViewProps) {
  const { t } = useTranslation()
  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-4 py-4">
      <Button type="button" variant="ghost" className="w-fit" asChild>
        <Link to="/about">{t('legal.backToAbout')}</Link>
      </Button>
      <Card>
        <CardHeader>
          <CardTitle>{t(`legal.${page}.title`)}</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-[var(--color-muted-foreground)]">
          <p>{t(`legal.${page}.placeholder`)}</p>
        </CardContent>
      </Card>
    </div>
  )
}
