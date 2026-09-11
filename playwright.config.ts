import { defineConfig } from '@playwright/test';

const PORT = 4698;

export default defineConfig({
  testDir: './e2e',
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  use: {
    baseURL: `http://localhost:${PORT}/crypto-lab-split-point/`,
    colorScheme: 'dark',
    trace: 'retain-on-failure'
  },
  webServer: {
    command: `npm run build && npm run preview -- --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/crypto-lab-split-point/`,
    reuseExistingServer: !process.env.CI
  }
});