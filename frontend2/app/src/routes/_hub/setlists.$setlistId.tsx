import { createFileRoute } from '@tanstack/react-router'

import { SetlistEditorScreen } from '@/components/setlists/SetlistEditorScreen'

export const Route = createFileRoute('/_hub/setlists/$setlistId')({
  component: SetlistEditorRoute,
})

function SetlistEditorRoute() {
  const { setlistId } = Route.useParams()
  return <SetlistEditorScreen setlistId={setlistId} />
}
