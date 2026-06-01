import { defineConfig, devices } from '@playwright/test'

const PORT = 4173 // vite preview default
const HOST = '127.0.0.1'

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'html',
  use: {
    baseURL: `http://${HOST}:${PORT}`,
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // serve the production build; assumes `pnpm build` already ran (build:wasm + vite build).
    // Bind explicitly to HOST so the probe URL matches the listening interface
    // (vite preview defaults to `localhost`, which can resolve to IPv6 ::1 only).
    command: `pnpm preview --port ${PORT} --strictPort --host ${HOST}`,
    url: `http://${HOST}:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
