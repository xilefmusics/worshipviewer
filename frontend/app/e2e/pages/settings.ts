import type { Page } from '@playwright/test'

import { gotoEn } from '../helpers'

export class SettingsPage {
  constructor(private readonly page: Page) {}

  async goto(tab?: 'general' | 'player' | 'playerRoles') {
    const path = tab ? `/settings?tab=${tab}` : '/settings'
    await gotoEn(this.page, path)
  }

  generalTab = () => this.page.getByRole('tab', { name: /general/i })
  playerTab = () => this.page.getByRole('tab', { name: /player default/i })
  avTab = () => this.page.getByRole('tab', { name: /player av/i })
  logoutButton = () => this.page.getByRole('button', { name: 'Log out' })
  backButton = () => this.page.getByRole('button', { name: 'Back' })
  clearCacheButton = () => this.page.getByRole('button', { name: /clear.*cache/i })
}
