import { createFileRoute } from '@tanstack/react-router'

import { LegalStubView } from '@/components/legal/LegalStubView'

export const Route = createFileRoute('/_hub/ugc')({
  component: () => <LegalStubView page="ugc" />,
})
