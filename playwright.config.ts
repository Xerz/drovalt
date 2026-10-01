import { defineConfig } from '@playwright/test';

const port = process.env.DROVALT_E2E_PORT ?? '3000';

export default defineConfig({
  testDir: './tests/e2e',
  outputDir: '../output/playwright/e2e',
  fullyParallel: false,
  retries: 0,
  reporter: 'line',
  use: {
    baseURL: `http://localhost:${port}`,
    channel: 'chrome',
    trace: 'off',
    screenshot: 'off',
    video: 'off',
  },
  webServer: {
    command: `npm run dev -- --port ${port} --strictPort`,
    url: `http://localhost:${port}`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
