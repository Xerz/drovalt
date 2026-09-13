import { defineConfig } from '@playwright/test';
import baseConfig from './playwright.config';

export default defineConfig({
  ...baseConfig,
  testMatch: 'station-games-navigation.spec.ts',
  use: {
    ...baseConfig.use,
    baseURL: 'http://127.0.0.1:4174/drovalt/',
  },
  webServer: {
    command:
      'npm run build:pages && vite preview --config vite.pages.config.ts --host 127.0.0.1 --port 4174 --strictPort',
    url: 'http://127.0.0.1:4174/drovalt/',
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
