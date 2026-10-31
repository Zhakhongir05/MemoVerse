import { test } from 'node:test'
import assert from 'node:assert/strict'
import { boardThread, zoomCamera } from './timelineBoard.js'

test('zoom preserves the world point underneath the cursor', () => {
  const camera = { x: -120, y: 30, scale: 0.8 }
  const anchor = { x: 400, y: 200 }
  const zoomed = zoomCamera(camera, 1.5, anchor)
  assert.equal((anchor.x - zoomed.x) / zoomed.scale, (anchor.x - camera.x) / camera.scale)
  assert.equal((anchor.y - zoomed.y) / zoomed.scale, (anchor.y - camera.y) / camera.scale)
})

test('zoom clamps at 40% and 200%', () => {
  const camera = { x: 0, y: 0, scale: 1 }, anchor = { x: 200, y: 200 }
  assert.equal(zoomCamera(camera, 0.01, anchor).scale, 0.4)
  assert.equal(zoomCamera(camera, 5, anchor).scale, 2)
})

test('golden thread follows moved cards and multi-photo card heights', () => {
  const entries = [{ id: 'first', photos: [] }, { id: 'second', photos: [1, 2] }]
  const original = boardThread(entries, {})
  const moved = boardThread(entries, { second: { x: 800, y: 20 } })
  assert.notEqual(original, moved)
  assert.ok(moved.endsWith('922.5 307'))
  assert.equal(boardThread([], {}), '')
})
