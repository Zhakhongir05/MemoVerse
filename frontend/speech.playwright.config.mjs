import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir: './e2e', testMatch: ['speech.production.spec.js', 'minimal-memory.spec.js'], workers: 1, retries: 0,
  timeout: 30000, reporter: 'list', outputDir: 'test-results/speech',
  use: { channel: process.env.MEMOVERSE_BROWSER_CHANNEL || 'chrome', headless: true },
})
