import { createFileRoute } from '@tanstack/react-router'

import { AboutView } from '@/components/about/AboutView'

export const Route = createFileRoute('/_hub/about')({
  component: AboutRoute,
})

function AboutRoute() {
  return <AboutView />
}
