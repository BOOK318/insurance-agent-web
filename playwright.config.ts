import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  fullyParallel: false, // smoke tests share state (auth cookie, DB rows)
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: process.env.TEST_BASE_URL ?? 'http://localhost:3000',
    extraHTTPHeaders: { 'Accept-Language': 'zh-HK' },
    locale: 'zh-HK',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  // Don't auto-start the dev server — assume it's already running.
  // Run `npm run dev` first, then `npm run test:e2e`.
});
