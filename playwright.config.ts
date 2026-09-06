import { defineConfig } from '@playwright/test'

const port = Number(process.env.PLAYWRIGHT_PORT ?? 4173)

export default defineConfig({
  testDir: './src/tests/e2e',
  // WebGL and dense-frame assertions share the machine's graphics/CPU budget.
  workers: 1,
  timeout: 30_000,
  use: { baseURL: `http://127.0.0.1:${port}/rotating-target-calibration-studio/`, headless: true },
  webServer: {
    command: `GITHUB_ACTIONS=true npm run build && npm run preview -- --host 127.0.0.1 --port ${port} --strictPort --base /rotating-target-calibration-studio/`,
    url: `http://127.0.0.1:${port}/rotating-target-calibration-studio/`,
    reuseExistingServer: process.env.PLAYWRIGHT_REUSE_SERVER === 'true',
  },
})
