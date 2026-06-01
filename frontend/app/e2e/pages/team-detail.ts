import type { Page } from '@playwright/test'

import { gotoEn } from '../helpers'

export class TeamDetailPage {
  constructor(private readonly page: Page) {}

  async goto(teamId: string) {
    await gotoEn(this.page, `/teams/${teamId}`)
  }

  titleHeading = () => this.page.locator('h1').first()
  inviteButton = () => this.page.getByRole('button', { name: 'Invite' })
  deleteTeamButton = () => this.page.getByRole('button', { name: /delete team/i })
  saveRolesButton = () => this.page.getByRole('button', { name: 'Save' })
  discardButton = () => this.page.getByRole('button', { name: 'Discard' })
  roleSelect = (memberEmail: string) =>
    this.page.locator(`[data-member="${memberEmail}"]`).getByRole('combobox').or(
      this.page.getByLabel(new RegExp(memberEmail, 'i')),
    )
}
