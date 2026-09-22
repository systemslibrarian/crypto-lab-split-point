import { defineConfig } from '@playwright/test';

const PORT = 4698;

export default defineConfig({
  testDir: './e2e',
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  globalSetup: './e2e/global-setup.ts',
  use: {
    baseURL: `http://localhost:${PORT}/crypto-lab-split-point/`,
    colorScheme: 'dark',
    trace: 'retain-on-failure'
  },
  // `verdict-ledger` reads back the (spec, test, marker) triples the shared
  // helpers actually executed, so it has to run after everything that calls
  // them. Playwright puts each spec in its own worker process, which is why the
  // ledger is a file rather than a Set, and why this is a project with
  // `dependencies:` rather than an ordinary test.
  projects: [
    { name: 'claims', testMatch: /(?:claims|flows|verdict-coverage)\.spec\.ts$/ },
    { name: 'a11y', testMatch: /a11y\.spec\.ts$/ },
    { name: 'verdict-ledger', testMatch: /verdict-ledger\.spec\.ts$/, dependencies: ['claims'] }
  ],
  webServer: {
    command: `npm run build && npm run preview -- --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/crypto-lab-split-point/`,
    reuseExistingServer: !process.env.CI
  }
});
