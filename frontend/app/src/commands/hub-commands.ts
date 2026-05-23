export type HubNavigateTarget =
  | '/collections'
  | '/songs'
  | '/setlists'
  | '/teams'
  | '/sessions'
  | '/settings'

export type HubNavigateCommand = {
  id: string
  value: string
  labelKey: string
  keywords: string[]
  to: HubNavigateTarget
}

export type HubActionCommand = {
  id: string
  value: string
  labelKey: string
  keywords: string[]
  action: 'search-library'
}

/** Navigate group — register every routable hub destination in one place. */
export const hubNavigateCommands: HubNavigateCommand[] = [
  {
    id: 'collections',
    value: 'nav-collections',
    labelKey: 'hub.tabs.collections',
    keywords: ['collections', 'library'],
    to: '/collections',
  },
  {
    id: 'songs',
    value: 'nav-songs',
    labelKey: 'hub.tabs.songs',
    keywords: ['songs', 'music'],
    to: '/songs',
  },
  {
    id: 'setlists',
    value: 'nav-setlists',
    labelKey: 'hub.tabs.setlists',
    keywords: ['setlists', 'sets'],
    to: '/setlists',
  },
  {
    id: 'settings',
    value: 'nav-settings',
    labelKey: 'hub.profile.settings',
    keywords: ['settings', 'preferences'],
    to: '/settings',
  },
  {
    id: 'teams',
    value: 'nav-teams',
    labelKey: 'hub.profile.teams',
    keywords: ['teams'],
    to: '/teams',
  },
  {
    id: 'sessions',
    value: 'nav-sessions',
    labelKey: 'hub.profile.sessions',
    keywords: ['sessions'],
    to: '/sessions',
  },
]

export const hubActionCommands: HubActionCommand[] = [
  {
    id: 'search-library',
    value: 'action-search-library',
    labelKey: 'hub.cmdk.searchAction',
    keywords: ['search', 'find', 'library', 'filter', 'query'],
    action: 'search-library',
  },
]

export type HubInstallCommand = {
  id: 'install'
  value: 'nav-install'
  labelKey: 'hub.profile.install'
  keywords: string[]
}

export const hubInstallCommand: HubInstallCommand = {
  id: 'install',
  value: 'nav-install',
  labelKey: 'hub.profile.install',
  keywords: ['install', 'app', 'pwa'],
}
