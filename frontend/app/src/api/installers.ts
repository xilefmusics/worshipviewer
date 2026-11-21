import type { components } from '@/api/schema'
import { api } from '@/api/client'

export type DesktopInstaller = components['schemas']['DesktopInstaller']
export type DesktopInstallerManifest = components['schemas']['DesktopInstallerManifest']
export type DesktopInstallerCatalog = components['schemas']['DesktopInstallerCatalog']

export async function fetchDesktopInstallerManifest(): Promise<DesktopInstallerManifest> {
  const { data, error, response } = await api.GET('/api/v1/installers', {})
  if (!response.ok || !data) {
    const detail = error ? JSON.stringify(error) : response.statusText
    throw new Error(detail || 'Installer manifest request failed')
  }
  return data
}

export async function fetchDesktopInstallerCatalog(): Promise<DesktopInstallerCatalog> {
  const { data, error, response } = await api.GET('/api/v1/installers/releases', {})
  if (!response.ok || !data) {
    const detail = error ? JSON.stringify(error) : response.statusText
    throw new Error(detail || 'Installer release catalog request failed')
  }
  return data
}
