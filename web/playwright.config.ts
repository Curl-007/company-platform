import { defineConfig, devices } from '@playwright/test';

/**
 * UI smoke for the manual checklist (login + key pages after mega-page split).
 * Starts Vite via webServer unless PLAYWRIGHT_BASE_URL is set. The RC runner
 * supplies isolated API/Web ports through environment variables.
 */
const requestedWebPort = Number(process.env.PLAYWRIGHT_WEB_PORT || 5173);
const webPort = Number.isInteger(requestedWebPort) && requestedWebPort > 0 ? requestedWebPort : 5173;
const baseURL = process.env.PLAYWRIGHT_BASE_URL || `http://127.0.0.1:${webPort}`;

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
        command: `npm run dev -- --host 127.0.0.1 --port ${webPort} --strictPort`,
        url: baseURL,
        reuseExistingServer: process.env.PLAYWRIGHT_REUSE_SERVER !== 'false',
        timeout: 120_000,
      },
});
