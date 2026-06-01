import type { Page } from '@playwright/test'

export class LoginPage {
  constructor(private readonly page: Page) {}

  async goto(returnTo?: string) {
    const q = returnTo ? `?return_to=${encodeURIComponent(returnTo)}&lang=en` : '?lang=en'
    await this.page.goto(`/login${q}`)
  }

  emailInput = () => this.page.getByLabel('Email')
  codeInput = () => this.page.getByLabel('Verification code')
  sendCodeButton = () => this.page.getByRole('button', { name: 'Send code' })
  verifyButton = () => this.page.getByRole('button', { name: 'Verify and sign in' })
  useDifferentEmailButton = () => this.page.getByRole('button', { name: 'Use a different email' })
  googleButton = () => this.page.getByRole('button', { name: 'Login with Google' })
  alert = () => this.page.getByRole('alert')
}
