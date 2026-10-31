import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createDraftRecord, persistDraft } from './memoryStore.js'

function mockClient({ failUpload = false, failRow = false } = {}) {
  const calls = { uploads: [], rows: [], removes: [] }
  const client = {
    storage: { from: () => ({
      upload: async (path, file) => { calls.uploads.push({ path, file }); return { error: failUpload ? new Error('Upload failed') : null } },
      remove: async paths => { calls.removes.push(paths); return { error: null } },
    }) },
    from: () => ({ upsert: row => {
      calls.rows.push(row)
      return { select: () => ({ single: async () => ({ data: row, error: failRow ? new Error('Row failed') : null }) }) }
    } }),
  }
  return { calls, client }
}
const draft = overrides => ({ file: null, audioFile: null, description: '', mood: 'Nostalgic', scene: null, ...overrides })

test('partial text drafts save without a photograph or full description', async () => {
  const { calls, client } = mockClient()
  const record = createDraftRecord()
  await persistDraft({ userId: 'user-a', draft: draft({ description: 'Hi' }), record, client })
  assert.equal(calls.rows[0].description, 'Hi')
  assert.equal(calls.rows[0].photo_path, null)
  assert.equal(calls.rows[0].user_id, 'user-a')
  assert.equal(calls.uploads.length, 0)
})

test('audio-only input saves, then text edits reuse the row and uploaded audio', async () => {
  const { calls, client } = mockClient()
  const audioFile = new File(['voice'], 'voice.mp3', { type: 'audio/mpeg' })
  const record = createDraftRecord()
  await persistDraft({ userId: 'user-a', draft: draft({ audioFile }), record, client })
  await persistDraft({ userId: 'user-a', draft: draft({ audioFile, description: 'A new detail' }), record, client })
  assert.equal(calls.uploads.length, 1)
  assert.equal(calls.rows[0].id, calls.rows[1].id)
  assert.equal(calls.rows[0].audio_path, calls.rows[1].audio_path)
  assert.ok(calls.rows[0].audio_path.startsWith(`user-a/${record.id}/`))
})

test('replacing/removing a photo commits its path before cleaning obsolete files', async () => {
  const { calls, client } = mockClient()
  const record = createDraftRecord()
  await persistDraft({ userId: 'user-a', draft: draft({ file: new File(['a'], 'a.jpg') }), record, client })
  const oldPath = record.photoPath
  await persistDraft({ userId: 'user-a', draft: draft({ file: new File(['b'], 'b.jpg') }), record, client })
  assert.notEqual(record.photoPath, oldPath)
  assert.deepEqual(calls.removes[0], [oldPath])
  const replacedPath = record.photoPath
  await persistDraft({ userId: 'user-a', draft: draft({}), record, client })
  assert.equal(calls.rows[2].photo_path, null)
  assert.deepEqual(calls.removes[1], [replacedPath])
})

test('failed database saves clean new uploads and preserve the previous record for retry', async () => {
  const { calls, client } = mockClient({ failRow: true })
  const record = createDraftRecord()
  await assert.rejects(persistDraft({ userId: 'user-a', draft: draft({ file: new File(['a'], 'a.jpg') }), record, client }), /Row failed/)
  assert.equal(record.photoPath, null)
  assert.deepEqual(calls.removes[0], [calls.uploads[0].path])
})

test('upload failure never saves a row or reports a new asset path', async () => {
  const { calls, client } = mockClient({ failUpload: true })
  const record = createDraftRecord()
  await assert.rejects(persistDraft({ userId: 'user-a', draft: draft({ audioFile: new File(['a'], 'a.wav') }), record, client }), /Upload failed/)
  assert.equal(calls.rows.length, 0)
  assert.equal(record.audioPath, null)
})
