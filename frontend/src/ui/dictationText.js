export function appendDictation(story, text) {
  const addition = text.trim()
  return addition ? `${story}${story && !/\s$/.test(story) ? ' ' : ''}${addition}` : story
}

export function readSpeechResults(results) {
  const final = [], interim = []
  for (const result of Array.from(results)) {
    const text = result[0]?.transcript?.trim()
    if (text) (result.isFinal ? final : interim).push(text)
  }
  return { final: final.join(' '), interim: interim.join(' ') }
}
