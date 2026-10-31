import { test, expect } from '@playwright/test'

function wav() {
  const rate = 8000, size = rate * 2, result = Buffer.alloc(44 + size)
  result.write('RIFF'); result.writeUInt32LE(36 + size, 4); result.write('WAVEfmt ', 8)
  result.writeUInt32LE(16, 16); result.writeUInt16LE(1, 20); result.writeUInt16LE(1, 22)
  result.writeUInt32LE(rate, 24); result.writeUInt32LE(rate * 2, 28); result.writeUInt16LE(2, 32); result.writeUInt16LE(16, 34)
  result.write('data', 36); result.writeUInt32LE(size, 40)
  return result
}
function ready(id = 'tour') {
  return { id, language: 'en', status: 'ready', next_step: 4, total_steps: 4,
    script: { chapters: ['Arrival', 'Rediscovery', 'Reflection'].map((title, i) => ({ order: i + 1, title, narration: `${title} narration`, subtitles: `${title} subtitle`, anchor_id: null, camera: null })) },
    audio: [1, 2, 3].map(order => ({ order, url: `http://127.0.0.1:5207/audio/${id}/${order}.wav`, expires_in: 900, duration_seconds: 1 })) }
}
async function setup(page, initial = null, options = {}) {
  let tour = initial, stale = !!options.stale, creates = 0, advances = 0, reads = 0, inFlight = 0, maxInFlight = 0
  await page.route('**/api/memorycast/**', async route => {
    expect(route.request().headers().authorization).toBe('Bearer fixture-A')
    const url = new URL(route.request().url()), post = route.request().method() === 'POST'
    if (!post) { reads++; return route.fulfill({ json: { tour, stale, generation_enabled: options.enabled !== false } }) }
    inFlight++; maxInFlight = Math.max(maxInFlight, inFlight)
    if (url.pathname.endsWith('/advance')) {
      advances++
      await new Promise(resolve => setTimeout(resolve, 40))
      if (options.fail) tour = { ...tour, status: options.fail, message: 'Owner review required.' }
      else if (advances === 4) tour = ready('generated')
      else tour = { ...tour, next_step: advances }
      inFlight--; return route.fulfill({ json: { tour, advanced: true } })
    }
    creates++
    const body = route.request().postDataJSON()
    expect(body.approved).toBe(true); expect(body.regenerate).toBe(stale)
    stale = false; tour = { id: 'generated', language: body.language, status: 'pending', next_step: 0, total_steps: 4 }
    inFlight--; return route.fulfill({ status: 202, json: { tour, fresh: true } })
  })
  let audioFailures = options.expired ? 1 : 0
  await page.route('**/audio/**', route => audioFailures-- > 0 ? route.fulfill({ status: 403, body: 'Expired' }) : route.fulfill({ contentType: 'audio/wav', body: wav() }))
  await page.goto('/e2e/memorycast-harness.html')
  return { stats: () => ({ creates, advances, reads, maxInFlight }) }
}
test('explicit generation advances sequentially, plays actual synthetic audio and replays without generation', async ({ page }) => {
  const f = await setup(page)
  await expect(page.getByRole('button', { name: 'Generate AI narration', exact: true })).toBeEnabled()
  expect(f.stats().creates).toBe(0)
  await page.getByRole('button', { name: 'Generate AI narration', exact: true }).click()
  await expect(page.getByRole('progressbar', { name: 'Narration generation progress' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Play narration', exact: true })).toBeVisible()
  expect(f.stats()).toMatchObject({ creates: 1, advances: 4, maxInFlight: 1 })
  await page.getByRole('button', { name: 'Play narration', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Pause narration' })).toBeVisible()
  await page.getByRole('button', { name: 'Pause narration' }).click()
  await expect(page.getByRole('button', { name: 'Play narration', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Rediscovery', exact: true }).click()
  await expect(page.getByLabel('Narration subtitles')).toHaveText('Rediscovery subtitle')
  await page.getByRole('button', { name: 'Play narration', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Reflection', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await page.evaluate(() => window.memorycastFixture.reopen())
  await expect(page.getByRole('button', { name: 'Play narration', exact: true })).toBeVisible()
  expect(f.stats()).toMatchObject({ creates: 1, advances: 4 })
})
for (const fail of ['failed', 'uncertain']) test(`${fail} jobs stop without paid retries`, async ({ page }) => {
  const f = await setup(page, null, { fail })
  await page.getByRole('button', { name: 'Generate AI narration', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Owner review')
  await page.waitForTimeout(300)
  expect(f.stats()).toMatchObject({ creates: 1, advances: 1 })
  await expect(page.getByRole('button', { name: /Generate AI narration/i })).toHaveCount(0)
})
test('expired audio refresh uses GET and never regenerates; account switch removes private playback', async ({ page }) => {
  const f = await setup(page, ready(), { expired: true })
  await page.getByRole('button', { name: 'Play narration', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('private link may have expired')
  const before = f.stats().reads
  await page.getByRole('button', { name: 'Refresh audio links' }).click()
  await expect(page.getByRole('alert')).toHaveCount(0)
  expect(f.stats().reads).toBeGreaterThan(before)
  await page.getByRole('button', { name: 'Play narration', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Pause narration' })).toBeVisible()
  await page.evaluate(() => { window.previousAudio = document.querySelector('audio'); window.memorycastFixture.switchAccount('B') })
  await expect(page.getByText(/Sign in and save this memory/)).toBeVisible()
  await expect(page.locator('audio')).toHaveCount(0)
  expect(await page.evaluate(() => window.previousAudio.paused)).toBe(true)
  expect(f.stats()).toMatchObject({ creates: 0, advances: 0 })
})
test('disabled generation permits saved replay and a changed memory requires explicit regeneration', async ({ page }) => {
  const f = await setup(page, ready(), { stale: true, enabled: false })
  await expect(page.getByRole('button', { name: 'Regenerate AI narration' })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Play narration', exact: true })).toBeEnabled()
  expect(f.stats().creates).toBe(0)
})
test('changed memories only regenerate after the explicitly labeled action', async ({ page }) => {
  const f = await setup(page, ready(), { stale: true })
  await expect(page.getByRole('button', { name: 'Regenerate AI narration' })).toBeEnabled()
  await page.getByRole('button', { name: 'Play narration', exact: true }).click()
  expect(f.stats().creates).toBe(0)
  await page.getByRole('button', { name: 'Regenerate AI narration' }).click()
  await expect(page.getByRole('button', { name: 'Play narration', exact: true })).toBeVisible()
  expect(f.stats()).toMatchObject({ creates: 1, advances: 4 })
})
test('opening a pending tour only reads status until the user continues', async ({ page }) => {
  const f = await setup(page, { id: 'pending', status: 'pending', language: 'en', next_step: 0, total_steps: 4 })
  await expect(page.getByRole('button', { name: 'Continue narration generation' })).toBeEnabled()
  await page.waitForTimeout(200)
  expect(f.stats()).toMatchObject({ creates: 0, advances: 0 })
  await page.getByRole('button', { name: 'Continue narration generation' }).click()
  await expect(page.getByRole('button', { name: 'Play narration', exact: true })).toBeVisible()
  expect(f.stats()).toMatchObject({ creates: 0, advances: 4 })
})
