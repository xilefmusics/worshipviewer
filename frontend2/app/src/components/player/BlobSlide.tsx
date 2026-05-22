import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { useBlobUrl } from '@/hooks/useBlobUrl'

type BlobSlideProps = {
  blobId: string
  allowNetworkFetch: boolean
}

export function BlobSlide({ blobId, allowNetworkFetch }: BlobSlideProps) {
  const { t } = useTranslation()
  const { url, mime, status, retry, cancel } = useBlobUrl(blobId, { allowNetworkFetch })

  if (status === 'offline-unavailable') {
    return (
      <p className="px-4 py-8 text-center text-sm text-[var(--color-danger)]" role="alert">
        {t('player.blobOffline')}
      </p>
    )
  }

  if (status === 'error') {
    return (
      <div className="flex flex-col items-center gap-3 px-4 py-10 text-center">
        <p className="text-sm text-[var(--color-danger)]" role="alert">
          {t('player.blobMissing')}
        </p>
        <Button type="button" variant="outline" size="sm" onClick={retry}>
          {t('hub.error.retry')}
        </Button>
      </div>
    )
  }

  if (status === 'loading' || !url) {
    return (
      <div className="flex flex-col items-center gap-3 py-12">
        <p className="text-sm text-[var(--color-muted-foreground)]">{t('common.load')}</p>
        <Button type="button" variant="outline" size="sm" onClick={cancel}>
          {t('player.blobCancel')}
        </Button>
      </div>
    )
  }

  if (mime?.includes('pdf')) {
    return (
      <div className="player-blob-page flex min-h-0 flex-1 flex-col bg-white">
        <embed title="" src={url} className="min-h-0 w-full flex-1 border-0 bg-white" />
      </div>
    )
  }

  return (
    <div className="player-blob-page flex min-h-0 flex-1 items-center justify-center overflow-auto bg-white p-4">
      <img
        src={url}
        alt=""
        className="max-h-full max-w-full object-contain"
        draggable={false}
      />
    </div>
  )
}
