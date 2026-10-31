import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir: './e2e', testMatch: 'memorycast.spec.js', workers: 1, retries: 0,
  timeout: 30000, reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:5207', channel: 'chrome', headless: true, screenshot: 'only-on-failure' },
  webServer: { command: 'npm run dev -- --host 127.0.0.1 --port 5207 --strictPort', url: 'http://127.0.0.1:5207', reuseExistingServer: false,
    env: { VITE_SUPABASE_URL: 'http://127.0.0.1:8036', VITE_SUPABASE_PUBLISHABLE_KEY: 'test-publishable' } },
})
