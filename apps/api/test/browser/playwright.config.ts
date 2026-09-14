import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: '.',
  testMatch: '*.browser-spec.ts',
  workers: 1,
  fullyParallel: false,
  timeout: 30000,
  expect: { timeout: 8000 },
  reporter: 'list',
  use: {
    baseURL: 'https://localhost:55434',
    ignoreHTTPSErrors: true,
    trace: 'off',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
  ],
});
