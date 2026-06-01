import { defineConfig, devices } from '@playwright/test'

const PORT = Number(process.env.E2E_PORT ?? 8788)
const HOST = process.env.E2E_HOST ?? '127.0.0.1'
const baseURL = `http://${HOST}:${PORT}`

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.ts',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  timeout: 60_000,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'html',
  use: {
    baseURL,
    trace: 'on-first-retry',
    locale: 'en-US',
    serviceWorkers: 'block',
  },
  projects: [
    {
      name: 'chromium',
      testIgnore: [/mobile-viewport\.spec\.ts/, /pull-refresh\.spec\.ts/],
      use: {
        ...devices['Desktop Chrome'],
        hasTouch: false,
      },
    },
    {
      name: 'iphone',
      testMatch: [/mobile-viewport\.spec\.ts/, /pull-refresh\.spec\.ts/],
      use: {
        ...devices['iPhone 14'],
      },
    },
    {
      name: 'ipad',
      testMatch: /mobile-viewport\.spec\.ts/,
      use: {
        ...devices['iPad Pro 11'],
      },
    },
  ],
  webServer: {
    command: 'node e2e/serve-backend.mjs',
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
})
