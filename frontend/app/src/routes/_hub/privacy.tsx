import { createFileRoute } from '@tanstack/react-router'

import { LegalStubView } from '@/components/legal/LegalStubView'

export const Route = createFileRoute('/_hub/privacy')({
  component: () => <LegalStubView page="privacy" />,
})
