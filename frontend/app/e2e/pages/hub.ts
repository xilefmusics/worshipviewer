import type { Page } from '@playwright/test'

import { gotoEn, openContextMenu, searchHub } from '../helpers'

export class HubPage {
  constructor(private readonly page: Page) {}

  async goto(path: '/collections' | '/songs' | '/setlists' | '/teams') {
    await gotoEn(this.page, path)
  }

  searchbox = () => this.page.getByRole('searchbox', { name: 'Search library' })
  createFab = (label: string | RegExp) => this.page.getByRole('button', { name: label })
  tab = (name: string) => this.page.getByRole('link', { name })
  row = (name: string | RegExp) => this.page.getByRole('button', { name })
  menuItem = (name: string | RegExp) => this.page.getByRole('menuitem', { name })
  profileButton = () => this.page.getByRole('button', { name: /profile|account|menu/i }).first()

  async search(query: string) {
    await searchHub(this.page, query)
  }

  async openRowMenu(name: string | RegExp) {
    await openContextMenu(this.page, name)
  }

  loadMore = () => this.page.getByRole('button', { name: 'Load more' })
  clearSearch = () => this.page.getByRole('button', { name: 'Clear search' })
  retryButton = () => this.page.getByRole('button', { name: 'Retry' })
}
