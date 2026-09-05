import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './src/tests/e2e',
  timeout: 30_000,
  use: { baseURL: 'http://127.0.0.1:4173/rotating-target-calibration-studio/', headless: true },
  webServer: {
    command: 'GITHUB_ACTIONS=true npm run build && npm run preview -- --host 127.0.0.1 --base /rotating-target-calibration-studio/',
    url: 'http://127.0.0.1:4173/rotating-target-calibration-studio/',
    reuseExistingServer: false,
  },
})
