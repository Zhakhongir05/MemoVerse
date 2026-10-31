import { test, expect } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const dist = fileURLToPath(new URL('../dist/', import.meta.url))
async function editor(page, behavior = 'normal') {
  // Serve the actual compiled app over an isolated HTTPS origin. No live
  // Supabase, provider, microphone or speech service is contacted.
  await page.route('**/*', async route => {
    const url = new URL(route.request().url())
    if (url.origin !== 'https://memoverse.test') return route.abort()
    const asset = url.pathname.startsWith('/assets/') ? url.pathname.slice(1) : 'index.html'
    const file = path.resolve(dist, asset)
    if (!file.startsWith(dist)) return route.abort()
    const contentType = asset.endsWith('.js') ? 'text/javascript' : asset.endsWith('.css') ? 'text/css' : asset.endsWith('.png') ? 'image/png' : 'text/html'
    await route.fulfill({ body: await readFile(file), contentType })
  })
  await page.addInitScript(mode => {
    window.speechAborts = 0
    class FakeSpeech {
      constructor() { window.testSpeech = this }
      start() { if (mode !== 'permission-pending') this.onstart?.() }
      stop() { if (mode !== 'stop-pending') this.onend?.() }
      abort() { window.speechAborts++; this.onend?.() }
    }
    Object.defineProperty(window, 'SpeechRecognition', { configurable: true, value: mode === 'unsupported' ? undefined : FakeSpeech })
    Object.defineProperty(window, 'webkitSpeechRecognition', { configurable: true, value: undefined })
  }, behavior)
  await page.goto('https://memoverse.test/')
  expect(await page.evaluate(() => window.isSecureContext)).toBe(true)
  await page.getByRole('button', { name: 'Explore Memories', exact: true }).click()
  await expect(page.locator('input[type=password],input[type=email]')).toHaveCount(0)
  await page.getByRole('button', { name: 'Continue exploring without signing in' }).click()
  await page.getByRole('button', { name: 'Create your first memory', exact: true }).click()
  await page.getByRole('button', { name: 'Speak your memory', exact: true }).click()
}

async function dictate(page, text) {
  await page.evaluate(text => window.testSpeech.onresult({ results: [Object.assign([{ transcript: text }], { isFinal: true })] }), text)
}

test('production HTTPS: dictation preserves typing, review inserts once, and the saved entry survives reload', async ({ page }) => {
  await editor(page)
  await page.clock.install()
  await page.locator('#mj-title').fill('A spoken memory')
  await page.locator('#mj-story').fill('Typed beginning.')
  await page.getByRole('button', { name: 'Start dictation', exact: true }).click()
  // A synchronous native start must cancel the permission timeout too.
  await page.clock.fastForward(16000)
  await expect(page.getByText('Listening… Speak naturally, then stop to review.')).toBeVisible()
  await dictate(page, 'The afternoon was golden.')
  await dictate(page, 'The afternoon was golden.')
  await expect(page.locator('#mj-story')).toHaveValue('Typed beginning.')
  await page.getByRole('button', { name: 'Stop dictation', exact: true }).click()
  await page.getByRole('button', { name: 'Add to my story', exact: true }).click()
  await expect(page.locator('#mj-story')).toHaveValue('Typed beginning. The afternoon was golden.')
  await page.getByRole('button', { name: 'Save journal entry', exact: false }).click()
  await expect(page.locator('.mj-detail-story')).toHaveText('Typed beginning. The afternoon was golden.')
  await page.reload()
  await page.getByRole('button', { name: 'Explore Memories', exact: true }).click()
  await page.getByRole('button', { name: 'Continue exploring without signing in' }).click()
  await page.getByRole('button', { name: 'Read current memory', exact: true }).click()
  await expect(page.locator('.jh-full-story')).toHaveText('Typed beginning. The afternoon was golden.')
})

test('production HTTPS: permission/network errors reset controls even without an end event', async ({ page }) => {
  await editor(page)
  for (const [error, message] of [['not-allowed', 'Microphone access was denied'], ['network', 'Speech recognition could not connect']]) {
    await page.getByRole('button', { name: 'Start dictation', exact: true }).click()
    await page.evaluate(error => window.testSpeech.onerror({ error }), error)
    await expect(page.getByRole('alert').filter({ hasText: message })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Start dictation', exact: true })).toBeEnabled()
  }
})

test('production HTTPS: pending microphone permission can time out and be cancelled', async ({ page }) => {
  await editor(page, 'permission-pending')
  await page.clock.install()
  await page.getByRole('button', { name: 'Start dictation', exact: true }).click()
  await page.clock.fastForward(16000)
  await expect(page.getByText(/Microphone access did not start/)).toBeVisible()
  await page.getByRole('button', { name: 'Start dictation', exact: true }).click()
  await page.getByRole('button', { name: 'Cancel microphone', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Start dictation', exact: true })).toBeEnabled()
})

test('production HTTPS: stalled stop preserves captured text and closing releases the microphone', async ({ page }) => {
  await editor(page, 'stop-pending')
  await page.clock.install()
  await page.getByRole('button', { name: 'Start dictation', exact: true }).click()
  await dictate(page, 'Words worth keeping.')
  await page.getByRole('button', { name: 'Stop dictation', exact: true }).click()
  await page.clock.fastForward(6000)
  await expect(page.getByRole('button', { name: 'Add to my story', exact: true })).toBeEnabled()
  await page.getByRole('button', { name: 'Start dictation', exact: true }).click()
  const before = await page.evaluate(() => window.speechAborts)
  await page.getByRole('button', { name: 'Close voice input', exact: true }).click()
  expect(await page.evaluate(() => window.speechAborts)).toBeGreaterThan(before)
})

test('production HTTPS: unsupported browsers retain editable typing', async ({ page }) => {
  await editor(page, 'unsupported')
  await expect(page.getByText(/Voice typing is unavailable in this browser/)).toBeVisible()
  await page.locator('#mj-story').fill('Typing remains available.')
  await expect(page.locator('#mj-story')).toHaveValue('Typing remains available.')
})
