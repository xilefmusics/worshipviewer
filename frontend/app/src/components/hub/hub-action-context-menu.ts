import type { MouseEvent } from 'react'

export function openHubActionsFromContextMenu(event: MouseEvent<HTMLElement>) {
  if (!(event.target instanceof Element)) return
  const resource = event.target.closest('[data-hub-resource]')
  const actionsTrigger = resource?.querySelector<HTMLButtonElement>('[data-hub-actions-trigger]')
  if (!actionsTrigger) return
  event.preventDefault()
  actionsTrigger.click()
}
