import { test, expect } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const dist = fileURLToPath(new URL('../dist/', import.meta.url))
async function journal(page) {
  await page.route('**/*', async route => {
    const url = new URL(route.request().url())
    if (url.origin !== 'https://memoverse.test') return route.abort()
    const asset = url.pathname.startsWith('/assets/') ? url.pathname.slice(1) : 'index.html'
    await route.fulfill({ body: await readFile(path.resolve(dist, asset)), contentType: asset.endsWith('.js') ? 'text/javascript' : asset.endsWith('.css') ? 'text/css' : 'text/html' })
  })
  await page.goto('https://memoverse.test/')
  await page.getByRole('button', { name: 'Explore Memories', exact: true }).click()
  await page.getByRole('button', { name: 'Continue exploring without signing in' }).click()
}
test('Plans restores free allowance and transparent 15000-won unlimited checkout without card data or quota writes', async ({ page }, testInfo) => {
  const requests = []
  page.on('request', request => { if (request.method() !== 'GET') requests.push(request.url()) })
  await journal(page)
  await page.getByRole('button', { name: 'Plans', exact: true }).click()
  await expect(page.getByText('3 image-to-3D generations.', { exact: true })).toBeVisible()
  await expect(page.getByText('₩15,000', { exact: true })).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('plans-desktop.png'), fullPage: true })
  await page.getByRole('button', { name: 'Preview checkout', exact: true }).click()
  await expect(page.getByRole('dialog')).toContainText('No charge is made')
  await expect(page.getByRole('dialog').locator('input')).toHaveCount(0)
  await page.getByRole('button', { name: 'Complete preview · ₩15,000', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Preview complete', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Back to plans', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: 'your Free plan is unchanged' })).toBeVisible()
  expect(requests).toEqual([])
})
test('heart favorites persist through reload, have their own tab, and can be removed', async ({ page }, testInfo) => {
  await journal(page)
  await page.getByRole('button', { name: 'Create your first memory', exact: true }).click()
  await page.locator('#mj-title').fill('A favorite afternoon')
  await page.locator('#mj-story').fill('Sunlight fell across the table.')
  await page.getByRole('button', { name: 'Save journal entry', exact: false }).click()
  await page.getByRole('button', { name: '← Back to My Journal', exact: true }).click()
  await page.getByRole('button', { name: 'Add to favorites', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Remove from favorites', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await page.setViewportSize({ width: 390, height: 844 })
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.screenshot({ path: testInfo.outputPath('favorites-mobile.png'), fullPage: true })
  await page.reload()
  await page.getByRole('button', { name: 'Explore Memories', exact: true }).click()
  await page.getByRole('button', { name: 'Continue exploring without signing in' }).click()
  await page.getByRole('button', { name: 'Favorites', exact: true }).click()
  await expect(page.locator('.jh-current h1')).toHaveText('A favorite afternoon')
  await page.getByRole('button', { name: 'Remove from favorites', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Your favorites will be here.', exact: true })).toBeVisible()
})
