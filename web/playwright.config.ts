import { defineConfig, devices } from '@playwright/test';

/**
 * UI smoke for the manual checklist (login + key pages after mega-page split).
 * Expects API on :4010. Starts Vite via webServer unless PLAYWRIGHT_BASE_URL is set.
 */
const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:5173';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [['list']],
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'off',
    locale: 'zh-CN',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        // Run from web package; reuse if `npm start` already launched Vite.
        command: 'npm run dev',
        url: baseURL,
        reuseExistingServer: true,
        timeout: 120_000,
      },
});
