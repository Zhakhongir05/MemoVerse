import { test } from 'node:test'
import assert from 'node:assert/strict'
import { appendDictation, readSpeechResults } from './dictationText.js'

test('dictation appends without replacing typed text or adding unnecessary whitespace', () => {
  assert.equal(appendDictation('My story.', ' More words. '), 'My story. More words.')
  assert.equal(appendDictation('My story.\n', 'More words.'), 'My story.\nMore words.')
  assert.equal(appendDictation('', ' Hello '), 'Hello')
  assert.equal(appendDictation('Keep this', ' '), 'Keep this')
})
test('cumulative recognition results separate interim words from final text without duplication', () => {
  const result = (text, isFinal) => Object.assign([{ transcript: text }], { isFinal })
  const first = [result('A sunny day.', true), result('We walked', false)]
  assert.deepEqual(readSpeechResults(first), { final: 'A sunny day.', interim: 'We walked' })
  const final = [...first.slice(0, 1), result('We walked home.', true)]
  assert.deepEqual(readSpeechResults(final), { final: 'A sunny day. We walked home.', interim: '' })
  assert.deepEqual(readSpeechResults(final), readSpeechResults(final))
})
